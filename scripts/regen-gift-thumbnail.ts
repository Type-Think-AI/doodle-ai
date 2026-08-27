/* One-off: regenerate the Gift Doodle marketplace thumbnail.
 *
 * The thumbnail it replaces was wrong in two ways:
 *   1. It was a /images/generate output — a generic fan of blank greeting cards
 *      produced from a text prompt, not a real run of this skill, so it showed
 *      none of the "your photo becomes the card" idea the skill actually sells.
 *   2. It was 1088x608, while the skill declares aspectRatio '1:1'. Any square
 *      frame therefore cropped ~44% of it away, including the lettering.
 *
 * This runs the skill's ACTUAL buildGiftPrompt() through /images/edit against the
 * existing synthetic solo portrait already used as chibi-mini-me's sourceImageUrl
 * — reused deliberately so no new subject photo has to be generated (and so the
 * before/after pair on the page shares one recognizable face).
 *
 * Run: PICX_API_KEY=... node --experimental-strip-types scripts/regen-gift-thumbnail.ts
 */

import { readFileSync } from "node:fs";
import { buildGiftPrompt } from "../src/lib/doodle-constants.ts";

const API = "https://api.picxstudio.com/v1";

const key =
  process.env.PICX_API_KEY?.trim() ||
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="))
    ?.slice("PICX_API_KEY=".length)
    .trim();
if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");

/* The synthetic solo portrait already recorded as chibi-mini-me's sourceImageUrl. */
const SUBJECT = "https://cdn.picxstudio.com/api/generated/image_2448ea08-f6d9-4096-bb0e-c1bcba04172e.png";

async function main() {
  // "birthday" so pickGiftOccasion() takes a real branch rather than the
  // fallback — the card then shows balloons/confetti and a legible greeting,
  // which is what the skill is actually for.
  const instruction = buildGiftPrompt("birthday card for my friend");

  const res = await fetch(`${API}/images/edit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      instruction,
      image_urls: [SUBJECT],
      size: "1K",
      aspect_ratio: "1:1",
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(`edit ${res.status}: ${data.detail || data.message || JSON.stringify(data)}`);
  }

  console.log(JSON.stringify({ subject: SUBJECT, thumbnailUrl: data.url }, null, 2));
}

await main();
