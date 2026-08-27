import { createTool } from "@mastra/core/tools";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  buildCollagePrompt,
  buildDoodlePrompt,
  buildFullBodyCollagePrompt,
  buildGiftPrompt,
  buildMoodCaptionPrompt,
  buildStickerPrompt,
  GENERATION_MODES,
  pick,
  pickMany,
  SURPRISE_PROMPTS,
  THEMES,
  VIRAL_MOOD_WORDS,
} from "../../lib/doodle-constants";
import { refund, spend } from "../../lib/credits";
import { packBuilderFor, promptBuilderFor, type PackVariant } from "../../lib/prompts";
import { CREDITS_PER_IMAGE, creditCostForSkill, imageCountForSkill } from "../../lib/credits/costs";
import { kvIncrement } from "../../lib/kv-counter";
import type { Db } from "../../db/client";
import { asset, generation } from "../../db/schema/product";
import { orgLimits } from "../../db/schema/billing";
import { creditLedger } from "../../db/schema/billing";

const inputSchema = z.object({
  skill: z.enum(GENERATION_MODES).describe("Which doodle generation mode to run."),
  imageUrl: z
    .string()
    .optional()
    .describe("The uploaded photo's asset URL. Required for every skill except 'surprise'."),
  description: z
    .string()
    .optional()
    .describe(
      "Optional extra guidance from the user, used differently per skill: for 'surprise' it's the character " +
        "description; for 'gift' it's scanned for an occasion (e.g. 'birthday', 'thank you') that changes the " +
        "card's embellishments and message. Ignored by every other skill.",
    ),
  refImageUrl: z
    .string()
    .optional()
    .describe(
      "An extra style/composition reference image URL, if the user's message mentions one (e.g. a line starting " +
        "'Reference image: <url>'). Sent alongside the subject photo. Ignored for 'surprise' (no subject photo).",
    ),
});

