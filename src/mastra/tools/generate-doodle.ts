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
  VIRAL_MOOD_WORDS,
} from "../../lib/doodle-constants";
import { resolveStyle } from "../../lib/style-choice";
import { resolveFamilyHint } from "../../lib/art-families";
import { refund, spend } from "../../lib/credits";
import { packBuilderFor, promptBuilderFor, type PackVariant } from "../../lib/prompts";
import { CREDITS_PER_IMAGE, creditCostForSkill, imageCountForSkill } from "../../lib/credits/costs";
import { kvIncrement } from "../../lib/kv-counter";
import type { Db } from "../../db/client";
import { generation, generationFrame } from "../../db/schema/product";
import { submitImage } from "../../lib/media/submit-image";
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
    /**
     * Queued upstream, NOT finished. Images are delivered by webhook, so this
     * tool returns as soon as PicX accepts the submit — there is no synchronous
     * render to wait for. The app shows a placeholder and swaps in each image as
     * it is delivered.
     */
    status: z.literal("queued"),
    /** The `generation` row id. The client watches GET /api/v1/videos/<jobId>. */
    jobId: z.string(),
    /** How many images this run will produce. */
    frames: z.number(),
    credits: z.number(),
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
  /**
   * Selected art-family id (src/lib/art-families.ts). Orthogonal to `styleId`,
   * which is the palette dial: this is the "what does it look like" dial. Absent
   * or unknown resolves to no hint (the doodle default), so a request that never
   * sets it produces the exact prompt it did before. Set from the composer's
   * family chip the same way `styleId` is set from the theme picker.
   */
  familyId?: string;
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
  /**
   * Public https origin PicX delivers finished images to. Required: images are
   * webhook-only now, so without somewhere to deliver to there is no way to
   * complete a generation and the request is refused before any credit is spent.
   */
  publicOrigin?: string;
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
    "Starts doodle image generation for the given skill. Call this once you know which skill fits " +
    "and (for photo skills) have an uploaded photo's imageUrl. This is ASYNCHRONOUS: it returns " +
    "immediately with status 'queued' and a jobId, and the finished image appears in the user's chat " +
    "by itself a few seconds later. Tell the user it is being drawn and then STOP — do not call this " +
    "again for the same request, do not claim the image is ready, and never paste a URL (you have not " +
    "seen the result). Most skills produce one image. The pack skills produce several from a single " +
    "call and cost one credit per image: 'moods' and 'seasonal' produce 4, 'expressions' 9. Call this " +
    "ONCE for a pack — do not call it repeatedly to build up a set.",
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
    const publicOrigin = (requestContext?.get("publicOrigin") ?? "").trim().replace(/\/$/, "");

    if (!platformKey || !platformKey.trim()) {
      return { status: "error" as const, message: "Image generation is not configured on this server." };
    }
    /* Checked before any spend. Images are delivered by webhook only, so a
       non-public origin means the result could never come back — better to refuse
       than to charge for a render nobody can receive. Locally this is what
       PICX_CALLBACK_ORIGIN + a tunnel provides. */
    if (!publicOrigin.startsWith("https://")) {
      return {
        status: "error" as const,
        message:
          "Image generation needs a public https address to receive finished images. " +
          "Set PICX_CALLBACK_ORIGIN to your tunnel URL for local development.",
      };
    }
    const callbackUrl = `${publicOrigin}/api/webhooks/picx`;
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
    /* Resolved centrally so "none" and "custom:#RRGGBB" are honoured. A bare
       THEMES.find(...) || THEMES[0] here would silently render both as Pastel. */
    const resolvedStyle = resolveStyle(styleId);
    /* The art family is the second, orthogonal dial (see src/lib/art-families.ts):
       the palette/theme says what colours, the family says what it LOOKS like.
       Empty for the doodle default and for any unset/unknown id, so folding it in
       is a no-op on the no-selection path — an existing user sees zero change.
       Appended to BOTH hints so every downstream builder (pack, modular, the
       original switch, surprise and the default doodle) inherits it without a
       per-branch edit, exactly the way one family chip is meant to change every
       still at once. */
    const familyHint = resolveFamilyHint(requestContext?.get("familyId"), "image");
    const themeHint = familyHint ? `${resolvedStyle.themeHint}\n\n${familyHint}` : resolvedStyle.themeHint;
    const styleHint = familyHint ? `${resolvedStyle.styleHint}\n\n${familyHint}` : resolvedStyle.styleHint;
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
      variants = packBuilder({ themeHint, styleHint, description: input.description });
      aspectRatio = "1:1";
    } else {
      const modularBuilder = promptBuilderFor(input.skill);
      if (modularBuilder) {
        variants = [
          {
            label: input.skill,
            prompt: modularBuilder({ themeHint, styleHint, description: input.description }),
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
      kind: "image",
      createdAt: new Date(),
    });

    try {
      /**
       * One SUBMIT per variant, all in flight together — PicX has no `n`
       * parameter, so a pack is N independent renders. Each submit returns a PicX
       * generation id in milliseconds; nothing here waits for an image.
       *
       * Settled rather than all-or-nothing: a 9-frame pack whose second submit is
       * rejected should still queue the other eight and refund only that frame.
       */
      const submitted = await Promise.all(
        variants.map((variant) =>
          submitImage(
            platformKey,
            {
              prompt: variant.prompt,
              aspectRatio,
              imageUrl: requiresPhoto ? input.imageUrl : undefined,
              refImageUrl: requiresPhoto ? input.refImageUrl : undefined,
            },
            callbackUrl,
          ),
        ),
      );

      const accepted = submitted.filter((s) => s.ok).length;

      // Nothing was even accepted upstream, so there is nothing to wait for —
      // refund the whole run now rather than leaving a row for the sweep.
      if (accepted === 0) {
        const firstError = submitted.find((s) => !s.ok);
        const reason = firstError && !firstError.ok ? firstError.error : "submit_failed";
        const message =
          reason === "picx_platform_credits_exhausted"
            ? "Image generation is temporarily unavailable on this server."
            : `Couldn't start this generation (${reason}). Your credits weren't charged.`;
        await refundGeneration(db, generationId, organizationId, userId, message);
        return { status: "error" as const, message };
      }

      /* One frame row per variant, carrying the id the webhook will correlate on.
         Written after the submits because a delivery cannot arrive before its own
         submit returns, and writing them first would leave frame rows for calls
         that never happened. */
      const now = new Date();
      await db.insert(generationFrame).values(
        variants.map((variant, idx) => {
          const result = submitted[idx];
          return {
            id: crypto.randomUUID(),
            generationId,
            idx,
            picxGenerationId: result.ok ? result.picxGenerationId : null,
            prompt: variant.prompt,
            status: result.ok ? ("pending" as const) : ("failed" as const),
            errorCode: result.ok ? null : result.error.slice(0, 200),
            createdAt: now,
          };
        }),
      );

      /* Frames PicX refused will never be delivered, so refund them immediately
         instead of making the user wait for a sweep. Keyed distinctly from the
         whole-run refund so the two can never collide. */
      const rejected = variants.length - accepted;
      if (rejected > 0) {
        await refund(db, {
          organizationId,
          userId,
          amount: rejected * CREDITS_PER_IMAGE,
          refId: generationId,
          idempotencyKey: `refund:${generationId}:submit-rejected`,
        });
        await db
          .update(generation)
          .set({ creditsCharged: cost - rejected * CREDITS_PER_IMAGE })
          .where(eq(generation.id, generationId));
      }

      /* The row stays 'pending'. src/pages/api/webhooks/picx.ts completes each
         frame as it is delivered and rolls the generation up to 'ok' — including
         the project asset rows, which now belong to the delivery path rather than
         here, because that is where a URL first exists. */
      return {
        status: "queued" as const,
        jobId: generationId,
        frames: accepted,
        credits: cost - rejected * CREDITS_PER_IMAGE,
      };
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
