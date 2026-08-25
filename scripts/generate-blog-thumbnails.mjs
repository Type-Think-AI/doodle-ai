#!/usr/bin/env node

/**
 * Generate editorial thumbnails for the articles in src/content/articles/ using
 * the project's own PicX Studio pipeline (GPT Image 2), then write the returned
 * CDN URL into each article's `heroImage` frontmatter.
 *
 * WHY A SCRIPT AND NOT A MASTRA AGENT SKILL
 * A runnable Mastra skill would be published in the public /skills/ catalog,
 * listed in the sitemap, offered to end users by the chat agent, and billed
 * against *their* org credits. Thumbnail art direction is an internal authoring
 * job, so it belongs in the build/authoring layer next to
 * scripts/generate-brand-assets.mjs instead. The reusable part is this file's
 * HOUSE_STYLE + SUBJECTS map: adding article #11 means adding one SUBJECTS
 * entry, not touching the request code.
 *
 * API CONTRACT
 * Mirrors the production call in src/mastra/tools/generate-doodle.ts:
 *   POST https://api.picxstudio.com/v1/images/generate
 *   { model, prompt, size, aspect_ratio }  ->  { id, url, credits_used, ... }
 * The payload shape is strict. Invalid values (e.g. `quality`, or
 * `aspect_ratio: "landscape_16_9"`) are rejected at the edge as an opaque
 * Cloudflare 403 / "error code: 1010", which looks like a WAF block but is not.
 *
 * COST
 * openai/gpt-image-2 at 1K/16:9 bills ~53 PicX credits per image. This spends
 * real credits on the account that owns PICX_API_KEY, so generation is opt-in
 * per slug and never regenerates an existing thumbnail without --force.
 *
 * USAGE
 *   node scripts/generate-blog-thumbnails.mjs                    # status only
 *   node scripts/generate-blog-thumbnails.mjs --slug photo-to-cartoon
 *   node scripts/generate-blog-thumbnails.mjs --slug photo-to-cartoon --dry-run
 *   node scripts/generate-blog-thumbnails.mjs --all               # only missing
 *   node scripts/generate-blog-thumbnails.mjs --all --force       # replace all
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const articlesDir = join(root, "src", "content", "articles");

const API_URL = "https://api.picxstudio.com/v1/images/generate";
const MODEL = "openai/gpt-image-2";
const SIZE = "1K";
const ASPECT_RATIO = "16:9";

/**
 * A shared placeholder currently reused across several articles. It is a
 * sticker-sheet sample, not per-article art, so it counts as "missing" and is
 * replaced without needing --force.
 */
const PLACEHOLDER_URLS = new Set([
  "https://cdn.picxstudio.com/api/edited/image_c05e213c-b1d7-42b5-8398-22db6a339de5.png",
]);

/**
 * House style shared by every thumbnail, so the set reads as one system rather
 * than ten unrelated illustrations. Vocabulary is deliberately aligned with
 * buildDoodlePrompt() in src/lib/doodle-constants.ts.
 *
 * The negative list matters as much as the positive one: GPT Image 2 will
 * happily add captions and fake UI chrome to anything that smells like a blog
 * header, and lettering is the single most common way these come back unusable.
 */
const HOUSE_STYLE = [
  "Hand-drawn naive marker-and-ink doodle illustration in the style of a felt-tip sketch on paper.",
  "Bold confident black outlines, flat cheerful fills, no gradients.",
  "Plain warm off-white cream paper background.",
  "Restrained palette: warm amber yellow, soft coral red, charcoal black, cream.",
  "Playful slightly exaggerated shapes, generous empty space, centred editorial composition with clear margins.",
  "Absolutely no text, no lettering, no words, no letters, no numbers, no captions, no labels, no watermark, no logo.",
  "No photorealism, no photographic texture, no 3D render, no heavy realistic shading, no UI screenshots, no app windows.",
  "No recognisable real person; faces must read as simple cartoon doodles.",
].join(" ");

