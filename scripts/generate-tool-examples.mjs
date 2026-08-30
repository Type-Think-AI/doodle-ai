#!/usr/bin/env node

/**
 * Generate REAL example images for the 10 live `category: "tool"` pages, using
 * the project's own PicX Studio pipeline. Two products, and nothing more:
 *
 *   1. A sourceImageUrl + thumbnailUrl PAIR for each of the two NEW skills
 *      ('coloring' and 'idea'), so a tool page can show a true before/after.
 *      The source is a SYNTHETIC photorealistic portrait — never a real person.
 *   2. Three example outputs per tool page for a gallery, written to a JSON
 *      manifest at scripts/tool-examples.json, keyed by page slug.
 *
 * WHY A SCRIPT, NOT A MASTRA SKILL
 * Same reason as scripts/generate-blog-thumbnails.mjs and
 * scripts/generate-skill-thumbnails.ts: example art is an internal authoring
 * job. A runnable Mastra skill would be published to /skills/, offered to end
 * users, and billed against THEIR credits. This belongs in the build layer.
 *
 * WHY THE THUMBNAIL RUNS THE REAL PROMPT BUILDER
 * A marketplace/tool-page thumbnail must be a GENUINE output of the bound skill,
 * not concept art (see the thumbnailUrl doc in src/lib/skill-loader.ts and the
 * two-stage approach in scripts/generate-skill-thumbnails.ts). So:
 *
 *   coloring (requiresPhoto: true):
 *     Stage 1  synthesize a photoreal portrait via /v1/images/generate
 *     Stage 2  run buildColoringPagePrompt() through /v1/images/edit against it
 *     -> sourceImageUrl = the portrait, thumbnailUrl = the real line-art output.
 *     A true before/after.
 *
 *   idea (requiresPhoto: false):
 *     Text-to-image. There is NO input photo, so there is no honest "before".
 *     We run buildDoodleIdeaPrompt() through /v1/images/generate directly.
 *     -> sourceImageUrl = null, thumbnailUrl = the real doodle output.
 *     Faking a source photo here would be a lie the page then advertises.
 *
 * The two builders (src/lib/prompts/coloring-page.ts, doodle-idea.ts) are
 * written concurrently by other lanes and may not exist yet. They are imported
 * LAZILY so --dry-run works before they land; --dry-run needs no API key and
 * spends nothing, so prompts can be reviewed before a single credit is spent.
 *
 * MODEL AND COST — default fal-ai/bytedance/seedream/v5/lite at 15 credits.
 * Measured on this endpoint (see generate-blog-thumbnails.mjs header): 15
 * credits at both 1K and 2K, 2848x1600 @ 16:9. NEVER default to gpt-image-2 at
 * 53. Edits (coloring stage 2) also bill against the same model.
 *
 * USAGE
 *   node scripts/generate-tool-examples.mjs --dry-run          # review prompts, no key, no spend
 *   node scripts/generate-tool-examples.mjs --dry-run --limit 3
 *   node scripts/generate-tool-examples.mjs                    # REAL run (spends credits)
 *   node scripts/generate-tool-examples.mjs --force            # regenerate even if manifest exists
 *   node scripts/generate-tool-examples.mjs --model google/nano-banana-2-lite
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "scripts");
const manifestPath = join(scriptsDir, "tool-examples.json");

const GENERATE_URL = "https://api.picxstudio.com/v1/images/generate";
const EDIT_URL = "https://api.picxstudio.com/v1/images/edit";

/**
 * Seedream 5 Lite — 15 credits, measured the same as in
 * generate-blog-thumbnails.mjs. 3.5x cheaper than gpt-image-2 (53) and holds the
 * house style. Override per run with --model.
 */
const MODEL = "fal-ai/bytedance/seedream/v5/lite";
/** Seedream 5 Lite bills 15 at both 1K and 2K, so 2K is free resolution. */
const SIZE = "2K";

/* ── The two new skills and their bound tool pages ───────────────────────── */

/**
 * The 10 live tool page slugs, split by which new skill they rebind to (see
 * LANES-new-skills.md). 7 coloring-page tools -> 'coloring', 3 idea/prompt
 * tools -> 'idea'. The gallery for a page shows three real outputs of its
 * bound skill.
 */
