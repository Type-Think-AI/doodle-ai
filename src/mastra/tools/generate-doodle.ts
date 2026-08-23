import { createTool } from "@mastra/core/tools";
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
  z.object({ status: z.literal("needs-key"), message: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

interface RequestContextValues {
  apiKey?: string;
  styleId?: string;
}

/**
 * Calls the same PicX generate/edit endpoint as src/pages/api/generate.ts,
 * reusing the same prompt builders from doodle-constants.ts. The PicX key
 * and the user's chosen visual style (Settings > Doodle defaults) are BYOK/
 * client-supplied per chat request, threaded in via RequestContext rather
 * than being tool inputs, since the model should never see or need to pass
 * either around.
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
    const apiKey = requestContext?.get("apiKey");

    if (!apiKey || !apiKey.trim()) {
      return { status: "needs-key" as const, message: "No PicX API key is set. Ask the user to add one in Settings." };
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
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
      if (!res.ok || !data.url) {
        return { status: "error" as const, message: data.detail || data.message || `PicX API error: ${res.status}` };
      }
      return { status: "ok" as const, url: data.url };
    } catch (err) {
      return { status: "error" as const, message: err instanceof Error ? err.message : "Generation failed" };
    }
  },
});