/**
 * Per-article subject direction, keyed by path relative to src/content/articles.
 * Each subject describes objects and composition only — style comes from
 * HOUSE_STYLE so the whole set stays visually consistent.
 */
const SUBJECTS = {
  "photo-to-cartoon/index.md":
    "A vintage film camera on the left, a single curved arrow pointing right, and one simple round smiling cartoon face on the right.",
  "cartoon-profile-picture/index.md":
    "Three empty rounded-square picture frames in a row, each containing one simple cartoon doodle head with a different hairstyle, like a row of profile pictures.",
  "ai-cartoon-generator/index.md":
    "A speech bubble on the left with a small sparkle inside it, an arrow, and a hand holding a marker pen drawing a simple smiling doodle face on the right.",
  "ai-cartoon-generator/prompts.md":
    "An open sketchbook seen flat from above with a marker pen resting on it, and three small doodle faces sketched in a row on the page.",
  "cartoon-pet-portrait/index.md":
    "A simple cartoon dog sitting on the left and a simple cartoon cat sitting on the right, both drawn as friendly doodles, with a small heart shape floating between them.",
  "photo-to-sticker/index.md":
    "A square sheet of paper with several die-cut sticker shapes drawn on it — a star, a heart, a small doodle face — with one sticker peeling up at the corner.",
  "doodle-gift/index.md":
    "A wrapped gift box with a big ribbon bow on the left, and a small doodle greeting card standing open on the right, with a heart shape above.",
  "mood-caption-collage/index.md":
    "A grid of six equal empty panels, each containing one simple cartoon doodle face with a different expression: happy, sleepy, surprised, calm, laughing, thoughtful.",
  "for-studios/animation-concept-sprint.md":
    "A film clapperboard on the left, and a cork pinboard on the right with three small character sketch cards pinned to it in a row.",
  "for-studios/ai-filmmaker-stills.md":
    "A movie camera on a tripod on the left, and a contact sheet on the right showing six small panels each with the same simple doodle character in a different standing pose.",
};

function buildPrompt(subject) {
  return `Wide 16:9 editorial blog header illustration. ${subject} ${HOUSE_STYLE}`;
}

/** PICX_API_KEY from the environment, falling back to the ignored .dev.vars. */
function readApiKey() {
  if (process.env.PICX_API_KEY?.trim()) return process.env.PICX_API_KEY.trim();
  try {
    const line = readFileSync(join(root, ".dev.vars"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("PICX_API_KEY="));
    const value = line?.slice("PICX_API_KEY=".length).trim();
    if (value) return value;
  } catch {
    // .dev.vars is local-only and may not exist in CI.
  }
  return null;
}

/** Splits a markdown file into its frontmatter block and the body after it. */
function splitFrontmatter(text, file) {
  if (!text.startsWith("---\n")) throw new Error(`${file}: no opening frontmatter delimiter`);
  const end = text.indexOf("\n---\n", 3);
  if (end === -1) throw new Error(`${file}: no closing frontmatter delimiter`);
  return { frontmatter: text.slice(4, end + 1), rest: text.slice(end + 1) };
}

function readHeroImage(frontmatter) {
  const match = frontmatter.match(/^heroImage:\s*"?([^"\n]*)"?\s*$/m);
  return match ? match[1].trim() : null;
}

/**
 * Writes `heroImage` into a frontmatter block, replacing an existing line or
 * inserting after updatedDate/pubDate so key order stays predictable.
 */
function setHeroImage(frontmatter, url) {
  const line = `heroImage: "${url}"`;
  if (/^heroImage:/m.test(frontmatter)) {
    return frontmatter.replace(/^heroImage:.*$/m, line);
  }
  const anchor = /^(updatedDate:.*)$/m.test(frontmatter)
    ? /^(updatedDate:.*)$/m
    : /^(pubDate:.*)$/m;
  if (anchor.test(frontmatter)) {
    return frontmatter.replace(anchor, `$1\n${line}`);
  }
  return `${frontmatter}${line}\n`;
}