const TOOL_PAGES = {
  coloring: [
    "photo-to-coloring-page",
    "coloring-page-generator",
    "doodle-coloring-pages",
    "doodle-color-pages",
    "doodle-art-coloring-pages",
    "coloring-pages-doodles",
    "coloring-doodle-pages",
  ],
  idea: ["doodle-ideas", "random-doodle-generator", "doodle-prompt-generator"],
};

/**
 * Reused from scripts/generate-skill-thumbnails.ts. Any subject synthesized as
 * a "source photo" must read as a real photograph so the edit step has real
 * skin/hair/features to trace — and must be SYNTHETIC (invented person), never
 * a real identifiable individual, because the source appears on a public page.
 */
const PHOTOREAL =
  "Sharp photorealistic photograph, natural daylight, shallow depth of field, real skin texture, " +
  "shot on a 50mm lens. Not an illustration, not a cartoon, not a 3D render.";

/**
 * Three synthetic portrait subjects, SHARED as the input photos for the
 * photo-driven coloring pages. Sharing the inputs is fine and cheap; what has
 * to differ per page is the OUTPUT, and that is driven by TREATMENTS below.
 * All invented people — no real individual, because a source appears publicly.
 */
const SOURCE_SUBJECTS = [
  `Candid photographic portrait of one cheerful young woman with shoulder-length curly dark hair, ` +
    `round glasses, small gold hoop earrings, wearing a mustard-yellow sweatshirt, standing against a ` +
    `plain warm-grey wall, head and shoulders visible. ${PHOTOREAL}`,
  `Candid photographic portrait of one friendly young man with short curly black hair and a neatly ` +
    `trimmed beard, warm brown skin, wearing a teal-green hoodie, plain light background, head and ` +
    `shoulders visible. ${PHOTOREAL}`,
  `Candid photograph of a happy tan-and-white corgi with one folded ear and a distinctive white chest ` +
    `patch, sitting on grass and looking at the camera, soft park background. ${PHOTOREAL}`,
];

/**
 * PER-PAGE examples. This is the point of the file.
 *
 * The first version of this script generated ONE set of three coloring images
 * and pointed all seven coloring URLs at it. That is the doorway-page shape the
 * whole tool-page effort is trying to get away from: seven pages, one layout,
 * one skill, one gallery. If the pages are going to share a template they must
 * at least show different output.
 *
 * So each page declares its own examples, and the variation is chosen to match
 * what that page's KEYWORD actually promises — which is also the honest
 * difference between these near-synonymous URLs:
 *
 *   photo-to-coloring-page     the plain photo -> outline conversion
 *   coloring-page-generator    same conversion, different subjects
 *   doodle-coloring-pages      doodle motifs added around the subject
 *   doodle-color-pages         part-coloured, showing what filling it in looks like
 *   doodle-art-coloring-pages  intricate zentangle-style pattern work
 *   coloring-pages-doodles     a sheet of several small separate doodles
 *   coloring-doodle-pages      big simple shapes for a young child
 *
 * `kind: "edit"` runs the skill's real prompt builder against a source photo, so
 * the example is a genuine output. `kind: "text"` is a direct text-to-image for
 * the pages whose product is not a portrait (pattern sheets, motif sheets) and
 * for the text-only idea skill. `extra` is appended to the builder's instruction
 * so the page-specific treatment rides on top of the real skill prompt rather
 * than replacing it.
 */
