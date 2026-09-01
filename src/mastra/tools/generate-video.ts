/* The agent's video tool.
 *
 * Structurally the same as generate-doodle.ts — rate limit, org cap, debit,
 * write the row, call PicX, refund on failure — with ONE deliberate difference:
 * it does not wait for the result. `POST /v1/videos/generate` is async-only and
 * a clip takes 40 seconds to several minutes, so waiting would hold the model's
 * tool call, the chat stream and the Worker invocation open for the whole
 * render. Instead this returns `queued` with a job id the moment PicX accepts
 * the submit, the webhook (src/pages/api/webhooks/picx.ts) completes the row
 * when the clip lands, and the browser watches our own row.
 *
 * That is why the credit is debited here and the row is written 'pending': the
 * spend happens at submit time, and exactly one of three things later settles
 * it — the webhook completing it, the webhook refunding it, or the hourly sweep
 * refunding it if no delivery ever arrives. All three use the idempotency key
 * `refund:<generationId>`, so they cannot double-refund each other.
 */
import { createTool } from "@mastra/core/tools";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveStyle } from "../../lib/style-choice";
import { refund, spend } from "../../lib/credits";
import { kvIncrement } from "../../lib/kv-counter";
import type { Db } from "../../db/client";
import { generation } from "../../db/schema/product";
import { creditLedger, orgLimits } from "../../db/schema/billing";
import {
  clampVideoSeconds,
  DEFAULT_VIDEO_RESOLUTION,
  MAX_VIDEO_REFERENCES,
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
  VIDEO_ESTIMATED_SECONDS,
  videoCreditCost,
} from "../../lib/video/constants";
import { videoPromptBuilderFor } from "../../lib/video/prompts";
import { resolveFamilyHint } from "../../lib/art-families";
import { VIDEO_SKILL_IDS, videoSkillConfig, type VideoSkillId } from "../../lib/video/skills";
import { submitVideo } from "../../lib/video/submit";

/* Every field carries a .describe(). This is not documentation politeness: the
   descriptions ARE the JSON schema the model sees, and a parameter without one
   arrives as a bare nullable that the model routinely omits. That exact gap once
   made every clip come back at the default length no matter what the user asked
   for — the signature was correct the whole time and no type check could see it. */
const inputSchema = z.object({
  skill: z
    .enum(VIDEO_SKILL_IDS)
    .describe(
      "Which video skill to run. 'motion' animates ONE exact image the user already has (that " +
        "picture becomes the first frame — use it for 'make this move'). 'reel' makes a NEW short " +
        "clip starring the character from one or more reference images (likeness is kept, the shot " +
        "is new — use it for 'make a clip of this character doing X').",
    ),
  imageUrl: z
    .string()
    .optional()
    .describe(
      "For skill 'motion': the hosted URL of the image to animate — normally the doodle you just " +
        "generated, or the user's attached photo. This picture becomes frame one.",
    ),
  referenceUrls: z
    .array(z.string())
    .optional()
    .describe(
      `For skill 'reel': 1 to ${MAX_VIDEO_REFERENCES} hosted image URLs showing what the character ` +
        "looks like — usually doodles you generated earlier in this conversation. They are cited in " +
        "order, so put the clearest full view first. These define the character, NOT the shot.",
    ),
  seconds: z
    .number()
    .int()
    .optional()
    .describe(
      `Clip length in seconds, ${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}. ALWAYS pass this when the ` +
        `user names a length ("make it 10 seconds") — omitting it silently produces the shortest ` +
        `clip. Costs one credit per second, so do not pick a long clip the user did not ask for.`,
    ),
  description: z
    .string()
    .optional()
    .describe(
      "What should happen in the clip, in the user's own terms (e.g. 'waving from a scooter', " +
        "'blowing out birthday candles'). Drives the motion and the staging. Omit it and the skill " +
        "uses its own sensible default action.",
    ),
});

