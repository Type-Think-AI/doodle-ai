/* One-off: generate real thumbnails for the 5 new skills.
 *
 * Two stages, because every new skill is `requiresPhoto: true` and the
 * marketplace thumbnail must be a genuine output of the skill (not a
 * placeholder — see the thumbnailUrl doc in src/lib/skill-loader.ts):
 *
 *   1. Synthesize three SUBJECT photos via /v1/images/generate — a single
 *      portrait, a couple, and a pet with its owner. Synthetic subjects, so no
 *      real person's face ends up on a public marketplace card.
 *   2. Run each skill's ACTUAL prompt builder against the right subject via
 *      /v1/images/edit — the same call path generate-doodle.ts uses.
 *
 * Run: node --experimental-strip-types scripts/generate-skill-thumbnails.ts
 */

import { readFileSync } from "node:fs";
import { buildMiniMePrompt } from "../src/lib/prompts/chibi-mini-me.ts";
import { buildCrayonPrompt } from "../src/lib/prompts/crayon-self.ts";
import { buildCouplePrompt } from "../src/lib/prompts/couple-doodle.ts";
import { buildPetPortraitPrompt } from "../src/lib/prompts/pet-portrait.ts";
import { buildFacelessPortraitPrompt } from "../src/lib/prompts/faceless-portrait.ts";

const API = "https://api.picxstudio.com/v1";

const key =
  process.env.PICX_API_KEY?.trim() ||
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="))
    ?.slice("PICX_API_KEY=".length)
    .trim();
if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");

const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(`${path} ${res.status}: ${data.detail || data.message || "no url"}`);
  }
  return data.url;
}

const PHOTOREAL =
  "Sharp photorealistic photograph, natural daylight, shallow depth of field, real skin texture, " +
  "shot on a 50mm lens. Not an illustration, not a cartoon, not a 3D render.";

const SUBJECTS = {
  solo:
    `Candid photographic portrait of one cheerful young woman with shoulder-length curly dark hair, ` +
    `round glasses, small gold hoop earrings, wearing a mustard-yellow sweatshirt, standing against a ` +
    `plain warm-grey wall, head and shoulders visible. ${PHOTOREAL}`,
  couple:
    `Candid photograph of a happy couple standing close together outdoors, arms around each other's ` +
    `shoulders, laughing. On the left a man with short black hair and a trimmed beard in a denim jacket; ` +
    `on the right a shorter woman with long straight auburn hair in a cream cardigan. ${PHOTOREAL}`,
  pet:
    `Candid photograph of a smiling young man with a buzz cut in a plain green t-shirt crouching and ` +
    `holding a happy tan-and-white corgi with one folded ear and a distinctive white chest patch. Both ` +
    `looking at the camera, grassy park background. ${PHOTOREAL}`,
} as const;

const themeHint = "Apply this visual style distinctly: soft pastel palette, gentle warm tones, airy and cheerful.";
const styleHint = "soft pastel palette, gentle warm tones, airy and cheerful";

async function main() {
  console.log("Stage 1 — synthesizing subject photos...");
  const subjectEntries = await Promise.all(
    Object.entries(SUBJECTS).map(async ([name, prompt]) => {
      const url = await post("/images/generate", { prompt, size: "1K", aspect_ratio: "1:1" });
      console.log(`  ${name}: ${url}`);
      return [name, url] as const;
    }),
  );
  const subjects = Object.fromEntries(subjectEntries) as Record<keyof typeof SUBJECTS, string>;

  const jobs = [
    { id: "mini-me", subject: subjects.solo, prompt: buildMiniMePrompt({ themeHint }) },
    { id: "crayon", subject: subjects.solo, prompt: buildCrayonPrompt({ themeHint }) },
    { id: "couple", subject: subjects.couple, prompt: buildCouplePrompt("anniversary") },
    { id: "pet", subject: subjects.pet, prompt: buildPetPortraitPrompt(true, styleHint) },
    { id: "faceless", subject: subjects.solo, prompt: buildFacelessPortraitPrompt() },
  ];

  console.log("\nStage 2 — running each skill's real prompt via /images/edit...");
  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const url = await post("/images/edit", {
          model: "openai/gpt-image-2",
          instruction: job.prompt,
          image_urls: [job.subject],
          size: "1K",
        });
        console.log(`  ${job.id}: ${url}`);
        return { id: job.id, url };
      } catch (err) {
        console.log(`  ${job.id}: FAILED — ${(err as Error).message}`);
        return { id: job.id, url: null };
      }
    }),
  );

  console.log(`\n${JSON.stringify({ subjects, thumbnails: results }, null, 2)}`);
}

await main();
