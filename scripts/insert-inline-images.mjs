#!/usr/bin/env node
/**
 * Insert inline images (CDN URLs) into markdown articles.
 * Reads the manifest + results, finds each H2 heading in the article,
 * and inserts an image tag after the first paragraph following that heading.
 *
 * Usage:
 *   node scripts/insert-inline-images.mjs                  # insert all
 *   node scripts/insert-inline-images.mjs --article photo-to-cartoon  # one article
 *   node scripts/insert-inline-images.mjs --dry-run        # show what would be inserted
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const ROOT = dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, "");
const MANIFEST_PATH = resolve(ROOT, "scripts/inline-images-manifest.json");
const RESULTS_PATH = resolve(ROOT, "scripts/inline-images-results.json");
const ARTICLES_DIR = resolve(ROOT, "src/content/articles");

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const articleFilter = args.includes("--article")
    ? args[args.indexOf("--article") + 1]
    : null;

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const results = JSON.parse(readFileSync(RESULTS_PATH, "utf-8"));

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const article of manifest) {
    if (articleFilter && article.article !== articleFilter) continue;

    // Find the markdown file
    let mdPath = resolve(ARTICLES_DIR, article.article, "index.md");
    if (!existsSync(mdPath)) {
      mdPath = resolve(ARTICLES_DIR, article.article + ".md");
    }
    if (!existsSync(mdPath)) {
      // Try with .mdx
      mdPath = resolve(ARTICLES_DIR, article.article, "index.mdx");
      if (!existsSync(mdPath)) {
        console.log(`⚠️  Article file not found: ${article.article}`);
        continue;
      }
    }

    let content = readFileSync(mdPath, "utf-8");
    let modified = false;

    for (const image of article.images) {
      const result = results[image.id];
      if (!result) {
        console.log(`⚠️  No CDN URL for ${image.id} — skipping`);
        totalSkipped++;
        continue;
      }

      // Check if image is already inserted
      if (content.includes(result.url)) {
        console.log(`⏭️  Already inserted: ${image.id}`);
        totalSkipped++;
        continue;
      }

      // Find the heading in the content
      // Normalize quotes for matching (manifest may use straight, MD may use curly)
      const normalizedHeading = image.afterHeading
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'");
      
      // Create a normalized version of content for searching
      const normalizedContent = content
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");
      
      const headingPattern = new RegExp(
        `^(##\\s+${escapeRegex(normalizedHeading)})\\s*$`,
        "m"
      );
      const headingMatch = normalizedContent.match(headingPattern);

      if (!headingMatch) {
        // Try partial match — use first 25 chars (avoids quote escaping issues)
        const searchStr = normalizedHeading.slice(0, 25);
        const partialPattern = new RegExp(
          `^(##[^\\n]*${escapeRegex(searchStr)}[^\\n]*)$`,
          "m"
        );
        const partialMatch = normalizedContent.match(partialPattern);
        if (!partialMatch) {
          console.log(`⚠️  Heading not found for ${image.id}: "${image.afterHeading}"`);
          totalSkipped++;
          continue;
        }
        // Use partial match
        const insertAfter = findInsertionPoint(content, partialMatch.index + partialMatch[0].length);
        const imageMarkdown = `\n![${image.alt}](${result.url})\n`;

        if (dryRun) {
          console.log(`📝 Would insert ${image.id} after "${partialMatch[1].slice(0, 50)}..."`);
        } else {
          content = content.slice(0, insertAfter) + imageMarkdown + content.slice(insertAfter);
          modified = true;
          totalInserted++;
          console.log(`✅ Inserted: ${image.id}`);
        }
        continue;
      }

      // Insert after the first paragraph following the heading
      const insertAfter = findInsertionPoint(content, headingMatch.index + headingMatch[0].length);
      const imageMarkdown = `\n![${image.alt}](${result.url})\n`;

      if (dryRun) {
        console.log(`📝 Would insert ${image.id} after "${image.afterHeading.slice(0, 50)}..."`);
      } else {
        content = content.slice(0, insertAfter) + imageMarkdown + content.slice(insertAfter);
        modified = true;
        totalInserted++;
        console.log(`✅ Inserted: ${image.id}`);
      }
    }

    if (modified && !dryRun) {
      writeFileSync(mdPath, content);
      console.log(`💾 Saved: ${mdPath}`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Inserted: ${totalInserted} | Skipped: ${totalSkipped}`);
  if (dryRun) console.log("(DRY RUN — no files modified)");
}

/**
 * Find the insertion point after a heading — after the first paragraph.
 * We want to insert after the first non-empty paragraph block following the heading.
 */
function findInsertionPoint(content, headingEnd) {
  // Skip blank lines after heading
  let pos = headingEnd;
  while (pos < content.length && content[pos] === "\n") pos++;

  // Find end of first paragraph (next double newline or next heading)
  const restContent = content.slice(pos);
  const nextDoubleNewline = restContent.search(/\n\n/);
  const nextHeading = restContent.search(/\n##/);

  if (nextDoubleNewline === -1 && nextHeading === -1) {
    return content.length;
  }

  let endOfParagraph;
  if (nextDoubleNewline === -1) {
    endOfParagraph = nextHeading;
  } else if (nextHeading === -1) {
    endOfParagraph = nextDoubleNewline;
  } else {
    endOfParagraph = Math.min(nextDoubleNewline, nextHeading);
  }

  return pos + endOfParagraph + 1; // +1 to be after the first \n
}

function escapeRegex(str) {
  return str
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '["\u201C\u201D\u201E\u201F\u2033\u2036]')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "['\u2018\u2019\u201A\u201B\u2032\u2035]")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