async function generate(apiKey, prompt) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: SIZE, aspect_ratio: ASPECT_RATIO }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // A non-JSON body is almost always a Cloudflare edge error page.
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !data.url) {
    throw new Error(data.detail || data.message || `HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

function parseArgs(argv) {
  const args = { slugs: [], all: false, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") args.all = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--slug") {
      const value = argv[i + 1];
      if (!value) throw new Error("--slug needs a value");
      args.slugs.push(value);
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/** Maps a user-supplied slug (`photo-to-cartoon`) to its SUBJECTS key. */
function resolveSlug(slug) {
  const normalised = slug.replace(/^\/+|\/+$/g, "");
  const candidates = [`${normalised}/index.md`, `${normalised}.md`];
  return candidates.find((key) => key in SUBJECTS) ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Current heroImage state for every known article.
  const entries = Object.keys(SUBJECTS).map((key) => {
    const file = join(articlesDir, key);
    const text = readFileSync(file, "utf8");
    const { frontmatter } = splitFrontmatter(text, key);
    const hero = readHeroImage(frontmatter);
    const isPlaceholder = hero ? PLACEHOLDER_URLS.has(hero) : false;
    return { key, file, hero, isPlaceholder, needs: !hero || isPlaceholder };
  });

  let targets;
  if (args.slugs.length > 0) {
    targets = args.slugs.map((slug) => {
      const key = resolveSlug(slug);
      if (!key) throw new Error(`No article matches --slug ${slug}`);
      return entries.find((e) => e.key === key);
    });
  } else if (args.all) {
    targets = args.force ? entries : entries.filter((e) => e.needs);
  } else {
    // No target selected: report state and exit without spending credits.
    console.log(`Articles in ${articlesDir}\n`);
    for (const e of entries) {
      const state = !e.hero ? "MISSING" : e.isPlaceholder ? "placeholder" : "ok";
      console.log(`  ${state.padEnd(12)} ${e.key}`);
    }
    const missing = entries.filter((e) => e.needs).length;
    console.log(
      `\n${missing} of ${entries.length} need a thumbnail.` +
        `\nRun with --all to generate them (~53 PicX credits each), or --slug <name> for one.`,
    );
    return;
  }

  const skipped = targets.filter((t) => !args.force && !t.needs);
  const queue = args.force ? targets : targets.filter((t) => t.needs);
  for (const t of skipped) {
    console.log(`skip  ${t.key} (already set; use --force to replace)`);
  }
  if (queue.length === 0) {
    console.log("Nothing to generate.");
    return;
  }

  if (args.dryRun) {
    for (const t of queue) {
      console.log(`\n--- ${t.key} ---\n${buildPrompt(SUBJECTS[t.key])}`);
    }
    console.log(`\nDry run: ${queue.length} prompt(s), no credits spent.`);
    return;
  }

  const apiKey = readApiKey();
  if (!apiKey) {
    console.error(
      "PICX_API_KEY not found.\n" +
        "Add it to .dev.vars (local, git-ignored) or export it:\n" +
        "  PICX_API_KEY=<your PicX Studio API key>\n" +
        "The key must belong to an account with image credits.",
    );
    process.exitCode = 1;
    return;
  }

  let credits = 0;
  let failures = 0;

  for (const t of queue) {
    process.stdout.write(`gen   ${t.key} ... `);
    try {
      const data = await generate(apiKey, buildPrompt(SUBJECTS[t.key]));
      const text = readFileSync(t.file, "utf8");
      const { frontmatter, rest } = splitFrontmatter(text, t.key);
      writeFileSync(t.file, `---\n${setHeroImage(frontmatter, data.url)}${rest}`);
      credits += data.credits_used ?? 0;
      console.log(`ok (${data.credits_used ?? "?"} credits)\n      ${data.url}`);
    } catch (err) {
      failures += 1;
      console.log(`FAILED\n      ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nDone. ${queue.length - failures}/${queue.length} generated, ~${credits} PicX credits used.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
