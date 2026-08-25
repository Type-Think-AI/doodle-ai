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
  THEMES,
  VIRAL_MOOD_WORDS,
  type GenerationMode,
} from "../doodle-constants";

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
  const theme = THEMES.find((t) => t.id === options.styleId) || THEMES[0];
  const themeHint = `Apply this visual style distinctly: ${theme.styleHint}`;
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

/**
 * One PicX call, same endpoints and body shapes as generate-doodle.ts.
 * Never throws — a batch item's failure is data (an `error_code` on the row),
 * not an exception that should abort the sibling items running alongside it.
 */
export async function callPicx(
  platformKey: string,
  built: BuiltPrompt,
  images: { sourceUrl?: string | null; refUrl?: string | null },
): Promise<PicxCallResult> {
  const usePhoto = built.requiresPhoto && Boolean(images.sourceUrl);
  const url = usePhoto
    ? "https://api.picxstudio.com/v1/images/edit"
    : "https://api.picxstudio.com/v1/images/generate";
  const payload = usePhoto
    ? {
        model: "openai/gpt-image-2",
        instruction: built.prompt,
        image_urls: [images.sourceUrl, images.refUrl].filter((u): u is string => Boolean(u)),
        size: "1K",
        aspect_ratio: built.aspectRatio,
      }
    : { prompt: built.prompt, size: "1K", aspect_ratio: built.aspectRatio };

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