const outputSchema = z.union([
  z.object({
    status: z.literal("queued"),
    /** Our generation id. The client polls GET /api/v1/videos/<jobId>. */
    jobId: z.string(),
    seconds: z.number(),
    credits: z.number(),
    estimatedSeconds: z.number(),
  }),
  z.object({ status: z.literal("needs-photo"), message: z.string() }),
  z.object({
    status: z.literal("insufficient-credits"),
    message: z.string(),
    balance: z.number(),
    required: z.number(),
  }),
  z.object({ status: z.literal("rate-limited"), message: z.string() }),
  z.object({ status: z.literal("org-cap-reached"), message: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

interface RequestContextValues {
  platformPicxKey?: string;
  styleId?: string;
  /**
   * Selected art-family id (src/lib/art-families.ts) — the "what does it look
   * like" dial, orthogonal to `styleId`, which is the palette. Absent or unknown
   * resolves to no hint, so an animation requested by a client that never sends
   * it renders exactly as it did before the family chip existed.
   */
  familyId?: string;
  userId?: string;
  organizationId?: string;
  projectId?: string;
  db?: Db;
  sessions?: KVNamespace;
  /**
   * Public https origin of THIS deployment, taken from the incoming request so
   * staging and production each call themselves back with no per-environment
   * config. The callback URL is built from it; without it there is nowhere for
   * PicX to deliver to and the submit is refused before any credit is spent.
   */
  publicOrigin?: string;
}

/** Clips a single user may start per minute. Lower than images: each one is minutes of provider time. */
const VIDEOS_PER_MINUTE = 3;
/** Default org-wide clip rate. Reuses org_limits.generationsPerMinute for the org ceiling. */
const DEFAULT_ORG_VIDEOS_PER_MINUTE = 12;

async function checkRateLimit(sessions: KVNamespace, key: string, limit: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const count = await kvIncrement(sessions, `${key}:${bucket}`, 120);
  return count <= limit;
}

export const generateVideoTool = createTool({
  id: "generate-video",
  description:
    "Generates a short hand-drawn video clip (5-15 seconds, with sound) from an image the user " +
    "already has. Use 'motion' to animate one exact picture, or 'reel' to make a new clip starring " +
    "the character from reference images. This is ASYNCHRONOUS: it returns immediately with a job " +
    "id and status 'queued', and the clip appears in the user's chat by itself in about a minute. " +
    "Tell the user it is rendering and then STOP — do not call this again for the same request, and " +
    "do not claim the clip is ready. Costs one credit per second, so a 5-second clip costs 5 " +
    "credits where an image costs 1.",
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
      return { status: "error" as const, message: "Video generation isn't configured on this server." };
    }
    if (!userId || !db) return { status: "error" as const, message: "Sign in to make a clip." };
    if (!organizationId) return { status: "error" as const, message: "You're not in a team yet." };
    // Checked before any spend: a clip with nowhere to be delivered would sit
    // 'pending' until the sweep refunded it half an hour later, which looks to
    // the user like a silent failure that took their credits in the meantime.
    if (!publicOrigin.startsWith("https://")) {
      return {
        status: "error" as const,
        message: "Video needs a public https deployment to receive the finished clip. Not available here.",
      };
    }

    const skillId = input.skill as VideoSkillId;
    const config = videoSkillConfig(skillId);

    // Rate limits first, personal before org, so one member's runaway loop trips
    // their own bucket before the team's. Same shape as generate-doodle.ts.
    if (sessions) {
      if (!(await checkRateLimit(sessions, `ratelimit:vid:${userId}`, VIDEOS_PER_MINUTE))) {
        return {
          status: "rate-limited" as const,
          message: "That's a lot of clips at once — give the last one a moment to finish.",
        };
      }
      const orgLimitRows = await db
        .select({ generationsPerMinute: orgLimits.generationsPerMinute })
        .from(orgLimits)
        .where(eq(orgLimits.organizationId, organizationId));
      const orgLimit = orgLimitRows[0]?.generationsPerMinute ?? DEFAULT_ORG_VIDEOS_PER_MINUTE;
      if (!(await checkRateLimit(sessions, `ratelimit:vid:org:${organizationId}`, orgLimit))) {
        return {
          status: "rate-limited" as const,
          message: "Your team is rendering a lot right now — try again in a minute.",
        };
      }
    }

    const references = (input.referenceUrls ?? []).filter((u) => Boolean(u?.trim()));
    if (config.mode === "image" && !input.imageUrl) {
      return {
        status: "needs-photo" as const,
        message: "This needs the image to animate. Generate or ask for a doodle first, then pass its URL as imageUrl.",
      };
    }
    if (config.mode === "reference" && references.length === 0) {
      return {
        status: "needs-photo" as const,
        message: "This needs at least one reference image of the character. Pass them as referenceUrls.",
      };
    }

    const seconds = clampVideoSeconds(input.seconds ?? config.defaultSeconds);
    const resolution = DEFAULT_VIDEO_RESOLUTION;
    const cost = videoCreditCost(seconds, resolution);

    const styleId = requestContext?.get("styleId");
    const resolvedStyle = resolveStyle(styleId);
    /* Art family (doodle / anime). Resolves to "" for an unset or unknown id, so
       an animation made before the chip existed renders exactly as it did. */
    const familyHint = resolveFamilyHint(requestContext?.get("familyId"), "video");
    const prompt = videoPromptBuilderFor(skillId)({
      themeHint: resolvedStyle.themeHint,
      styleHint: resolvedStyle.styleHint,
      familyHint,
      description: input.description,
    });

    // Monthly org cap, read immediately before the spend for the same reason
    // generate-doodle.ts does it here: D1's single writer means this count is
    // still current when the debit lands a few lines down.
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
      if ((spentRows[0]?.spent ?? 0) + cost > cap) {
        return {
          status: "org-cap-reached" as const,
          message: `Your team's monthly credit cap (${cap}) has been reached. Ask a team owner to raise it.`,
        };
      }
    }

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
        message: `A ${seconds}-second clip costs ${cost} credits — your team has ${spendResult.balance}.`,
        balance: spendResult.balance,
        required: spendResult.required,
      };
    }

    const submitted = await submitVideo(
      platformKey,
      {
        prompt,
        mode: config.mode,
        imageUrl: input.imageUrl,
        referenceUrls: references,
        seconds,
        resolution,
        aspectRatio: config.aspectRatio,
      },
      `${publicOrigin}/api/webhooks/picx`,
    );

    if (!submitted.ok) {
      // Nothing is queued upstream, so refund immediately rather than writing a
      // 'pending' row that would wait half an hour to be swept. Same key the
      // webhook and the sweep would use, so this can never double-refund.
      await refund(db, {
        organizationId,
        userId,
        amount: cost,
        refId: generationId,
        idempotencyKey: `refund:${generationId}`,
      });
      const message =
        submitted.error === "picx_platform_credits_exhausted"
          ? "Video generation is temporarily unavailable on this server."
          : `Couldn't start the clip (${submitted.error}). Your credits weren't charged.`;
      return { status: "error" as const, message };
    }

    // Written only after the submit succeeded, so a 'pending' video row always
    // corresponds to real work in flight upstream — which is exactly what the
    // reconciliation sweep assumes when it decides a row has waited too long.
    await db.insert(generation).values({
      id: generationId,
      userId,
      organizationId,
      projectId: projectId ?? null,
      skillId,
      styleId: styleId ?? null,
      prompt,
      sourceAssetUrl: input.imageUrl ?? references[0] ?? null,
      refAssetUrl: config.mode === "reference" ? (references[1] ?? null) : null,
      creditsCharged: cost,
      status: "pending",
      kind: "video",
      picxGenerationId: submitted.picxGenerationId,
      durationSeconds: seconds,
      resolution,
      videoMode: config.mode,
      /* Poster (first-frame still), migration 0018. In 'image' mode the image
         the user handed us IS literally frame one of the clip (PicX H3 Max
         image mode), so it is the exact poster and is free to record here at
         submit time. For 'reference' and 'text' frame one is a NEW composition
         that does not exist yet, so poster_url stays NULL — a reference image is
         not the first frame and must NOT be substituted as one, that would be
         wrong data. The webhook cannot fill it in later either: PicX's delivery
         payload carries no first-frame field (see completeVideoGeneration). */
      posterUrl: config.mode === "image" ? (input.imageUrl ?? null) : null,
      createdAt: new Date(),
    });

    return {
      status: "queued" as const,
      jobId: generationId,
      seconds,
      credits: cost,
      estimatedSeconds: VIDEO_ESTIMATED_SECONDS,
    };
  },
});