const PAGE_EXAMPLES = {
  "photo-to-coloring-page": [
    { kind: "edit", source: 0 },
    { kind: "edit", source: 1 },
    { kind: "edit", source: 2 },
  ],
  "coloring-page-generator": [
    { kind: "edit", source: 1, extra: "Frame the subject full-figure rather than head-and-shoulders." },
    { kind: "edit", source: 2, extra: "Add a simple ground line and one or two plants behind the subject, all as empty outlines." },
    { kind: "edit", source: 0, extra: "Add a plain rectangular border frame around the whole page." },
  ],
  "doodle-coloring-pages": [
    { kind: "edit", source: 0, extra: "Scatter small uncoloured doodle motifs around the subject — stars, hearts, swirls, tiny clouds — all as empty outlines to colour." },
    { kind: "edit", source: 1, extra: "Add uncoloured doodle motifs around the subject: musical notes, sparkles, loose squiggles." },
    { kind: "edit", source: 2, extra: "Add uncoloured doodle motifs around the animal: paw prints, bones, little hearts." },
  ],
  "doodle-color-pages": [
    { kind: "edit", source: 0, extra: "Leave the LEFT half of the drawing as bare outline and fill the RIGHT half with flat bright crayon colour, so the page shows both states at once." },
    { kind: "edit", source: 2, extra: "Colour only one or two small regions with flat bright colour and leave everything else as bare outline." },
    { kind: "edit", source: 1, extra: "Colour just the clothing with flat bright colour; leave face, hair and background as bare outline." },
  ],
  "doodle-art-coloring-pages": [
    { kind: "text", prompt: "A dense intricate zentangle-style colouring page: one large uncoloured outline of a stylised owl filled edge to edge with fine repeating pattern work — scales, spirals, dots, chevrons — every region closed and empty, ready to colour. Crisp uniform black ink lines on plain white paper. No colour, no grey fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A dense intricate zentangle-style colouring page: a large uncoloured mandala of leaves and flowers, concentric rings of fine repeating pattern, every shape closed and empty for colouring. Crisp uniform black ink on plain white paper. No colour, no grey fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A dense intricate doodle-art colouring page: one uncoloured stylised elephant whose body is divided into many small patterned panels — paisley, stripes, dots, waves — all left empty to colour. Crisp uniform black ink on plain white paper. No colour, no grey fill, no shading, no photorealism, no lettering, no watermark." },
  ],
  "coloring-pages-doodles": [
    { kind: "text", prompt: "A colouring sheet holding NINE separate small uncoloured doodle outlines arranged in a loose three-by-three grid on plain white paper — a cat, a cupcake, a rocket, a flower, a fish, a cloud, a teapot, a star, a snail. Each one a simple closed bold black outline with empty interior, clearly separated from its neighbours. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A colouring sheet holding SIX separate small uncoloured doodle outlines scattered across plain white paper — a butterfly, an ice cream cone, a paper boat, a mushroom, a bicycle, a balloon. Simple closed bold black outlines with empty interiors. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A colouring sheet holding EIGHT separate small uncoloured food doodle outlines on plain white paper — a donut, a slice of watermelon, a pretzel, a strawberry, a cup of tea, a croissant, a lollipop, a bunch of grapes. Simple closed bold black outlines, empty interiors. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
  ],
  "coloring-doodle-pages": [
    { kind: "text", prompt: "A very simple colouring page for a young child: THREE big chunky uncoloured shapes on plain white paper — a round smiling sun, a fat cloud, a wide-petalled flower. Extra-thick black outlines, huge open areas, almost no interior detail so small hands can colour inside the lines. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A very simple colouring page for a young child: one big friendly uncoloured cat sitting square-on, drawn with extra-thick black outlines and only a handful of interior lines, filling most of the plain white page. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
    { kind: "text", prompt: "A very simple colouring page for a young child: a chunky uncoloured house with a triangle roof, one door, two square windows and a big tree beside it. Extra-thick black outlines, large empty areas, minimal detail. Plain white paper. No colour, no fill, no shading, no photorealism, no lettering, no watermark." },
  ],

  /* Idea pages — text-only skill, so every example is a real builder call with a
     different typed idea. Each page gets its own three subjects, chosen to suit
     what the page promises: browsable ideas, pure randomness, or prompt recipes. */
  "doodle-ideas": [
    { kind: "text", idea: "a cozy reading nook with a cat curled on a stack of books and a steaming mug" },
    { kind: "text", idea: "a friendly hot-air balloon drifting over rolling hills with tiny birds" },
    { kind: "text", idea: "a little potted cactus wearing sunglasses on a sunny windowsill" },
  ],
  "random-doodle-generator": [
    { kind: "text", idea: "a round blob creature with three stubby legs and one big eye, cheerful" },
    { kind: "text", idea: "a tall spindly bird wearing rain boots, standing in a puddle" },
    { kind: "text", idea: "a lumpy cat riding a skateboard downhill, ears flat" },
  ],
  "doodle-prompt-generator": [
    { kind: "text", idea: "a teapot that is also a tiny greenhouse, with vines coming out of the spout" },
    { kind: "text", idea: "a snail carrying a stack of pancakes instead of a shell" },
    { kind: "text", idea: "a paper aeroplane with tiny passengers waving from cut-out windows" },
  ],
};

/**
 * Shared style hint threaded into every builder call, matching the catalogue's
 * house doodle vocabulary so an example reads as the same product.
 */
function DOODLE_THEME_HINT() {
  return "Apply the house doodle style: naive marker-and-ink, bold clean outlines, flat cheerful colour, warm off-white ground.";
}

const THEME_HINT = DOODLE_THEME_HINT();

/* ── Lazy import of the two builders (may not exist yet) ──────────────────── */

/**
 * Import a prompt builder LAZILY so --dry-run runs before the other lanes land
 * their files. Returns the named export, or null if the module or export is
 * missing. A real run requires them; --dry-run tolerates absence and prints a
 * placeholder so the shape can still be reviewed.
 */
async function loadBuilder(moduleRelPath, exportName) {
  const abs = join(root, moduleRelPath);
  if (!existsSync(abs)) return null;
  try {
    const mod = await import(pathToFileURL(abs).href);
    return typeof mod[exportName] === "function" ? mod[exportName] : null;
  } catch {
    // A syntax error or unresolved import in a concurrently-written file must
    // not break --dry-run; treat it as "not ready yet".
    return null;
  }
}

const COLORING_BUILDER = "src/lib/prompts/coloring-page.ts";
const IDEA_BUILDER = "src/lib/prompts/doodle-idea.ts";

/* ── API key + HTTP, reused from generate-blog-thumbnails.mjs ─────────────── */

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

/** POST /v1/images/generate — text-to-image. Returns { url, credits_used }. */
async function generate(apiKey, prompt, { model, size, aspectRatio = "1:1" }) {
  const res = await fetch(GENERATE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, aspect_ratio: aspectRatio }),
  });
  return unwrap(res);
}

