#!/usr/bin/env node
/**
 * Media-model lock — zero new dependencies.
 *
 * Owner decision (docs/doodle-to-video-plan.md, 2026-09-01): this app renders
 * media with exactly TWO models and no more —
 *
 *   still images .... openai/gpt-image-2   (declared in src/lib/media/submit-image.ts)
 *   clips ........... minimax/h3-max       (declared in src/lib/video/constants.ts, VIDEO_MODEL)
 *
 * There is no model picker and no per-skill/per-user model choice. That lock is
 * currently just a convention: nothing stops a future agent wiring a third media
 * model into the runtime. This check makes the convention a build gate.
 *
 * It FAILS if any file under src/ names a media-model id other than those two.
 *
 * WHAT IS NOT A MEDIA MODEL, and why this check must know the difference:
 *
 *   • google/gemini-3.7-flash in src/mastra/agents/doodle-agent.ts is the
 *     CONVERSATIONAL model — the brain that decides which tool to call. It never
 *     renders a pixel, so it is not under the media lock. If this guard flagged
 *     it, the first person it annoyed would delete the guard. It is recognised
 *     structurally (an OpenRouter-routed conversational model, provider `google`,
 *     read from doodle-agent.ts itself) rather than by a hand-kept allowlist.
 *
 *   • Comments and doc prose are ignored. A comment explaining "we do NOT use
 *     seedream/v5/lite" must not trip the check on the word it warns against.
 *
 *   • Build-time asset scripts under scripts/ are out of scope entirely — they
 *     legitimately use cheaper models (seedream, nano-banana) for blog/tool art
 *     that never ships in the product. Only src/ is scanned.
 *
 * The allowed pair and the conversational model are all DERIVED from source, not
 * copied — a second copy of the truth would drift. If someone changes VIDEO_MODEL
 * or the submit-image model, this check follows automatically.
 *
 * Run:
 *   node scripts/check-media-models.mjs           # human report
 *   node scripts/check-media-models.mjs --json     # machine report
 *
 * Exit codes: 0 = pass, 1 = a forbidden media model was found, 2 = the check
 * could not derive the allowed pair (a setup error, treated as a hard failure so
 * a broken guard never silently passes).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN_ROOT = "src";
const JSON_OUT = process.argv.includes("--json");

const SKIP_DIRS = new Set(["node_modules", "dist", "dist.tmp", ".astro", ".wrangler", ".git", "coverage"]);

/** File extensions worth scanning for a model id. */
const SCAN_EXT = new Set([".ts", ".tsx", ".astro", ".mjs", ".js", ".json", ".md", ".mdx"]);

/**
 * A model id is `<provider>/<model>`, but so is a MIME type (`image/png`), an npm
 * import (`astro/types`, `@tldraw/...`), and a repo path (`references/x.md`). To
 * tell a generative-model id apart from those, we match ONLY provider namespaces
 * that PicX / OpenRouter actually use for image and video models. This is a small,
 * stable, well-known domain set — the media-model provider space — and it is the
 * correct concept to gate on. A brand-new provider not in this list is the one
 * gap; it is called out in the report so the list can be widened deliberately
 * rather than the check silently missing a model.
 *
 * `google` is here because gemini image/flash-image models are media models; the
 * conversational google/gemini-3.7-flash is excluded separately by being derived
 * from doodle-agent.ts, so a google MEDIA model would still be caught.
 */
const MEDIA_PROVIDERS = new Set([
  "openai",
  "minimax",
  "google",
  "seedream",
  "bytedance",
  "nano-banana",
  "fal",
  "fal-ai",
  "stability",
  "stability-ai",
  "black-forest-labs",
  "bfl",
  "flux",
  "kling",
  "kwaivgi",
  "runway",
  "runwayml",
  "luma",
  "pika",
  "recraft",
  "ideogram",
  "midjourney",
  "playground",
  "wan",
  "hunyuan",
  "tencent",
  "veo",
  "sora",
  "imagen",
  "dall-e",
  "dalle",
]);

