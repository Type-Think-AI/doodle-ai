/* One-off: real marketplace covers for the VIDEO skills that still fall back to
 * a synthetic SVG — currently doodle-spark and doodle-starcast.
 *
 * Every other skill got its cover from scripts/generate-skill-thumbnails.ts using
 * the same two stages, and this follows them so the mosaic stays coherent:
 *
 *   1. Synthesize a SUBJECT photo via /v1/images/generate. Synthetic, so no real
 *      person's face lands on a public marketplace card.
 *   2. Turn that subject into the house-style doodle via /v1/images/edit, using
 *      the app's own buildDoodlePrompt — the exact call path generate-doodle.ts
 *      takes. That doodle IS what a clip is made from.
 *   3. One extra step these two need: render the FRAME the skill would actually
 *      produce.
 *      - spark:    the same doodle mid power-up — a held impact frame with an
 *        energy aura and speed lines, at 1:1. That is frame ~peak of what
 *        doodle-spark produces (an image-mode power-up beat).
 *      - starcast: a NEW 3:2 landscape shot of that character mid magical-girl
 *        transformation — a twirl wrapped in ribbon trails and sparkles landing
 *        in a hero pose, which is what a reference-mode transformation renders.
 *
 * STYLE, NEVER CAST. Every Stage-3 instruction is a style instruction — shonen
 * action, magical-girl, cel-shaded, impact frame, speed lines. No character,
 * series, studio, film or artist name appears anywhere in this file. Grep it for
 * proper nouns before running.
 *
 * WHY A STILL FOR A VIDEO SKILL, honestly stated: a real clip costs ~150 credits
 * AND needs PICX_WEBHOOK_SECRET provisioned, which it is not, so video cannot run
 * at all yet. A still frame in the exact style the clip renders is the closest
 * truthful artefact available. Because a still could imply a static output, the
 * tiles for kind: video also carry a "Clip" badge — the cover and the badge
 * together are honest; the cover alone would not be.
 *
 * Run: node --experimental-strip-types scripts/generate-video-skill-covers.ts
 * Spends real credits: ~4 image calls (1 subject + 1 base doodle + 2 frames) via
 * openai/gpt-image-2 at ~53 credits each = ~212 credits. Prints URLs; paste them
 * into each SKILL.md's metadata.thumbnailUrl (and sourceImageUrl for the base
 * doodle where a skill wants it). Verifies every printed URL is HTTP 200 with
 * real image bytes before declaring success.
 */

import { readFileSync } from "node:fs";
import { buildDoodlePrompt } from "../src/lib/doodle-constants.ts";

const API = "https://api.picxstudio.com/v1";

/** The only image model this repo is allowed to use (see docs/doodle-to-video-plan.md). */
const IMAGE_MODEL = "openai/gpt-image-2";

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

/** Fetch the URL and confirm it is a real image body, not a 404 or an HTML error page. */
async function verifyImage(url: string): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  const contentType = res.headers.get("content-type") || "";
  const bytes = buf.byteLength;
  const ok = res.ok && contentType.startsWith("image/") && bytes > 1024;
  return { ok, status: res.status, contentType, bytes };
}

const PHOTOREAL =
  "Sharp photorealistic photograph, natural daylight, shallow depth of field, real skin texture, " +
  "shot on a 50mm lens. Not an illustration, not a cartoon, not a 3D render.";

/* A different synthetic subject from the other covers on purpose — two video
   tiles showing the same face as the avatar tiles would look like a mistake. */
const SUBJECT =
  `Candid photographic portrait of one cheerful young man with short wavy black hair and a light stubble, ` +
  `wearing a teal zip hoodie over a white tee, standing against a plain warm-grey wall, head and ` +
  `shoulders visible, relaxed open smile. ${PHOTOREAL}`;

const styleHint = "soft pastel palette, gentle warm tones, airy and cheerful";