const outputSchema = z.union([
  z.object({
    status: z.literal("ok"),
    /** The first image. Kept as a scalar so existing callers keep working. */
    url: z.string(),
    /**
     * Every image produced, in display order — one entry for a single-image
     * skill, several for a pack. Shorter than the skill's nominal image count
     * when some frames failed; the unproduced ones are refunded.
     */
    urls: z.array(z.string()),
  }),
  z.object({ status: z.literal("needs-photo"), message: z.string() }),
  z.object({ status: z.literal("insufficient-credits"), message: z.string(), balance: z.number(), required: z.number() }),
  z.object({ status: z.literal("rate-limited"), message: z.string() }),
  z.object({ status: z.literal("org-cap-reached"), message: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

interface RequestContextValues {
  /** Server-owned key used for every authenticated generation. */
  platformPicxKey?: string;
  styleId?: string;
  userId?: string;
  /** The acting member's team — every generation is charged to this org's pool, never the user's. */
  organizationId?: string;
  /** Optional project this generation belongs to; when set, a matching `asset` row is created on success. */
  projectId?: string;
  db?: Db;
  /**
   * The same KV namespace Better Auth uses as `secondaryStorage` (see
   * src/lib/auth/index.ts). Reused here rather than binding a second KV
   * namespace — this tool only needs `increment`, which that binding
   * already exposes directly.
   */
  sessions?: KVNamespace;
}

/** Generations a single signed-in user may start per minute. */
const GENERATIONS_PER_MINUTE = 8;
/** Default org-wide generation rate, overridable per org via org_limits.generationsPerMinute. */
const DEFAULT_ORG_GENERATIONS_PER_MINUTE = 40;

/**
 * A fixed-window counter keyed on the given id, backed directly by the
 * SESSIONS KV binding (not through Better Auth — this isn't an auth-route
 * request, so Better Auth's own `rateLimit` option never sees it).
 *
 * Fixed windows (as opposed to sliding) can let a burst of up to 2x the
 * limit through right across a window boundary; that's an accepted
 * trade-off for a single KV increment instead of tracking a timestamp list.
 * The bucket key includes the minute number, so a stale bucket just expires
 * on its own via the KV TTL rather than needing to be cleaned up.
 *
 * Returns true if the request should be allowed.
 */
async function checkRateLimit(sessions: KVNamespace, key: string, limit: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  // TTL of 2 windows: long enough that the counter is still there for the
  // full minute it's keyed to, short enough that KV doesn't accumulate a
  // bucket per user/org forever.
  const count = await kvIncrement(sessions, `${key}:${bucket}`, 120);
  return count <= limit;
}

/**
 * Calls PicX with the server-owned key and meters every generation against
 * the acting member's *team's* credit ledger — credits are org-owned, never
 * user-owned (see src/lib/credits/index.ts). The key and org/user context
 * are request-scoped values, never tool inputs, so the model cannot see or
 * supply credentials.
 */
export const generateDoodleTool = createTool({
  id: "generate-doodle",
  description:
    "Generates actual doodle image(s) for the given skill. Call this once you know which skill fits " +
    "and (for photo skills) have an uploaded photo's imageUrl. Returns hosted image URLs in `urls` on " +
    "success (`url` is the first of them). Most skills return exactly one image. The pack skills return " +
    "several from a single call and cost one credit per image: 'moods' and 'seasonal' return 4, " +
    "'expressions' returns 9. Call this ONCE for a pack — do not call it repeatedly to build up a set.",
  inputSchema,
  outputSchema,
  execute: async (input, toolContext) => {
    const requestContext = toolContext?.requestContext as
      | { get<K extends keyof RequestContextValues>(key: K): RequestContextValues[K] }
      | undefined;
    const platformKey = requestContext?.get("platformPicxKey");
    const userId = requestContext?.get("userId");
    const organizationId = requestContext?.get("organizationId");
    const projectId = requestContext?.get("projectId");
    const db = requestContext?.get("db");
    const sessions = requestContext?.get("sessions");

    if (!platformKey || !platformKey.trim()) {
      return { status: "error" as const, message: "Image generation is not configured on this server." };
    }
    if (!userId || !db) {
      return { status: "error" as const, message: "Sign in to generate a doodle." };
    }
    if (!organizationId) {
      return { status: "error" as const, message: "You're not in a team yet." };
    }

    // Two rate limits, both must pass, both checked before anything else
    // touches the ledger or writes a row — a rate-limited request must be a
    // pure no-op against both. The personal limit is checked first so one
    // member's runaway script trips their own bucket before it can trip the
    // whole team's. Neither is Better Auth's own `rateLimit` option (that
    // one only ever sees /api/auth/* requests) but both reuse the same KV
    // binding and the same kvIncrement() helper.
    if (sessions) {
      const personalOk = await checkRateLimit(sessions, `ratelimit:gen:${userId}`, GENERATIONS_PER_MINUTE);
      if (!personalOk) {
        return {
          status: "rate-limited" as const,
          message: "You're generating a bit fast — wait a moment and try again.",
        };
      }
      const orgLimitRows = await db
        .select({ generationsPerMinute: orgLimits.generationsPerMinute })
        .from(orgLimits)
        .where(eq(orgLimits.organizationId, organizationId));
      const orgLimit = orgLimitRows[0]?.generationsPerMinute ?? DEFAULT_ORG_GENERATIONS_PER_MINUTE;
      const orgOk = await checkRateLimit(sessions, `ratelimit:gen:org:${organizationId}`, orgLimit);
      if (!orgOk) {
        return {
          status: "rate-limited" as const,
          message: "Your team is generating a lot right now — wait a moment and try again.",
        };
      }
    }

    const requiresPhoto = input.skill !== "surprise";
    if (requiresPhoto && !input.imageUrl) {
      return { status: "needs-photo" as const, message: "This skill needs a photo. Ask the user to attach one." };
    }

    const styleId = requestContext?.get("styleId");
    const theme = THEMES.find((t) => t.id === styleId) || THEMES[0];
    const themeHint = `Apply this visual style distinctly: ${theme.styleHint}`;
    /**
     * Every image this run will produce, in display order. Single-image skills
     * yield exactly one entry, so the fan-out below has no special case for
     * them — a pack is just a longer list.
     */
    let variants: PackVariant[];
    let aspectRatio: "1:1" | "3:2";
    const packBuilder = packBuilderFor(input.skill);
    // Pack skills first: they own the multi-image path. Then single-image
    // modular skills (src/lib/prompts/), then the original seven's switch.
    if (packBuilder) {
      variants = packBuilder({ themeHint, styleHint: theme.styleHint, description: input.description });
      aspectRatio = "1:1";
    } else {
      const modularBuilder = promptBuilderFor(input.skill);
      if (modularBuilder) {
        variants = [
          {
            label: input.skill,
            prompt: modularBuilder({ themeHint, styleHint: theme.styleHint, description: input.description }),
          },
        ];
        // Every modular skill is square today. A future 3:2 one must declare its
        // aspect ratio next to its builder rather than have it assumed here.
        aspectRatio = "1:1";
      } else {
        let prompt: string;
        switch (input.skill) {
        case "collage":
          prompt = buildCollagePrompt();
          aspectRatio = "3:2";
          break;
        case "full-body":
          prompt = buildFullBodyCollagePrompt();
          aspectRatio = "3:2";
          break;
        case "stickers":
          prompt = buildStickerPrompt();
          aspectRatio = "1:1";
          break;
        case "mood-captions":
          prompt = buildMoodCaptionPrompt(pickMany(VIRAL_MOOD_WORDS, 6));
          aspectRatio = "3:2";
          break;
        case "gift":
          prompt = buildGiftPrompt(input.description);
          aspectRatio = "1:1";
          break;
        case "surprise": {
          const desc = input.description?.trim() || pick(SURPRISE_PROMPTS);
          prompt = `Create a naive doodle fashion-chibi avatar: ${desc}\n\nStyle: Bold graphic hair shapes, rough marker or dry-brush edges, restrained watercolor-like color, clean white or warm-white background, flat and expressive, fashion-forward. No photorealism, no 3D, no heavy shading, no text, no watermarks. Deliberately naive brushwork with playful asymmetry.\n\n${themeHint}`;
          aspectRatio = "1:1";
          break;
        }
        default:
          prompt = buildDoodlePrompt(themeHint);
          aspectRatio = "1:1";
        }
        variants = [{ label: input.skill, prompt }];
      }
    }

    // The charge is derived from IMAGES_PER_RUN, not from the array length, so a
    // builder that returned the wrong number of variants would otherwise
    // silently over- or under-charge. Fail loudly instead of mischarging.
    const expectedImages = imageCountForSkill(input.skill);
    if (variants.length !== expectedImages) {
      return {
        status: "error" as const,
        message: `Skill "${input.skill}" is priced for ${expectedImages} image(s) but produced ${variants.length}.`,
      };
    }

    // Kept for the generation row + logs: the first frame's instruction is the
    // representative one, and a pack's variants share their whole preamble.
    const prompt = variants[0].prompt;
    const cost = creditCostForSkill(input.skill);

    // Hard monthly credit cap, if the org's owner set one (org_limits.
    // monthlyCreditCap). Must run in the same request, immediately before
    // spend(), and must never be cached — this is the exact same
    // read-then-write shape as spend() itself, and safe for the exact same
    // reason (see the concurrency note in src/lib/credits/index.ts): D1's
    // single writer means the count below is still current when the spend
    // a few lines down lands.
    const capRows = await db
      .select({ monthlyCreditCap: orgLimits.monthlyCreditCap })
      .from(orgLimits)
      .where(eq(orgLimits.organizationId, organizationId));
    const cap = capRows[0]?.monthlyCreditCap;
    if (cap != null) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const spentRows = await db
        .select({ spent: sql<number>`coalesce(sum(-${creditLedger.delta}), 0)` })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.organizationId, organizationId),
            eq(creditLedger.reason, "generation"),
            gte(creditLedger.createdAt, monthStart),
          ),
        );
      const spentThisMonth = spentRows[0]?.spent ?? 0;
      if (spentThisMonth + cost > cap) {
        return {
          status: "org-cap-reached" as const,
          message: `Your team's monthly credit cap (${cap}) has been reached. Ask a team owner to raise it.`,
        };
      }
    }

    // Debit before generating — the concurrency argument for why this is
    // safe on D1 (and what changes if we ever move off it) lives in
    // src/lib/credits/index.ts. `generationId` doubles as both the ledger's
    // idempotency key and the generation row's primary key, so a spend and
    // its eventual refund are always traceable to the same attempt.
    const generationId = crypto.randomUUID();
    const spendResult = await spend(db, {
      organizationId,
      userId,
      amount: cost,
      reason: "generation",
      refId: generationId,
      idempotencyKey: `gen:${generationId}`,
    });
    if (!spendResult.ok) {
      return {
        status: "insufficient-credits" as const,
        message: `Your team needs ${spendResult.required} credit${spendResult.required === 1 ? "" : "s"} for this — it has ${spendResult.balance}.`,
        balance: spendResult.balance,
        required: spendResult.required,
      };
    }
    // Written *after* the debit succeeds, so a row only ever exists for a
    // generation credits were actually spent on — the reconciliation job
    // (src/lib/credits/reconcile.ts) refunds anything left `pending` too
    // long, which is only correct if every pending row really was charged.
    await db.insert(generation).values({
      id: generationId,
      userId,
      organizationId,
      projectId: projectId ?? null,
      skillId: input.skill,
      styleId: styleId ?? null,
      prompt,
      sourceAssetUrl: input.imageUrl ?? null,
      refAssetUrl: input.refImageUrl ?? null,
      creditsCharged: cost,
      status: "pending",
      createdAt: new Date(),
    });

    try {
      const endpoint =
        requiresPhoto && input.imageUrl
          ? "https://api.picxstudio.com/v1/images/edit"
          : "https://api.picxstudio.com/v1/images/generate";

      /**
       * One PicX call per variant, all in flight together — PicX has no `n`
       * parameter, so a pack is N independent calls. Settled rather than
       * all-or-nothing: a 9-frame pack losing one frame should still deliver
       * the other eight and refund only the frame that failed.
       */
      const settled = await Promise.all(
        variants.map(async (variant): Promise<string | null> => {
          const payload =
            requiresPhoto && input.imageUrl
              ? {
                  model: "openai/gpt-image-2",
                  instruction: variant.prompt,
                  image_urls: [input.imageUrl, input.refImageUrl].filter((u): u is string => Boolean(u)),
                  size: "1K",
                  aspect_ratio: aspectRatio,
                }
              : { prompt: variant.prompt, size: "1K", aspect_ratio: aspectRatio };
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = (await res.json().catch(() => ({}))) as {
              url?: string;
              detail?: string;
              message?: string;
            };
            if (!res.ok || !data.url) return null;
            return data.url;
          } catch {
            return null;
          }
        }),
      );

      const urls = settled.filter((u): u is string => Boolean(u));

      // Nothing came back — refund the whole run, exactly as the single-image
      // path always did.
      if (urls.length === 0) {
        const message = `PicX returned no image for ${variants.length === 1 ? "this generation" : `any of the ${variants.length} frames`}.`;
        await refundGeneration(db, generationId, organizationId, userId, message);
        return { status: "error" as const, message };
      }

      // Partial pack: credits were debited for every frame up front, so give
      // back the ones that never produced an image. Distinct idempotency key
      // from the full refund above, so the two can never collide — and safe to
      // retry, since applyDelta is keyed.
      const missing = variants.length - urls.length;
      if (missing > 0) {
        await refund(db, {
          organizationId,
          userId,
          amount: missing * CREDITS_PER_IMAGE,
          refId: generationId,
          idempotencyKey: `refund:${generationId}:partial`,
        });
      }

      await db
        .update(generation)
        .set({
          status: "ok",
          // First frame stays in output_url so every existing reader is
          // unaffected; the full set goes in output_urls (migration 0012).
          outputUrl: urls[0],
          outputUrls: variants.length > 1 ? JSON.stringify(urls) : null,
          creditsCharged: cost - missing * CREDITS_PER_IMAGE,
          completedAt: new Date(),
        })
        .where(eq(generation.id, generationId));
      // When this generation belongs to a project, it's also a project
      // deliverable — file it as a draft asset. Not batched with the update
      // above (mixed insert/update batches fight Drizzle's D1 batch typing
      // without real benefit here): this is a non-credit write, so a crash
      // between the two statements leaves an approved generation without an
      // asset row rather than corrupting the ledger — recoverable by
      // re-adding it to the project manually, not a correctness bug.
      // One row per frame, so a pack's frames are individually reviewable.
      if (projectId) {
        await db.insert(asset).values(
          urls.map((url) => ({
            id: crypto.randomUUID(),
            organizationId,
            projectId,
            url,
            kind: "generation" as const,
            generationId,
            reviewState: "draft" as const,
            createdBy: userId,
            createdAt: new Date(),
          })),
        );
      }

      return { status: "ok" as const, url: urls[0], urls };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      await refundGeneration(db, generationId, organizationId, userId, message);
      return { status: "error" as const, message };
    }
  },
});

/**
 * Reverses a spend for a generation that ultimately failed. Both the ledger
 * refund and the generation-row update are idempotency-keyed / predicated on
 * the row still being `pending`, so this is also what the hourly
 * reconciliation job (src/lib/credits/reconcile.ts) relies on being safe to
 * call again for the same row.
 */
async function refundGeneration(
  db: Db,
  generationId: string,
  organizationId: string,
  userId: string,
  errorMessage: string,
): Promise<void> {
  const row = await db.select({ creditsCharged: generation.creditsCharged }).from(generation).where(eq(generation.id, generationId));
  const creditsCharged = row[0]?.creditsCharged;
  if (creditsCharged) {
    await refund(db, {
      organizationId,
      userId,
      amount: creditsCharged,
      refId: generationId,
      idempotencyKey: `refund:${generationId}`,
    });
  }
  await db
    .update(generation)
    .set({ status: "refunded", errorCode: errorMessage.slice(0, 200), completedAt: new Date() })
    .where(and(eq(generation.id, generationId), eq(generation.status, "pending")));
}