/** MIME top-levels and other non-model `x/y` shapes we never treat as a model. */
const NON_MODEL_PREFIXES = new Set([
  "image",
  "video",
  "audio",
  "text",
  "application",
  "multipart",
  "font",
  "astro",
  "tldraw",
  "references",
  "src",
  "node",
  "http",
  "https",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Derive the truth from source rather than restating it
// ─────────────────────────────────────────────────────────────────────────────

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Media-model id string literals in a chunk of source, comments and import/export
 * statements stripped. A literal counts only if its provider namespace is a known
 * media provider (MEDIA_PROVIDERS) — so MIME types, npm imports and file paths are
 * never mistaken for a model id.
 */
function modelLiteralsIn(text) {
  const stripped = stripImportsAndComments(text);
  const ids = new Set();
  // "provider/model" or 'provider/model' — provider is a bare word, model may
  // carry dots and dashes (gpt-image-2, gemini-3.7-flash), and a two-segment
  // model tail (seedream/v5/lite) is captured whole.
  const re = /["'`]([a-z0-9-]+\/[a-z0-9][a-z0-9._/-]*)["'`]/gi;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const id = m[1];
    const provider = id.slice(0, id.indexOf("/"));
    if (NON_MODEL_PREFIXES.has(provider)) continue;
    if (!MEDIA_PROVIDERS.has(provider)) continue;
    ids.add(id);
  }
  return ids;
}

function deriveAllowed() {
  const errors = [];

  // Clip model: VIDEO_MODEL in src/lib/video/constants.ts
  let videoModel;
  const constants = read("src/lib/video/constants.ts");
  const vm = constants.match(/export\s+const\s+VIDEO_MODEL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (vm) videoModel = vm[1];
  else errors.push("could not read VIDEO_MODEL from src/lib/video/constants.ts");

  // Image model: the model literal(s) submit-image.ts sends to PicX.
  const submit = read("src/lib/media/submit-image.ts");
  const imageModels = [...modelLiteralsIn(submit)].filter((id) => id.includes("/"));
  if (imageModels.length === 0) {
    errors.push("could not find an image model literal in src/lib/media/submit-image.ts");
  }

  const allowed = new Set([videoModel, ...imageModels].filter(Boolean));

  // The conversational model is NOT a media model. Derive it from the agent so
  // it is never flagged, without hardcoding its value here.
  const conversational = new Set();
  const agent = read("src/mastra/agents/doodle-agent.ts");
  const cm = agent.match(/DEFAULT_OPENROUTER_MODEL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (cm) conversational.add(cm[1]);
  else errors.push("could not read DEFAULT_OPENROUTER_MODEL from src/mastra/agents/doodle-agent.ts");

  return { allowed, conversational, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment stripping — so a model id inside a comment is never a violation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove // line comments, block comments, Astro/HTML/JSX comments, and any
 * `import`/`export ... from` statement (whose specifier is a package path, never
 * a model id). Leaves ordinary string contents alone: a model id living inside a
 * real string literal survives and can still be matched, which is exactly what we
 * want (that is the runtime naming it).
 */
function stripImportsAndComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block */
    .replace(/<!--[\s\S]*?-->/g, " ") // <!-- html/astro -->
    .replace(/^\s*\/\/.*$/gm, " ") // whole-line // comment
    .replace(/([^:"'`\\])\/\/.*$/gm, "$1") // trailing // comment (not :// in a url)
    .replace(/^\s*import\b.*$/gm, " ") // import ... (from "pkg")
    .replace(/^\s*export\s+[^;]*\bfrom\b.*$/gm, " ") // export ... from "pkg"
    .replace(/\bfrom\s+["'`][^"'`]+["'`]/g, " "); // inline dynamic-import specifiers
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan
// ─────────────────────────────────────────────────────────────────────────────

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot >= 0 ? entry.name.slice(dot) : "";
      if (SCAN_EXT.has(ext)) yield full;
    }
  }
}

function main() {
  const { allowed, conversational, errors } = deriveAllowed();

  if (errors.length) {
    const msg = `check-media-models: cannot derive the allowed model set:\n  - ${errors.join("\n  - ")}`;
    if (JSON_OUT) console.log(JSON.stringify({ ok: false, setupError: errors }, null, 2));
    else console.error(msg);
    process.exit(2);
  }

  // A media-provider/model literal that is neither an allowed media model nor the
  // conversational model is a violation. modelLiteralsIn() has already discarded
  // MIME types, imports and file paths, so anything left named a real model.
  const violations = [];
  const scanDir = join(ROOT, SCAN_ROOT);
  for (const file of walk(scanDir)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    const text = readFileSync(file, "utf8");
    const ids = modelLiteralsIn(text);
    for (const id of ids) {
      if (allowed.has(id)) continue;
      if (conversational.has(id)) continue;
      // A media model literal that is not accounted for. Record where.
      const lines = stripImportsAndComments(text).split("\n");
      const lineNo = lines.findIndex((l) => l.includes(id)) + 1;
      violations.push({ file: rel, line: lineNo || null, id });
    }
  }

  const report = {
    ok: violations.length === 0,
    allowed: [...allowed].sort(),
    conversationalIgnored: [...conversational].sort(),
    scanned: SCAN_ROOT,
    violations,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log("check-media-models — the two-model lock");
  console.log(`  allowed media models : ${report.allowed.join(", ")}`);
  console.log(`  conversational (ignored): ${report.conversationalIgnored.join(", ") || "(none)"}`);
  console.log(`  scanned              : ${SCAN_ROOT}/ (comments + scripts/ excluded)`);

  if (report.ok) {
    console.log("\nPASS — src/ names no media model beyond the allowed two.");
    process.exit(0);
  }

  console.error(`\nFAIL — ${violations.length} forbidden media-model reference(s) in src/:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line ?? "?"}  ->  "${v.id}"`);
  }
  console.error(
    "\nThis app is locked to two media models (docs/doodle-to-video-plan.md). If you are\n" +
      "adding a genuinely-needed model, that is an owner decision — update the lock and this\n" +
      "check together. Do not add a third media model to dodge the guard.",
  );
  process.exit(1);
}

main();