/** POST /v1/images/edit — run a skill's real prompt against a source image. */
async function edit(apiKey, instruction, imageUrl, { model, size }) {
  const res = await fetch(EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instruction, image_urls: [imageUrl], size }),
  });
  return unwrap(res);
}

async function unwrap(res) {
  const text = await res.text();
  let data;
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

/* ── Args ─────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { dryRun: false, force: false, model: MODEL, size: SIZE, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--model" || arg === "--size" || arg === "--limit") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      if (arg === "--model") args.model = value;
      else if (arg === "--size") args.size = value;
      else {
        const n = Number.parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1) throw new Error(`--limit needs a positive integer`);
        args.limit = n;
      }
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/* ── Credit estimate ──────────────────────────────────────────────────────── */

/**
 * A real run's per-image cost is the model's credits (default 15). Count of
 * images:
 *   coloring: 3 source portraits (generate) + 3 line-art edits (edit) = 6
 *   idea:     3 doodle outputs (generate)                              = 3
 * Total 9 images. The before/after PAIR reuses the first coloring source +
 * first coloring edit, so nothing is generated twice.
 *
 * Every page now declares its OWN examples (see PAGE_EXAMPLES), so the count
 * scales with pages rather than with skills. The three synthetic source photos
 * are still shared and cached in the manifest, so they are bought once no matter
 * how many photo-driven pages consume them.
 */
const EDIT_SPECS = Object.values(PAGE_EXAMPLES)
  .flat()
  .filter((s) => s.kind === "edit").length;
const TEXT_SPECS = Object.values(PAGE_EXAMPLES)
  .flat()
  .filter((s) => s.kind === "text").length;
const IMAGE_COUNT = SOURCE_SUBJECTS.length + EDIT_SPECS + TEXT_SPECS;
const CREDITS_PER_IMAGE = 15; // default model
function creditEstimate(model) {
  const per = model === MODEL ? CREDITS_PER_IMAGE : NaN;
  return { images: IMAGE_COUNT, per, total: Number.isNaN(per) ? null : per * IMAGE_COUNT };
}

/* ── Dry run ──────────────────────────────────────────────────────────────── */

async function dryRun(args) {
  const coloringBuilder = await loadBuilder(COLORING_BUILDER, "buildColoringPagePrompt");
  const ideaBuilder = await loadBuilder(IDEA_BUILDER, "buildDoodleIdeaPrompt");

  const missing = [];
  if (!coloringBuilder) missing.push(`${COLORING_BUILDER} (buildColoringPagePrompt) — not written yet`);
  if (!ideaBuilder) missing.push(`${IDEA_BUILDER} (buildDoodleIdeaPrompt) — not written yet`);

  const shown = [];

  for (const [slug, specs] of Object.entries(PAGE_EXAMPLES)) {
    const skill = TOOL_PAGES.coloring.includes(slug) ? "coloring" : "idea";
    console.log(`=== /${slug}/  (skill: ${skill}) ===\n`);
    specs.forEach((spec, i) => {
      if (shown.length >= args.limit) return;
      if (spec.kind === "edit") {
        const base = coloringBuilder
          ? coloringBuilder({ themeHint: THEME_HINT })
          : "<buildColoringPagePrompt not available yet>";
        const instruction = spec.extra ? `${base}\n\nADDITIONALLY: ${spec.extra}` : base;
        console.log(
          `--- #${i + 1} POST /v1/images/edit  (source photo #${spec.source + 1}) ---\n${instruction}\n`,
        );
      } else {
        const prompt = spec.idea
          ? ideaBuilder
            ? ideaBuilder({ themeHint: THEME_HINT, description: spec.idea })
            : `<buildDoodleIdeaPrompt not available yet — idea: "${spec.idea}">`
          : spec.prompt;
        console.log(`--- #${i + 1} POST /v1/images/generate ---\n${prompt}\n`);
      }
      shown.push(1);
    });
  }

  console.log("=== shared synthetic source photos (bought once, cached in manifest) ===\n");
  SOURCE_SUBJECTS.forEach((subject, i) => {
    console.log(`--- source #${i + 1} POST /v1/images/generate ---\n${subject}\n`);
  });

  const est = creditEstimate(args.model);
  console.log("=== summary ===");
  console.log(`Model: ${args.model} @ ${args.size}`);
  console.log(
    `Images a full run generates: ${est.images} ` +
      `(${SOURCE_SUBJECTS.length} shared sources + ${EDIT_SPECS} edits + ${TEXT_SPECS} text-to-image)`,
  );
  console.log(
    est.total === null
      ? `Credit estimate: unknown for non-default model — check GET /v1/models`
      : `Credit estimate for a real run: ~${est.total} credits (${est.per}/image x ${est.images})`,
  );
  console.log(`Manifest would be written to: ${manifestPath}`);
  console.log(`Tool pages keyed: ${Object.values(TOOL_PAGES).flat().length}`);
  if (missing.length > 0) {
    console.log(`\nBuilders not ready yet (fine for --dry-run, required for a real run):`);
    for (const m of missing) console.log(`  - ${m}`);
  }
  console.log(`\nDry run: no API key used, no credits spent.`);
}

/* ── Real run ─────────────────────────────────────────────────────────────── */

async function realRun(args) {
  const coloringBuilder = await loadBuilder(COLORING_BUILDER, "buildColoringPagePrompt");
  const ideaBuilder = await loadBuilder(IDEA_BUILDER, "buildDoodleIdeaPrompt");
  if (!coloringBuilder || !ideaBuilder) {
    console.error(
      "Prompt builders are not ready yet — a real run needs both:\n" +
        `  ${COLORING_BUILDER} (buildColoringPagePrompt): ${coloringBuilder ? "ok" : "MISSING"}\n` +
        `  ${IDEA_BUILDER} (buildDoodleIdeaPrompt): ${ideaBuilder ? "ok" : "MISSING"}\n` +
        "Run --dry-run until Lanes A and B land, or ask the main agent to integrate first.",
    );
    process.exitCode = 1;
    return;
  }

  const apiKey = readApiKey();
  if (!apiKey) {
    console.error(
      "PICX_API_KEY not found.\n" +
        "Add it to .dev.vars (local, git-ignored) or export it:\n" +
        "  PICX_API_KEY=<your PicX Studio API key>",
    );
    process.exitCode = 1;
    return;
  }

  const est = creditEstimate(args.model);
  console.log(`model ${args.model} @ ${args.size}`);
  console.log(
    est.total === null
      ? `estimate: unknown for non-default model\n`
      : `estimate: ~${est.total} credits (${est.per}/image x ${est.images})\n`,
  );

  let credits = 0;
  let failures = 0;

  /* Resume support. Every image costs real money, so the manifest is written
     after EACH page completes and an existing page entry is skipped unless
     --force. A run that dies at page 6 of 10 keeps the five it paid for, and
     re-running finishes the job instead of starting over. */
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { generatedAt: null, model: args.model, sources: [], pairs: {}, pages: {} };
  manifest.pages ??= {};
  manifest.sources ??= [];
  manifest.pairs ??= {};

  /* The three source photos are shared across the photo-driven pages and cached
     in the manifest, so a second run does not re-buy them. */
  async function sourceUrl(index) {
    if (manifest.sources[index]) return manifest.sources[index];
    process.stdout.write(`gen   source photo #${index + 1} ... `);
    const res = await generate(apiKey, SOURCE_SUBJECTS[index], {
      model: args.model,
      size: args.size,
      aspectRatio: "1:1",
    });
    credits += res.credits_used ?? 0;
    manifest.sources[index] = res.url;
    console.log(`ok (${res.credits_used ?? "?"} credits)`);
    return res.url;
  }

  const pageSlugs = Object.keys(PAGE_EXAMPLES).slice(0, args.limit ?? Infinity);

  for (const slug of pageSlugs) {
    if (manifest.pages[slug]?.examples?.length && !args.force) {
      console.log(`skip  ${slug} (already has ${manifest.pages[slug].examples.length} examples)`);
      continue;
    }
    const skill = TOOL_PAGES.coloring.includes(slug) ? "coloring" : "idea";
    const examples = [];

    for (let i = 0; i < PAGE_EXAMPLES[slug].length; i += 1) {
      const spec = PAGE_EXAMPLES[slug][i];
      process.stdout.write(`gen   ${slug} #${i + 1} (${spec.kind}) ... `);
      try {
        if (spec.kind === "edit") {
          // The page-specific treatment is appended to the skill's REAL prompt,
          // so the example stays a genuine output of the skill rather than a
          // lookalike produced by a different instruction.
          const base = coloringBuilder({ themeHint: THEME_HINT });
          const instruction = spec.extra ? `${base}\n\nADDITIONALLY: ${spec.extra}` : base;
          const src = await sourceUrl(spec.source);
          const out = await edit(apiKey, instruction, src, { model: args.model, size: args.size });
          credits += out.credits_used ?? 0;
          examples.push(out.url);
          console.log(`ok (${out.credits_used ?? "?"} credits)`);
        } else {
          // `idea` examples go through the real idea builder; the pattern/motif
          // sheets use a literal prompt because their product is not a portrait
          // and the coloring builder is written around a photographed subject.
          const prompt = spec.idea
            ? ideaBuilder({ themeHint: THEME_HINT, description: spec.idea })
            : spec.prompt;
          const out = await generate(apiKey, prompt, {
            model: args.model,
            size: args.size,
            aspectRatio: "1:1",
          });
          credits += out.credits_used ?? 0;
          examples.push(out.url);
          console.log(`ok (${out.credits_used ?? "?"} credits)`);
        }
      } catch (err) {
        failures += 1;
        console.log(`FAILED\n      ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (examples.length > 0) {
      manifest.pages[slug] = { skill, examples };
      // The first photo page's first pair doubles as the coloring skill's
      // before/after; the first idea example doubles as idea's thumbnail.
      if (skill === "coloring" && !manifest.pairs.coloring && manifest.sources[0]) {
        manifest.pairs.coloring = { sourceImageUrl: manifest.sources[0], thumbnailUrl: examples[0] };
      }
      if (skill === "idea" && !manifest.pairs.idea) {
        manifest.pairs.idea = { sourceImageUrl: null, thumbnailUrl: examples[0] };
      }
    }

    manifest.generatedAt = new Date().toISOString();
    manifest.model = args.model;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const pageCount = Object.keys(manifest.pages).length;
  const imageCount = Object.values(manifest.pages).reduce((n, p) => n + p.examples.length, 0);
  console.log(
    `\nDone. ~${credits} PicX credits used this run. ` +
      `Manifest now covers ${pageCount} pages / ${imageCount} images: ${manifestPath}`,
  );
  if (failures > 0) {
    console.log(`${failures} generation(s) failed — re-run to retry the incomplete pages.`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.dryRun) {
    await dryRun(args);
    return;
  }
  await realRun(args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
