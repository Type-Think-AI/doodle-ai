/* Prompt construction for batch/variant generation.
 *
 * This is a deliberate, small duplication of the switch inside
 * src/mastra/tools/generate-doodle.ts. Batch items do NOT go through the
 * Mastra agent/tool machinery — a fan-out loop has no conversation, no model
 * turn and no tool call to make, and dragging an agent runtime into
 * `waitUntil` for N images would cost far more than it buys. What batch does
 * need is exactly the *prompt shape* the single-generation path produces, so
 * that a batch variant is indistinguishable from a hand-made one.
 *
 * The duplication is also what makes variants variants: several of the
 * builders in doodle-constants.ts randomize on every call (pose sets, doodle
 * themes, mood words, sticker layouts). Calling this function once per item
 * with identical inputs therefore yields N genuinely different prompts —
 * that randomization is the entire variant mechanism, not a side effect.
 */
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
  type GenerationMode,
} from "../doodle-constants";
import { resolveStyle } from "../style-choice";

export type AspectRatio = "1:1" | "3:2";

export interface BuiltPrompt {
  prompt: string;
  aspectRatio: AspectRatio;
  /** Every skill except 'surprise' edits an existing photo rather than generating from scratch. */
  requiresPhoto: boolean;
}

export function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === "string" && (GENERATION_MODES as readonly string[]).includes(value);
}

/** Skills that can run without a source photo. Mirrors generate-doodle.ts. */
export function skillRequiresPhoto(skillId: string): boolean {
  return skillId !== "surprise";
}

export function buildBatchPrompt(
  skillId: string,
  options: { styleId?: string | null; description?: string | null },
): BuiltPrompt {
  const resolvedStyle = resolveStyle(options.styleId);
  const themeHint = resolvedStyle.themeHint;
  const description = options.description ?? undefined;

  switch (skillId) {
    case "collage":
      return { prompt: buildCollagePrompt(), aspectRatio: "3:2", requiresPhoto: true };
    case "full-body":
      return { prompt: buildFullBodyCollagePrompt(), aspectRatio: "3:2", requiresPhoto: true };
    case "stickers":
      return { prompt: buildStickerPrompt(), aspectRatio: "1:1", requiresPhoto: true };
    case "mood-captions":
      return {
        prompt: buildMoodCaptionPrompt(pickMany(VIRAL_MOOD_WORDS, 6)),
        aspectRatio: "3:2",
        requiresPhoto: true,
      };
    case "gift":
      return { prompt: buildGiftPrompt(description), aspectRatio: "1:1", requiresPhoto: true };
    case "surprise": {
      const desc = description?.trim() || pick(SURPRISE_PROMPTS);
      return {
        prompt: `Create a naive doodle fashion-chibi avatar: ${desc}\n\nStyle: Bold graphic hair shapes, rough marker or dry-brush edges, restrained watercolor-like color, clean white or warm-white background, flat and expressive, fashion-forward. No photorealism, no 3D, no heavy shading, no text, no watermarks. Deliberately naive brushwork with playful asymmetry.\n\n${themeHint}`,
        aspectRatio: "1:1",
        requiresPhoto: false,
      };
    }
    default:
      return { prompt: buildDoodlePrompt(themeHint), aspectRatio: "1:1", requiresPhoto: true };
  }
}

export interface PicxCallResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Endpoint and body for one PicX image call, shared by the sync and async paths. */
function buildRequest(
  built: BuiltPrompt,
  images: { sourceUrl?: string | null; refUrl?: string | null },
): { url: string; payload: Record<string, unknown> } {
  const usePhoto = built.requiresPhoto && Boolean(images.sourceUrl);
  const url = usePhoto
    ? "https://api.picxstudio.com/v1/images/edit"
    : "https://api.picxstudio.com/v1/images/generate";
  const payload: Record<string, unknown> = usePhoto
    ? {
        model: "openai/gpt-image-2",
        instruction: built.prompt,
        image_urls: [images.sourceUrl, images.refUrl].filter((u): u is string => Boolean(u)),
        size: "1K",
        aspect_ratio: built.aspectRatio,
      }
    : { prompt: built.prompt, size: "1K", aspect_ratio: built.aspectRatio };
  return { url, payload };
}

/**
 * One PicX call, same endpoints and body shapes as generate-doodle.ts.
 * Never throws — a batch item's failure is data (an `error_code` on the row),
 * not an exception that should abort the sibling items running alongside it.
 *
 * This is the SYNCHRONOUS path: it waits out the whole render. Still used when
 * no webhook secret is configured — see `submitPicxAsync` and the branch in
 * run.ts for why that fallback exists.
 */
export async function callPicx(
  platformKey: string,
  built: BuiltPrompt,
  images: { sourceUrl?: string | null; refUrl?: string | null },
): Promise<PicxCallResult> {
  const { url, payload } = buildRequest(built, images);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
    if (!res.ok || !data.url) {
      return { ok: false, error: data.detail || data.message || `PicX API error: ${res.status}` };
    }
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}

export interface PicxSubmitResult {
  ok: boolean;
  /** PicX's generation id, from the 202 body. The webhook correlates on this. */
  generationId?: string;
  error?: string;
}

/**
 * Submit a render and return as soon as PicX accepts it, without waiting for
 * the image. PicX answers `202` and later POSTs the result to `callbackUrl`.
 *
 * This is what removes the eviction hazard documented at the top of run.ts: the
 * old flow needed the isolate to survive every render inside `waitUntil`, and an
 * evicted isolate silently stopped whatever had not finished. Submitting takes
 * milliseconds, so the fan-out now completes long before eviction is plausible,
 * and the results land as independent inbound requests that do not depend on any
 * isolate still being alive.
 *
 * Requires `picx-ai`-era API behaviour (async images shipped 2026-08-25). An
 * older deployment ignores the unknown `callback_url` and answers `200` with a
 * finished image instead of `202`; that is detected here and reported as a
 * failure rather than mistaken for a queued job, because silently treating a
 * finished image as pending would strand the item until the sweep refunded it.
 *
 * Never throws, for the same reason as `callPicx`.
 */
export async function submitPicxAsync(
  platformKey: string,
  built: BuiltPrompt,
  images: { sourceUrl?: string | null; refUrl?: string | null },
  callbackUrl: string,
): Promise<PicxSubmitResult> {
  const { url, payload } = buildRequest(built, images);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, callback_url: callbackUrl }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      url?: string;
      detail?: string;
      message?: string;
    };

    if (!res.ok) {
      return { ok: false, error: data.detail || data.message || `PicX API error: ${res.status}` };
    }
    if (res.status !== 202 || !data.id) {
      // A 200 with a `url` means the deployment predates async images.
      return {
        ok: false,
        error: data.url
          ? "picx_async_unsupported"
          : data.detail || data.message || "PicX accepted the request but returned no generation id",
      };
    }
    return { ok: true, generationId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Submit failed" };
  }
}
