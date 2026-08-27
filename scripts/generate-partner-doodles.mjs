#!/usr/bin/env node
/**
 * Generate doodle-art partner tiles.
 *
 * WHY THIS EXISTS
 * The footer's Technology Partners row originally showed each partner's raw
 * favicon. That is accurate but generic — it looks like every other SaaS logo
 * wall and says nothing about what this product actually does. Doodle AI turns
 * pictures into hand-drawn doodles, so the partners are drawn in that same
 * house style: the credit itself becomes a demo of the product.
 *
 * WHAT IS AND IS NOT COPIED
 * These are original hand-drawn interpretations of each partner's *subject*
 * (a ghost, a cloud, a blossom), not traced reproductions of their trademarked
 * artwork. The raw favicons remain in `public/partners/` and are still used as
 * the accessible fallback, so nothing depends on the generated art existing.
 *
 * USAGE
 *   PICX_API_KEY=... node scripts/generate-partner-doodles.mjs [--dry-run]
 *
 * Prints a JSON map of slug -> CDN URL. Paste those into
 * `src/components/footer/FooterPartners.astro`.
 */

const API = "https://api.picxstudio.com/v1";
const MODEL = "fal-ai/bytedance/seedream/v5/lite";
const SIZE = "1K";

/** Shared house style, kept identical across all five so the row reads as a set. */
const STYLE = [
  "Hand-drawn naive doodle illustration in a children's picture-book style.",
  "Bold rough black marker outline with visible dry-brush texture and slightly wobbly, imperfect linework.",
  "Flat restrained watercolour fill that strays a little outside the lines.",
  "Warm off-white paper background with faint paper grain.",
  "Centred single subject, generous even margins, nothing cropped at the edges.",
  "Simple, friendly, charming.",
  "HARD NEGATIVES: no photorealism, no 3D render, no gradient mesh, no heavy shading,",
  "no glossy vector logo, no text, no letters, no words, no watermark, no drop shadow.",
].join(" ");

const PARTNERS = [
  {
    slug: "kiro",
    subject:
      "A cute friendly rounded ghost with two small dot eyes and a soft wavy bottom edge, floating gently. Pale lavender-purple watercolour fill.",
  },
  {
    slug: "picx",
    subject:
      "A simple four-petal flower made of four rounded diamond petals meeting at the centre, like a stylised bloom seen straight on. Warm coral-orange watercolour fill.",
  },
  {
    slug: "openrouter",
    subject:
      "A single fat rounded letter-O ring with a short arrow tail sweeping out from its lower right side, like a route curving away. Deep violet watercolour fill.",
  },
  {
    slug: "openai",
    subject:
      "A symmetrical six-petal knotted rosette formed from one continuous interwoven looping ribbon, like a flower tied from a single thread. Soft slate-grey watercolour fill.",
  },
  {
    slug: "cloudflare",
    subject:
      "A plump friendly cloud with two soft rounded humps and a flat base, drifting. Warm amber-orange watercolour fill.",
  },
];

const dryRun = process.argv.includes("--dry-run");
const key = process.env.PICX_API_KEY;

if (!key) {
  console.error("PICX_API_KEY is not set.");
  process.exit(1);
}

/** One generation. Returns the permanent CDN url PicX hands back. */
async function generate(partner) {
  const prompt = `${partner.subject}\n\n${STYLE}`;

  if (dryRun) {
    console.log(`[dry-run] ${partner.slug} — ${prompt.length} chars`);
    return null;
  }

  const res = await fetch(`${API}/images/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      prompt,
      model: MODEL,
      size: SIZE,
      aspect_ratio: "1:1",
      num_images: 1,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${partner.slug}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${partner.slug}: non-JSON response — ${text.slice(0, 200)}`);
  }

  // The API has returned the url under a few shapes across versions; accept any.
  const url =
    body?.images?.[0]?.url ??
    body?.data?.[0]?.url ??
    body?.image?.url ??
    body?.url ??
    null;

  if (!url) {
    throw new Error(`${partner.slug}: no url in response — ${JSON.stringify(body).slice(0, 300)}`);
  }

  return url;
}

const results = {};

for (const partner of PARTNERS) {
  try {
    const url = await generate(partner);
    results[partner.slug] = url;
    console.log(`${url ? "ok  " : "skip"} ${partner.slug}${url ? ` -> ${url}` : ""}`);
  } catch (err) {
    console.error(`FAIL ${partner.slug}: ${err.message}`);
    results[partner.slug] = null;
  }
}

console.log("\n--- JSON ---");
console.log(JSON.stringify(results, null, 2));
