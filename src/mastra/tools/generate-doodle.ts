import { createTool } from "@mastra/core/tools";
import { eq } from "drizzle-orm";
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
import { creditCostForSkill } from "../../lib/credits/costs";
import type { Db } from "../../db/client";
import { generation } from "../../db/schema/product";

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
  z.object({ status: z.literal("ok"), url: z.string() }),
  z.object({ status: z.literal("needs-photo"), message: z.string() }),
  z.object({ status: z.literal("insufficient-credits"), message: z.string(), balance: z.number(), required: z.number() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

interface RequestContextValues {
  /** Server-owned key used for every authenticated generation. */
  platformPicxKey?: string;
  styleId?: string;
  userId?: string;
  db?: Db;
}

/**
 * Calls PicX with the server-owned key and meters every generation against the
 * signed-in user's credit ledger. The key and user context are request-scoped
 * values, never tool inputs, so the model cannot see or supply credentials.
 */
export const generateDoodleTool = createTool({
  id: "generate-doodle",
  description:
    "Generates an actual doodle image for the given skill. Call this once you know which skill fits " +
    "and (for photo skills) have an uploaded photo's imageUrl. Returns a hosted image URL on success.",
  inputSchema,
  outputSchema,
  execute: async (input, toolContext) => {
    const requestContext = toolContext?.requestContext as
      | { get<K extends keyof RequestContextValues>(key: K): RequestContextValues[K] }
      | undefined;
    const platformKey = requestContext?.get("platformPicxKey");
    const userId = requestContext?.get("userId");
    const db = requestContext?.get("db");

    if (!platformKey || !platformKey.trim()) {
      return { status: "error" as const, message: "Image generation is not configured on this server." };
    }
    if (!userId || !db) {
      return { status: "error" as const, message: "Sign in to generate a doodle." };
    }

    const requiresPhoto = input.skill !== "surprise";
    if (requiresPhoto && !input.imageUrl) {
      return { status: "needs-photo" as const, message: "This skill needs a photo. Ask the user to attach one." };
    }

    const styleId = requestContext?.get("styleId");
    const theme = THEMES.find((t) => t.id === styleId) || THEMES[0];
    const themeHint = `Apply this visual style distinctly: ${theme.styleHint}`;
    let prompt: string;
    let aspectRatio: "1:1" | "3:2";
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

    // Debit before generating — the concurrency argument for why this is
    // safe on D1 (and what changes if we ever move off it) lives in
    // src/lib/credits/index.ts. `generationId` doubles as both the ledger's
    // idempotency key and the generation row's primary key, so a spend and
    // its eventual refund are always traceable to the same attempt.
    const generationId = crypto.randomUUID();
    if (userId && db) {
      const cost = creditCostForSkill(input.skill);
      const spendResult = await spend(db, {
        userId,
        amount: cost,
        reason: "generation",
        refId: generationId,
        idempotencyKey: `gen:${generationId}`,
      });
      if (!spendResult.ok) {
        return {
          status: "insufficient-credits" as const,
          message: `You need ${spendResult.required} credit${spendResult.required === 1 ? "" : "s"} for this — you have ${spendResult.balance}.`,
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
        skillId: input.skill,
        styleId: styleId ?? null,
        prompt,
        sourceAssetUrl: input.imageUrl ?? null,
        refAssetUrl: input.refImageUrl ?? null,
        creditsCharged: cost,
        status: "pending",
        createdAt: new Date(),
      });
    }

    try {
      const url =
        requiresPhoto && input.imageUrl
          ? "https://api.picxstudio.com/v1/images/edit"
          : "https://api.picxstudio.com/v1/images/generate";
      const payload =
        requiresPhoto && input.imageUrl
          ? {
              model: "openai/gpt-image-2",
              instruction: prompt,
              image_urls: [input.imageUrl, input.refImageUrl].filter((u): u is string => Boolean(u)),
              size: "1K",
              aspect_ratio: aspectRatio,
            }
          : { prompt, size: "1K", aspect_ratio: aspectRatio };

      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
      if (!res.ok || !data.url) {
        const message = data.detail || data.message || `PicX API error: ${res.status}`;
        if (userId && db) await refundGeneration(db, generationId, userId, message);
        return { status: "error" as const, message };
      }
      if (userId && db) {
        await db
          .update(generation)
          .set({ status: "ok", outputUrl: data.url, completedAt: new Date() })
          .where(eq(generation.id, generationId));
      }
      return { status: "ok" as const, url: data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      if (userId && db) await refundGeneration(db, generationId, userId, message);
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
async function refundGeneration(db: Db, generationId: string, userId: string, errorMessage: string): Promise<void> {
  const row = await db.select({ creditsCharged: generation.creditsCharged }).from(generation).where(eq(generation.id, generationId));
  const creditsCharged = row[0]?.creditsCharged;
  if (creditsCharged) {
    await refund(db, { userId, amount: creditsCharged, refId: generationId, idempotencyKey: `refund:${generationId}` });
  }
  await db
    .update(generation)
    .set({ status: "refunded", errorCode: errorMessage.slice(0, 200), completedAt: new Date() })
    .where(eq(generation.id, generationId));
}