/* House rules copied in spirit from src/lib/video/prompts.ts, minus the camera
   direction (meaningless to an image model) — so the frame matches what the clip
   would actually look like. */
const HOUSE =
  "2D hand-drawn look: keep the visible marker line, flat cheerful fills and simplified features. " +
  "Never photorealism, never 3D rendering, no on-screen text, no captions, no watermark, no logo.";

async function main() {
  console.log("Stage 1 — synthesizing the subject photo...");
  const subject = await post("/images/generate", { prompt: SUBJECT, size: "1K", aspect_ratio: "1:1" });
  console.log(`  subject: ${subject}`);

  console.log("\nStage 2 — the base doodle (this is what a clip animates)...");
  const doodle = await post("/images/edit", {
    model: IMAGE_MODEL,
    instruction: buildDoodlePrompt(styleHint),
    image_urls: [subject],
    size: "1K",
    aspect_ratio: "1:1",
  });
  console.log(`  doodle: ${doodle}`);

  console.log("\nStage 3 — the frame each video skill would render...");
  const jobs = [
    {
      id: "spark",
      aspect: "1:1",
      instruction:
        `Keep this exact hand-drawn doodle character and its style unchanged, and show it at the PEAK ` +
        `of a shonen-action-style power-up as a single held impact frame: fists clenched, jaw set, a ` +
        `bright hand-drawn energy aura flaring around the whole body, radial speed lines shooting ` +
        `outward from behind, hair and clothing lifting in the updraft, one high-contrast burst of ` +
        `light at the centre. Same face, same colours, same outfit, near-still framing. ${HOUSE}`,
    },
    {
      id: "starcast",
      aspect: "3:2",
      instruction:
        `Using this doodle character's face, hair, colours and outfit as the reference for WHO the ` +
        `character is, draw a NEW wide landscape scene of them mid magical-girl-style transformation: ` +
        `the character twirling and landing in a confident hero pose, wrapped in looping hand-drawn ` +
        `ribbon trails, a rising shower of sparkles, and a soft radial glow behind the pose, on one ` +
        `flat bright-palette background with generous empty space around them. Same character, brand ` +
        `new shot, cel-shaded flat tints. ${HOUSE}`,
    },
  ];

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const url = await post("/images/edit", {
          model: IMAGE_MODEL,
          instruction: job.instruction,
          image_urls: [doodle],
          size: "1K",
          aspect_ratio: job.aspect,
        });
        console.log(`  ${job.id} (${job.aspect}): ${url}`);
        return { id: job.id, url };
      } catch (err) {
        console.log(`  ${job.id}: FAILED — ${(err as Error).message}`);
        return { id: job.id, url: null as string | null };
      }
    }),
  );

  console.log("\nVerifying every generated URL is a real image (HTTP 200, image/*, >1KB)...");
  const toVerify = [
    { id: "subject", url: subject },
    { id: "doodle", url: doodle },
    ...results,
  ];
  const verified: Record<string, { status: number; contentType: string; bytes: number; ok: boolean }> = {};
  for (const item of toVerify) {
    if (!item.url) {
      console.log(`  ${item.id}: no url (generation failed)`);
      continue;
    }
    const v = await verifyImage(item.url);
    verified[item.id] = v;
    console.log(`  ${item.id}: HTTP ${v.status} ${v.contentType} ${v.bytes}B ${v.ok ? "OK" : "*** NOT A VALID IMAGE ***"}`);
  }

  console.log(`\n${JSON.stringify({ subject, doodle, covers: results, verified }, null, 2)}`);

  const coversOk = results.every((r) => r.url && verified[r.id]?.ok);
  if (!coversOk) {
    console.error("\nOne or more covers failed to generate or verify — do NOT write thumbnailUrl for those.");
    process.exit(1);
  }
  console.log("\nAll covers verified. Safe to write thumbnailUrl into each SKILL.md.");
}

await main();
