#!/usr/bin/env node
/**
 * Generate inline article images and store CDN URLs in a results manifest.
 * Images are NOT saved locally — we use the PicX CDN URLs directly in markdown.
 *
 * Usage:
 *   node scripts/generate-inline-images.mjs                  # generate all
 *   node scripts/generate-inline-images.mjs --article photo-to-cartoon  # one article
 *   node scripts/generate-inline-images.mjs --id pet-portrait-03        # one image
 *   node scripts/generate-inline-images.mjs --dry-run                   # show prompts only
 *   node scripts/generate-inline-images.mjs --force                     # regenerate even if URL exists in results
 *   node scripts/generate-inline-images.mjs --status                    # show progress
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";

const ROOT = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, "");
const MANIFEST_PATH = resolve(ROOT, "scripts/inline-images-manifest.json");
const RESULTS_PATH = resolve(ROOT, "scripts/inline-images-results.json");

// House style prefix for consistent look
const HOUSE_STYLE = "Hand-drawn doodle illustration in a consistent editorial style: bold black marker outlines, simplified shapes, flat cheerful color palette (cream, amber, coral, charcoal, teal), warm-white or cream paper background, no photographic realism, no 3D rendering, no gradients, no text watermarks. Clean professional editorial illustration. ";

// Read API key
function getApiKey() {
  const envPath = resolve(ROOT, ".dev.vars");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^PICX_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }
  if (process.env.PICX_API_KEY) return process.env.PICX_API_KEY;
  throw new Error("No PICX_API_KEY found in .dev.vars or environment");
}

// Load existing results (CDN URLs already generated)
function loadResults() {
  if (existsSync(RESULTS_PATH)) {
    return JSON.parse(readFileSync(RESULTS_PATH, "utf-8"));
  }
  return {};
}

// Save results
function saveResults(results) {
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
}

async function generateImage(prompt, apiKey) {
  const fullPrompt = HOUSE_STYLE + prompt;
  const response = await fetch("https://api.picxstudio.com/v1/images/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt: fullPrompt,
      size: "1K",
      aspect_ratio: "16:9",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    // Check if it's an HTML error page (504, 502, etc.)
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error(`PicX API ${response.status}: Gateway error (retry later)`);
    }
    throw new Error(`PicX API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return { url: data.url, id: data.id, credits: data.credits_used };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const statusOnly = args.includes("--status");
  const articleFilter = args.includes("--article")
    ? args[args.indexOf("--article") + 1]
    : null;
  const idFilter = args.includes("--id")
    ? args[args.indexOf("--id") + 1]
    : null;

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const results = loadResults();

  if (statusOnly) {
    let total = 0, done = 0;
    for (const article of manifest) {
      for (const image of article.images) {
        total++;
        if (results[image.id]) done++;
      }
    }
    console.log(`Progress: ${done}/${total} images generated (${total - done} remaining)`);
    console.log(`Credits used: ~${done * 53}`);
    return;
  }

  const apiKey = dryRun ? null : getApiKey();

  let totalImages = 0;
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalCredits = 0;

  for (const article of manifest) {
    if (articleFilter && article.article !== articleFilter) continue;

    for (const image of article.images) {
      if (idFilter && image.id !== idFilter) continue;
      totalImages++;

      // Skip if CDN URL already exists in results
      if (results[image.id] && !force) {
        console.log(`⏭️  SKIP (CDN URL exists): ${image.id}`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`\n📝 ${image.id}`);
        console.log(`   Article: ${article.article}`);
        console.log(`   After: ${image.afterHeading}`);
        console.log(`   Prompt: ${image.prompt.slice(0, 100)}...`);
        console.log(`   Alt: ${image.alt}`);
        continue;
      }

      console.log(`\n🎨 Generating: ${image.id}...`);
      try {
        const result = await generateImage(image.prompt, apiKey);
        results[image.id] = {
          url: result.url,
          alt: image.alt,
          article: article.article,
          afterHeading: image.afterHeading,
          generatedAt: new Date().toISOString(),
        };
        saveResults(results); // Save after each success (resumable)
        totalCredits += result.credits || 53;
        console.log(`   ✅ CDN: ${result.url}`);
        generated++;

        // Rate limit: delay between requests
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        console.error(`   ❌ FAILED: ${err.message}`);
        failed++;
        // On gateway timeout, wait longer before retry
        if (err.message.includes("504") || err.message.includes("Gateway")) {
          console.log("   ⏳ Gateway timeout — waiting 10s before next...");
          await new Promise((r) => setTimeout(r, 10000));
        }
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Total: ${totalImages} | Generated: ${generated} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Credits this run: ~${generated * 53}`);
  if (dryRun) console.log("(DRY RUN — no images generated)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
