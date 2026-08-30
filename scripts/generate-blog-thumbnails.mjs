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
 * MODEL AND SIZE — measured 2026-08-25, not assumed
 * GET /v1/models reports openai/gpt-image-2 at { 1K: 53, 2K: 53, 4K: 105 }
 * credits. Measured output for all three, 16:9:
 *
 *   size  credits  actual pixels
 *   1K     53      1088 x 608
 *   2K     53      1088 x 608
 *   4K    105      1088 x 608   <- billed double, identical output
 *
 * gpt-image-2 is hard-capped at 1088 x 608 on this endpoint regardless of
 * `size`, and the stored CDN origin really is that size (not a resized
 * derivative — verified via content-length and ?w= probes). So 2K is the
 * correct default: it is the highest tier that costs the same as 1K, and 4K is
 * a pure 2x waste on this model. For reference, google/nano-banana-2-lite at 4K
 * returned 1376 x 768 for 20 credits, so the cap is model-specific rather than
 * platform-wide. There is no public upscale endpoint (/v1/images/upscale 404s).
 *
 * 1088 x 608 is still ~1.5x the 700px rendered width of the article hero, so it
 * is genuinely sufficient here; oversized heroes would work against the LCP of
 * these pages.
 *
 * COST
 * ~53 PicX credits per image at the default 2K. This spends real credits on the
 * account that owns PICX_API_KEY, so generation is opt-in per slug and never
 * regenerates an existing thumbnail without --force.
 *
 * USAGE
 *   node scripts/generate-blog-thumbnails.mjs                    # status only
 *   node scripts/generate-blog-thumbnails.mjs --slug photo-to-cartoon
 *   node scripts/generate-blog-thumbnails.mjs --slug photo-to-cartoon --dry-run
 *   node scripts/generate-blog-thumbnails.mjs --all               # only missing
 *   node scripts/generate-blog-thumbnails.mjs --all --force       # replace all
 *   node scripts/generate-blog-thumbnails.mjs --all --size 4K     # override (not advised)
 *   node scripts/generate-blog-thumbnails.mjs --all --model google/nano-banana-2-lite
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const articlesDir = join(root, "src", "content", "articles");

const API_URL = "https://api.picxstudio.com/v1/images/generate";
/**
 * Seedream 5 Lite, measured against gpt-image-2 on this endpoint 2026-08-29 with
 * two identical HOUSE_STYLE prompts (diwali-doodle, doodle-icon-generator):
 *
 *   model                          credits  actual pixels (16:9)
 *   fal-ai/bytedance/seedream/v5/lite  15    2848 x 1600
 *   openai/gpt-image-2                 53    1088 x  608
 *
 * 3.5x cheaper and 2.6x wider, and both test outputs held the house style —
 * cream paper, bold marker outlines, amber/coral fills, zero lettering. It is
 * the default because the 85-article backfill is 1,275 credits on this model
 * versus 4,505 on gpt-image-2, and the earlier gpt-image-2 default was chosen
 * before this model existed on the endpoint rather than after comparing them.
 *
 * Override per run with --model if a specific page needs a different look.
 */
const MODEL = "fal-ai/bytedance/seedream/v5/lite";
/** Seedream 5 Lite bills 15 at both 1K and 2K, so 2K is free resolution. */
const SIZE = "2K";
const ASPECT_RATIO = "16:9";

/**
 * A shared placeholder currently reused across several articles. It is a
 * sticker-sheet sample, not per-article art, so it counts as "missing" and is
 * replaced without needing --force.
 */
/**
 * Heroes that are shared samples rather than per-article art. Anything listed
 * here counts as "missing" and is replaced without needing --force, so a batch
 * run never has to blanket-regenerate the articles that already have real,
 * inspected thumbnails.
 *
 * The four CDN URLs below were each pointed at by many articles at once (53 /
 * 20 / 8 / 4 of the 97) because SUBJECTS only covered 10 files and the rest were
 * given a stand-in. Counting them as missing is what lets `--all` fix exactly
 * the wrong ones and skip the 12 correct ones.
 */
const PLACEHOLDER_URLS = new Set([
  "https://cdn.picxstudio.com/api/edited/image_c05e213c-b1d7-42b5-8398-22db6a339de5.png",
  // Surprise Me sample — was on 53 articles.
  "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png",
  // Full-body collage sample — was on 20 articles.
  "https://cdn.picxstudio.com/api/edited/image_99868a77-06d4-4421-9101-30d37aa41808.png",
  // Crayon line-art sample — was on 8 articles.
  "https://cdn.picxstudio.com/api/generated/image_33f43b6a-1bc7-48b8-af1e-4b44abe09a73.png",
  // Festival sample — was on 4 articles.
  "https://cdn.picxstudio.com/api/edited/image_9055f3f4-b6a3-4528-a558-70eda48ffd45.png",
]);

/**
 * House style shared by every thumbnail, so the set reads as one system rather
 * than ninety unrelated illustrations.
 *
 * CHARACTER-LED, NOT OBJECT-LED. An earlier version of this file described
 * still-life arrangements — a camera and an arrow and a small face, a crayon
 * resting on a sheet — which produced tidy but lifeless flat-lays that looked
 * nothing like the product. The skill cards on /skills/ are what these pages
 * should match: a warm, appealing, richly coloured illustrated character doing
 * the thing the page is about. People click a face.
 *
 * The vocabulary below is lifted from buildDoodlePrompt() and
 * buildCollagePrompt() in src/lib/doodle-constants.ts on purpose, so a
 * thumbnail and a real generation from the same skill read as the same house.
 * The palette is deliberately WIDER than a two-colour scheme — the skill cards
 * use coral, mustard, teal, denim and cream together, and restricting it to
 * amber alone was what made the first batch look flat.
 *
 * The negative list matters as much as the positive one: image models will
 * happily add captions and fake UI chrome to anything that smells like a blog
 * header, and lettering is the single most common way these come back unusable.
 */
const HOUSE_STYLE = [
  "Hand-drawn illustrated doodle artwork in cute naive marker-and-ink cartoon style.",
  "Bold clean confident outlines, simplified expressive facial features, flat cheerful colours, playful slightly exaggerated proportions.",
  "Visible marker and coloured-pencil texture, warm off-white cream paper background with a subtle paper grain.",
  "Rich cheerful palette used together: coral red, mustard amber yellow, teal green, denim blue, warm brown, cream.",
  "Scatter small hand-drawn doodle accents around the character — sparkles, tiny hearts, stars, motion swirls, dotted trails — drawn as if added on top with a pen.",
  "Warm, friendly, likeable character with an appealing expression; generous breathing room around the subject; balanced wide editorial composition.",
  "Absolutely no text, no lettering, no words, no letters, no numbers, no captions, no labels, no watermark, no logo.",
  "No photorealism, no photographic skin texture, no realistic lighting, no 3D render, no heavy realistic shading, no UI screenshots, no app windows.",
  "Not a real identifiable person — the face must read as warm illustrated cartoon doodle art.",
].join(" ");

/**
 * A small recurring cast, so 97 thumbnails feel like one product's artwork
 * instead of 97 strangers. Each character is described once here and referenced
 * from SUBJECTS as `{{MAYA}}`; buildPrompt() expands the token.
 *
 * The four are deliberately the people already on the /skills/ cards, so the
 * article grid and the skill catalogue look like the same world. Keeping the
 * descriptions in one place is also what stops per-page drift — a hand-written
 * "young woman with glasses" in ninety subjects would come back as ninety
 * different women.
 */
const CAST = {
  MAYA:
    "a cheerful young woman with long wavy dark hair, round tortoiseshell glasses, small gold hoop earrings, " +
    "light freckles and warm brown skin, wearing a rust-coral cardigan over a mustard-yellow top",
  ARJUN:
    "a friendly young man with short curly black hair and a neatly trimmed beard, warm brown skin, " +
    "wearing a teal-green hoodie",
  NOOR:
    "a playful teenage girl with teal-dyed hair tied in a messy top bun with a small star clip, freckled cheeks, " +
    "wearing a denim jacket covered in small embroidered patches over a striped tee",
  RIYA:
    "a calm young woman with dark hair in two braids and warm brown skin, wearing a soft mustard knit sweater",
};

/** Expands `{{MAYA}}`-style cast tokens into their full description. */
function expandCast(subject) {
  return subject.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const description = CAST[name];
    if (!description) throw new Error(`Unknown cast token ${match}`);
    return description;
  });
}

/**
 * Per-article subject direction, keyed by path relative to src/content/articles.
 * Each subject describes WHO is in frame, what they are doing, and the
 * composition — the rendering style comes from HOUSE_STYLE and the character
 * descriptions come from CAST, so the whole set stays visually consistent.
 *
 * TWO RULES, both learned the hard way:
 *
 * 1. A CHARACTER IS ALWAYS IN FRAME. Never a still-life of props. An earlier
 *    pass described object arrangements (a camera and an arrow, a crayon on a
 *    sheet, a funnel with photos dropping in) and the result was a grid of
 *    tidy, lifeless flat-lays that looked nothing like the /skills/ cards. The
 *    topical prop is a supporting detail; the face is the thumbnail.
 *
 * 2. DISTINCTNESS IS DELIBERATE. Many of these URLs are near-synonyms
 *    ("doodle generator", "doodle generator ai", "doodle generator free",
 *    "doodle generator online"), so a subject derived from the page's topic
 *    alone would produce twenty interchangeable pictures. Each entry therefore
 *    varies THREE axes on purpose — which cast member, the composition (bust
 *    portrait, half-body with a prop, full body, 3x2 panel grid, row of three,
 *    two characters), and the topical prop keyed off the keyword's
 *    distinguishing qualifier:
 *
 *      free      -> coins, a blank gift tag, an open giving palm
 *      online    -> a globe, a cloud, a signal arc  (never a browser window:
 *                   HOUSE_STYLE rules out UI chrome, and the model will put
 *                   fake lettering in a fake toolbar every time)
 *      app       -> a plain rounded phone outline held in frame
 *      ai        -> sparkle bursts, a small friendly robot companion
 *      printable -> a printer with a sheet feeding out
 *      converter -> the character holding a photo beside its drawn version
 *
 * Nothing here may ask for words, letters, numbers or captions; HOUSE_STYLE
 * forbids them, and lettering is the most common way these come back unusable.
 */
const SUBJECTS = {
  /* ── Cartoon cluster ─────────────────────────────────────────────────── */
  "photo-to-cartoon/index.md":
    "{{MAYA}}, shown from the waist up slightly right of centre, holding up a small printed photograph of herself in one hand while her other half of the frame shows her already redrawn as bold cartoon line art, sparkles between the two.",
  "turn-photo-into-cartoon/index.md":
    "{{ARJUN}} caught mid-laugh in a close-up bust portrait, one hand raised in a cheerful wave, with loose motion swirls and small stars trailing behind his shoulder.",
  "convert-photo-to-cartoon/index.md":
    "{{RIYA}} seen from the side in half-body, turning to face the viewer as her form transitions from soft photographic-looking rendering on the left edge to fully bold cartoon linework on the right, two curved arrows looping around her.",
  "cartoon-generator/index.md":
    "{{NOOR}} standing full-body slightly off-centre with both arms flung wide in an excited pose, surrounded by four small floating cartoon versions of her own head with different expressions.",
  "photo-to-cartoon-generator/index.md":
    "{{MAYA}} in a confident hands-on-hips half-body stance, with a neat vertical stack of three small cartoon portraits of herself floating beside her shoulder like freshly made results.",
  "photo-to-cartoon-ai/index.md":
    "{{ARJUN}} in a bust portrait on the left, and a tiny friendly boxy robot with an antenna perched on his shoulder holding a marker pen up toward his face, sparkle bursts around the pen tip.",
  "photo-to-cartoon-ai-free/index.md":
    "{{NOOR}} grinning in half-body with one open upturned palm offering three round coins, and a small friendly boxy robot companion floating beside her other shoulder.",
  "photo-to-cartoon-free/index.md":
    "{{RIYA}} in a warm bust portrait, cupping both hands together in front of her chest with three round coins and a few sparkles resting in her palms.",
  "photo-to-cartoon-online-free/index.md":
    "{{MAYA}} in half-body leaning on a large simple globe beside her, one hand resting on it, three round coins tucked in her other hand, signal arcs rising from the globe's top.",
  "convert-photo-to-cartoon-online-free/index.md":
    "{{ARJUN}} sitting cross-legged full-body on top of a big fluffy cloud, holding a printed photo in one hand and its cartoon version in the other, three coins tumbling from the cloud's edge.",
  "photo-to-cartoon-app/index.md":
    "{{NOOR}} in a close bust portrait holding up a plain rounded rectangle phone outline beside her cheek, her own cartoon face drawn simply inside the empty rectangle.",
  "photo-to-cartoon-image-converter/index.md":
    "{{RIYA}} in half-body fanning out four square printed images like a hand of cards, the leftmost still plain and the rightmost fully redrawn as bold cartoon art.",
  "canva-photo-to-cartoon/index.md":
    "{{MAYA}} standing full-body between two upright display boards, glancing at the plain empty template board on her left and gesturing warmly toward the vivid cartoon portrait board on her right.",
  "how-to-turn-a-photo-into-a-cartoon/index.md":
    "{{ARJUN}} shown three times in a horizontal row joined by a dotted line — first holding a printed photo, then holding a marker pen mid-air, then proudly holding up his finished cartoon portrait.",
  "cartoon-doodles/index.md":
    "{{NOOR}} in a bust portrait, her surrounding space densely filled with small scattered cartoon doodles she appears to have drawn — a cat, a cloud, a star, a cup, a flower, a heart.",
  "doodle-cartoon/index.md":
    "A horizontal three-panel comic strip with thin white gutters, each panel a half-body shot of {{ARJUN}} in a different pose and expression: surprised, laughing, thoughtful.",
  "ai-cartoon-generator/index.md":
    "{{MAYA}} in a close bust portrait on the right, with a big empty speech bubble beside her head containing three sparkle bursts, and her own hand entering the frame holding a marker pen.",
  "ai-cartoon-generator/prompts.md":
    "{{RIYA}} seated in half-body bent over an open sketchbook on a table, drawing, with three small finished cartoon faces already sketched in a row across the visible page.",

  /* ── Core doodle generator cluster ───────────────────────────────────── */
  "doodle-generator/index.md":
    "{{MAYA}} in a warm bust portrait slightly left of centre, one hand raised holding a fat marker pen upright, three small sparkles arcing over her shoulder.",
  "doodle-generator-ai/index.md":
    "{{ARJUN}} sitting cross-legged full-body with a small friendly boxy robot companion sitting opposite him, both holding marker pens and drawing on the same shared sheet between them.",
  "doodle-generator-free/index.md":
    "{{NOOR}} in an excited half-body pose with both arms up, a blank gift tag on a string looped around her wrist and three round coins floating loose beside her.",
  "doodle-generator-online/index.md":
    "{{RIYA}} in half-body seated on a large simple globe as if it were a stool, feet dangling, sketching on a pad in her lap, signal arcs rising behind her.",
  "doodle-generator-from-photo/index.md":
    "{{MAYA}} in a large bust portrait smiling straight at the viewer, holding a small printed photo of herself up beside her cheek so both her real face and the little photo are clearly visible.",
  "ai-doodle-generator/index.md":
    "{{ARJUN}} in a close bust portrait with a marker pen tucked behind his ear and a cluster of bright sparkle bursts blooming above his head.",
  "ai-doodle-generator-free/index.md":
    "{{RIYA}} in half-body holding a marker pen across an open palm that also cradles three round coins, sparkles rising from the pen tip.",
  "ai-doodle-generator-from-photo/index.md":
    "{{NOOR}} in half-body holding a printed photo at arm's length on the left, while the drawn line of her other arm continues off into a loose doodle portrait sketched on the right.",
  "ai-doodle-art-generator/index.md":
    "{{MAYA}} standing full-body beside a small easel, an artist's palette hooked on her thumb and a marker pen in her other hand, a finished doodle artwork on the easel.",
  "ai-doodle-maker/index.md":
    "{{ARJUN}} in half-body leaning over a workbench strewn with a marker pen, a ruler and scissors, holding up the doodle face he has just finished.",
  "doodle-ai-generator/index.md":
    "{{NOOR}} in a bust portrait with a big glowing lightbulb shape floating just above her head, its filament drawn as a tiny doodle face, sparkles ringing the glass.",
  "doodle-maker/index.md":
    "{{RIYA}} standing full-body holding a framed still doodle portrait proudly in both hands, with a film reel lying flat and clearly discarded on the floor behind her heel.",
  "doodle-maker-online/index.md":
    "{{MAYA}} in half-body reclining back against a big fluffy cloud, sketching on a pad held up in front of her, a marker pen tucked into the cloud beside her.",
  "make-a-doodle/index.md":
    "{{ARJUN}} in a bust portrait facing the viewer with a wide proud grin, both hands raised — one holding a fat marker pen, the other holding up a sheet with one bold unfinished doodle face on it.",
  "online-doodle-generator/index.md":
    "{{NOOR}} standing full-body with one foot up on a large simple globe, a long looping cable running from the globe up to the sketch pad under her arm.",
  "doodle-art-generator/index.md":
    "{{RIYA}} standing full-body with her back three-quarters to the viewer, looking up at a gallery wall holding three small framed doodle artworks hung at different heights.",
  "doodle-art-maker/index.md":
    "{{MAYA}} standing full-body at an easel seen from the front, actively painting a bold doodle portrait, a jar of pens on the floor beside the easel legs.",
  "doodle-art/index.md":
    "{{ARJUN}} in a large bust portrait occupying the left half of the frame, leaning back proudly with arms folded, while the right half holds a loose scatter of the doodle motifs he has drawn — spirals, stars, leaves, waves, hearts.",
  "doodle-drawing/index.md":
    "{{RIYA}} seated at a table in half-body, her whole face and torso in frame looking up at the viewer mid-drawing, a large open sheet of paper in front of her with a loose doodle figure sketched on it.",
  "doodle-drawing-generator/index.md":
    "{{NOOR}} in half-body holding a drawing compass in one hand and a marker pen in the other, crossed in front of her, one clean doodle portrait floating beside her shoulder.",
  "doodle-image-generator/index.md":
    "{{MAYA}} in a bust portrait framed inside one crisp square panel, with three smaller empty square panels stacked at an angle behind hers like a queue of results.",
  "hand-drawn-image-generator/index.md":
    "{{ARJUN}} in a bust portrait filling the right half of the frame, smiling as he reaches across with his own arm and draws a looping continuous pen line that curls out into the empty left half.",
  "doodle-sketch/index.md":
    "{{RIYA}} in a clear bust portrait, fully recognisable, holding up a loose scribbly pencil sketch of her own face on a sheet beside her head, a chunky eraser and pencil shavings at the frame's lower corner.",
  "doodle-portrait/index.md":
    "{{MAYA}} large and centred, her head and shoulders filling most of an ornate oval picture frame so her face reads clearly, with a small hook and nail drawn above the frame.",
  "doodle-avatar-generator/index.md":
    "Four circular badge shapes arranged across the frame, each holding a different cast member's head — {{MAYA}}, {{ARJUN}}, {{NOOR}}, {{RIYA}} — like a row of round profile badges.",
  "best-ai-doodle-generator/index.md":
    "{{NOOR}} standing full-body in the centre holding up a large rosette award ribbon with a tiny doodle face at its centre, two smaller rosettes pinned to her denim jacket.",
  "apps-to-doodle-on-photos/index.md":
    "{{ARJUN}} in half-body holding a printed photo of himself flat toward the viewer, drawing directly onto the print with a marker — adding glasses, a hat and loose scribbles on top.",

  /* ── Converter variants ──────────────────────────────────────────────── */
  "photo-to-doodle/index.md":
    "{{MAYA}} in half-body holding a printed photo in her left hand and a hand-drawn doodle portrait in her right, held level, with one thick arrow between them and a sparkle at its tip.",
  "photo-to-doodle-converter/index.md":
    "{{RIYA}} standing full-body between two shallow trays on stands, dropping a printed photo into the left tray while lifting a finished doodle portrait out of the right.",
  "convert-photo-to-doodle/index.md":
    "{{ARJUN}} in a large bust portrait dead centre, fully drawn and clearly recognisable, holding a printed photo of himself in one raised hand while two arrows loop around his head in a closed circle.",
  "convert-photo-to-doodle-online-free/index.md":
    "{{NOOR}} sitting full-body on a big fluffy cloud holding a printed photo in one hand and a doodle portrait in the other, three round coins tumbling from beneath the cloud.",
  "picture-to-doodle/index.md":
    "{{MAYA}} in half-body crouched beside a framed picture leaning against a wall, pointing up at the loose doodle drawing of the same subject pinned on the wall above it.",
  "picture-to-doodle-converter/index.md":
    "{{RIYA}} in half-body turning a hand crank on a small roller machine, a framed picture feeding into one side and a flat doodle drawing of herself emerging from the other.",
  "image-to-doodle/index.md":
    "{{ARJUN}} in half-body lifting the top square image off a stack of three, the lifted one already redrawn as a bold doodle face in his hand.",
  "image-to-doodle-converter/index.md":
    "{{NOOR}} in half-body holding an open folder with several square images fanning out of it, the topmost one already redrawn as a doodle face.",
  "text-to-doodle/index.md":
    "{{MAYA}} in a bust portrait on the right with a big empty speech bubble beside her head, and a small doodle creature hopping out over the bubble's rim onto her shoulder.",

  /* ── Prompt / idea tools ─────────────────────────────────────────────── */
  "doodle-ideas/index.md":
    "{{NOOR}} standing full-body in front of a cork pinboard, reaching up to pin one more blank note card among six already pinned, each card holding a different small doodle motif.",
  "doodle-idea-generator/index.md":
    "{{RIYA}} in half-body tipping a glass jar on its side, folded paper slips spilling out across the frame, one slip unfolded in her other hand showing a small doodle face.",
  "doodle-prompt-generator/index.md":
    "{{ARJUN}} crouched full-body beside a tall gumball machine whose globe is full of small round balls, each ball holding a different tiny doodle motif, one rolling into his cupped hand.",
  "doodle-prompts-generator/index.md":
    "{{MAYA}} in half-body holding a deck of cards fanned in a wide arc, each visible card face showing a different simple doodle motif, one card lifted free between two fingers.",
  "doodle-prompts/index.md":
    "{{RIYA}} seated in half-body with a spiral-bound notepad propped open against her knee, its page filled with a loose vertical list of small doodle motifs instead of writing.",
  "random-doodle-generator/index.md":
    "{{NOOR}} in half-body laughing with delight, a tumbling six-sided die in front of her and three unrelated doodle creatures — a round blob with legs, a spindly bird, a lumpy cat — popping up around her.",
  "doodle-character-generator/index.md":
    "{{ARJUN}} standing full-body centred with arms out, surrounded by four small floating alternative heads, hats and pairs of shoes arranged like swappable parts.",
  "doodle-icon-generator/index.md":
    "{{MAYA}} in a bust portrait on the left, and on the right a tight grid of nine small rounded tiles she has drawn, each holding one minimal doodle icon: a face, a paw, a leaf, a star, a cup, a bell, a key, a cloud, a heart.",
  "how-to-turn-a-photo-into-a-doodle/index.md":
    "{{RIYA}} shown three times in a horizontal row joined by a dotted line — holding a printed photo, then a marker pen raised, then her finished doodle portrait held up proudly.",

  /* ── Coloring / line-art cluster ─────────────────────────────────────── */
  "photo-to-coloring-page/index.md":
    "{{MAYA}} in half-body holding up a large sheet toward the viewer showing herself as a clean uncoloured outline drawing, a loose crayon in her other hand.",
  "coloring-page-generator/index.md":
    "{{ARJUN}} standing full-body holding a single sheet of clean uncoloured outline art at arm's length, three crayons of different lengths tucked in his hoodie pocket.",
  "doodle-coloring-pages/index.md":
    "{{NOOR}} seated cross-legged full-body on the floor with three overlapping sheets of uncoloured doodle outlines fanned out in front of her, one crayon in hand mid-stroke.",
  "doodle-coloring-page/index.md":
    "{{RIYA}} in half-body leaning over one single tilted sheet holding a large uncoloured doodle outline, colouring one small area of it with a single crayon.",
  "doodle-color-pages/index.md":
    "{{MAYA}} in half-body holding a sheet whose left half is already filled with flat bright colour while the right half is still bare outline, her crayon resting at the boundary.",
  "doodle-art-coloring-pages/index.md":
    "{{ARJUN}} seated in half-body absorbed in a dense page of intricate uncoloured doodle patterns, two small areas already coloured in, crayon poised over a third.",
  "coloring-pages-doodles/index.md":
    "{{NOOR}} lying on her front full-body with four small uncoloured outline sheets laid out in a two-by-two grid in front of her and an open tin of crayons at her elbow.",
  "coloring-doodle-pages/index.md":
    "{{RIYA}} in half-body lifting the top sheet off a tall stack of uncoloured outline pages to reveal the one below, a crayon tucked into the stack as a bookmark.",
  "doodles-coloring-pages/index.md":
    "{{MAYA}} seated in half-body at a wide sheet scattered with several small unrelated uncoloured doodle outlines, two crayons crossed in the sheet's empty centre.",
  "printable-doodle-coloring-pages/index.md":
    "{{ARJUN}} in half-body crouched beside a small printer, catching a sheet of uncoloured doodle outline as it feeds out of the slot, a crayon waiting on the tray.",
  "doodle-coloring-pages-printable/index.md":
    "{{NOOR}} in half-body scooping up a stack of freshly printed uncoloured outline sheets from an output tray, the top sheet curling upward, crayon behind her ear.",
  "doodle-coloring-pages-free/index.md":
    "{{RIYA}} in half-body offering a rolled uncoloured outline sheet on one open upturned palm, three round coins and a blank gift tag resting beside it.",
  "free-doodle-coloring-pages/index.md":
    "{{MAYA}} in half-body holding up a rolled uncoloured outline sheet with a blank gift tag tied to it by string, three round coins scattered loose below her hand.",
  "adult-doodle-coloring-pages/index.md":
    "{{RIYA}} seated in half-body in a relaxed evening pose, colouring one sheet of very intricate fine-lined doodle pattern, reading glasses folded on the sheet's corner and a steaming mug beside her.",
  "doodle-coloring-pages-for-adults/index.md":
    "{{MAYA}} seated in half-body at a table with a dense mandala-like uncoloured doodle pattern sheet, a fine-tip pen in hand, a folded newspaper and a mug arranged around her.",
  "easy-doodle-coloring-pages/index.md":
    "{{NOOR}} in half-body grinning while colouring a sheet holding three very large simple uncoloured shapes — a round face, a fat cloud, a chunky star — with one thick crayon.",
  "cute-doodle-coloring-pages/index.md":
    "{{RIYA}} in half-body holding up an uncoloured outline sheet of a small round animal with oversized eyes, tiny heart and star outlines scattered across the page.",
  "kawaii-doodle-coloring-pages/index.md":
    "{{NOOR}} in a bust portrait with blush circles on her cheeks, holding up an uncoloured outline of a tiny round character with a big bow and dot eyes, small sparkle outlines beside it.",
  "zen-doodle-coloring-pages/index.md":
    "{{RIYA}} seated cross-legged full-body in a calm posture, colouring a sheet of long flowing continuous wave and spiral lines, a small stack of three balanced pebbles beside her knee.",
  "christmas-doodle-coloring-pages/index.md":
    "{{ARJUN}} in half-body wearing a knitted hat, colouring an uncoloured outline sheet of a simple fir tree with round baubles and a star on top, a candy cane hooked on the sheet's edge.",
  "cute-doodle/index.md":
    "{{NOOR}} in a close bust portrait with an extra-sweet cheerful expression and blush circles, ringed by small floating hearts and sparkles.",

  /* ── Use-case landings ───────────────────────────────────────────────── */
  "cartoon-profile-picture/index.md":
    "Three rounded-square picture frames in a row, each holding a different cast member's head as a profile picture — {{MAYA}}, {{ARJUN}}, {{RIYA}} — each with a slightly different expression.",
  "cartoon-pet-portrait/index.md":
    "{{MAYA}} crouched in half-body beside a happy tan-and-white corgi with one folded ear, one arm around it, both looking at the viewer, small hearts floating above them.",
  "couple-doodle/index.md":
    "{{ARJUN}} and {{RIYA}} standing full-body side by side holding hands and leaning warmly together, a single heart shape floating above their joined hands.",
  "photo-to-sticker/index.md":
    "Five die-cut sticker cut-outs with thick white borders scattered across the frame, each holding {{ARJUN}} in a different expression — laughing, winking, thumbs up, surprised, blowing a kiss — one sticker peeling up at its corner.",
  "whatsapp-sticker-maker/index.md":
    "A vertical column of four die-cut sticker cut-outs with thick white borders, each holding {{NOOR}} in a different expression, the bottom one peeling away from the backing sheet.",
  "doodle-gift/index.md":
    "{{MAYA}} in half-body holding out a wrapped gift box with a big ribbon bow, an open doodle greeting card standing beside it showing a small drawn portrait, hearts floating above.",
  "mood-caption-collage/index.md":
    "A strict grid of six panels with thin white gutters, three across and two down, each panel a close-up of {{RIYA}} with a different expression: hopeful, tired, peaceful, questioning, amused, calm.",
  "diwali-doodle/index.md":
    "{{MAYA}} in half-body in a festive kurta holding a lit sparkler, a row of small oil diya lamps with flames along the lower edge, a swirling rangoli pattern behind her and hanging lanterns above. No deities.",
  "holi-doodle/index.md":
    "{{NOOR}} in half-body laughing with bursts of bright colour powder in the air around her, holding a water pichkari sprayer, loose coloured dots and handprints scattered across the frame. No deities.",
  "ganesh-doodle/index.md":
    "{{RIYA}} in half-body seated behind a brass offering plate holding a small pile of round modak sweets on a banana leaf, a marigold garland curving above her. No deities, no elephants.",
  "onam-doodle/index.md":
    "{{MAYA}} in half-body in a cream-and-gold set-saree kneeling to lay flowers into a circular pookalam arrangement, a small snake-boat outline and banana leaves at the frame's edge. No deities.",

  /* ── Studios ─────────────────────────────────────────────────────────── */
  "for-studios/animation-concept-sprint.md":
    "{{ARJUN}} standing full-body in front of a cork pinboard holding a film clapperboard under one arm, pinning up the third of three small character sketch cards.",
  "for-studios/ai-filmmaker-stills.md":
    "{{MAYA}} standing full-body beside a movie camera on a tripod, holding up a contact sheet showing six small panels of the same doodle character in different standing poses.",
};

/**
 * `lead` states the format up front (a 16:9 header vs a 1:1 portrait) because
 * the model composes very differently for each; HOUSE_STYLE then keeps the
 * rendering consistent across both. Cast tokens are expanded first so a subject
 * can say `{{MAYA}}` and still get the full, identical character description.
 *
 * The default lead ORDERS a character into frame before describing anything
 * else. Without that clause the model silently drops the person whenever the
 * subject's prop phrase is longer than its character phrase — the first batch
 * lost the character on nine pages that way ("a marker pen tucked behind his
 * ear and a cluster of sparkle bursts" came back as a marker pen alone), and
 * a prop-only thumbnail is exactly the lifeless flat-lay this direction exists
 * to avoid. Stating it in the lead rather than in each subject means no future
 * subject can forget it.
 */
const CHARACTER_LEAD =
  "Wide 16:9 editorial header illustration. MOST IMPORTANT: exactly one illustrated human " +
  "character must be clearly present in frame as the main subject, drawn large enough to read " +
  "their face and expression. Any objects mentioned are secondary props the character interacts " +
  "with — never draw the props on their own without the person.";

function buildPrompt(subject, lead = CHARACTER_LEAD) {
  return `${lead} ${expandCast(subject)} ${HOUSE_STYLE}`;
}

const AVATAR_LEAD =
  "Square 1:1 single-character avatar illustration, subject filling most of the frame.";

/**
 * Static pages that need an Open Graph image but have no article frontmatter to
 * store it in. These are generated with the same HOUSE_STYLE so a shared link
 * to /learn/ looks like it belongs to the same set as a shared article.
 *
 * Generated URLs are printed by `--pages` and wired by hand into OG_IMAGE in
 * src/consts.ts — deliberately not auto-patched, because a bad generation
 * silently rewriting a committed constant is worse than pasting one line.
 */
const PAGES = {
  learn:
    "An open book lying flat with three small doodle faces sketched on its pages, and a marker pen resting beside it.",
  "for-studios":
    "A director's chair on the left and a storyboard grid of six empty panels on the right, with a film reel resting at the base.",
  home: "A single friendly cartoon doodle face in the centre, with a few small sparkles and a marker pen angled beside it.",
  skills:
    "A grid of six equal rounded tiles, each containing one different simple doodle icon: a face, a star, a heart, a paw print, a gift box, a camera.",
};

/**
 * Square sample avatars for the sign-in dialog (src/components/app/AuthDialog.astro).
 *
 * These replace a hand-rolled SVG (`buildAvatarSVG`) whose glasses and hair
 * geometry rendered misaligned over the face. Generated portraits are used
 * instead because they are actually inspected before shipping, and because they
 * show a prospective user roughly what the Normal skill really produces.
 *
 * 1:1 to match the Doodle Avatar skill's own output ratio and the square art
 * well in the dialog.
 */
const AVATARS = {
  "avatar-1":
    "A single friendly cartoon portrait of a person with long wavy hair and round glasses, smiling warmly, head and shoulders only, centred.",
  "avatar-2":
    "A single friendly cartoon portrait of a person with curly hair tied in a top bun, hoop earrings and freckles, smiling, head and shoulders only, centred.",
  "avatar-3":
    "A single friendly cartoon portrait of a person with short cropped hair wearing a knitted beanie, cheerful open grin, head and shoulders only, centred.",
};

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

async function generate(apiKey, prompt, { model, size, aspectRatio = ASPECT_RATIO }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, aspect_ratio: aspectRatio }),
  });
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

function parseArgs(argv) {
  const args = {
    slugs: [],
    all: false,
    force: false,
    dryRun: false,
    pages: false,
    avatars: false,
    model: MODEL,
    size: SIZE,
    /**
     * Cap on how many images one invocation generates. Exists because a
     * full backfill is ~85 sequential API calls at roughly 10-20s each, which
     * outlives the command timeout of most automated runners. Every successful
     * generation writes its `heroImage` immediately and a written hero no longer
     * counts as `needs`, so `--all --limit 15` run repeatedly is resumable by
     * construction and never regenerates a page twice.
     */
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") args.all = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--pages") args.pages = true;
    else if (arg === "--avatars") args.avatars = true;
    else if (arg === "--slug" || arg === "--model" || arg === "--size" || arg === "--limit") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      if (arg === "--slug") args.slugs.push(value);
      else if (arg === "--model") args.model = value;
      else if (arg === "--limit") {
        const n = Number.parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1) throw new Error(`--limit needs a positive integer`);
        args.limit = n;
      } else args.size = value;
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

  // Static-page OG images and sign-in avatars. Separate path from articles:
  // nothing to patch, the URLs are printed for wiring into src/consts.ts.
  if (args.pages || args.avatars) {
    const isAvatars = args.avatars;
    const set = isAvatars ? AVATARS : PAGES;
    const aspectRatio = isAvatars ? "1:1" : ASPECT_RATIO;
    const lead = isAvatars ? AVATAR_LEAD : undefined;
    const target = isAvatars ? "AUTH_AVATARS" : "OG_IMAGE";

    if (args.dryRun) {
      for (const [name, subject] of Object.entries(set)) {
        console.log(`\n--- ${name} ---\n${buildPrompt(subject, lead)}`);
      }
      console.log(`\nDry run: ${Object.keys(set).length} prompt(s), no credits spent.`);
      return;
    }
    const apiKey = readApiKey();
    if (!apiKey) {
      console.error("PICX_API_KEY not found. Add it to .dev.vars or export it.");
      process.exitCode = 1;
      return;
    }
    console.log(`model ${args.model} @ ${args.size} ${aspectRatio}\n`);
    let pageCredits = 0;
    const results = {};
    for (const [name, subject] of Object.entries(set)) {
      process.stdout.write(`gen   ${name} ... `);
      try {
        const data = await generate(apiKey, buildPrompt(subject, lead), {
          model: args.model,
          size: args.size,
          aspectRatio,
        });
        results[name] = data.url;
        pageCredits += data.credits_used ?? 0;
        console.log(`ok (${data.credits_used ?? "?"} credits)`);
      } catch (err) {
        console.log(`FAILED\n      ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`\n~${pageCredits} credits used. Paste into ${target} in src/consts.ts:\n`);
    for (const [name, url] of Object.entries(results)) {
      console.log(`  ${name}: "${url}",`);
    }
    return;
  }

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
        `\nRun with --all to generate them (~15 PicX credits each on the default` +
        ` model), or --slug <name> for one.`,
    );
    return;
  }

  const skipped = targets.filter((t) => !args.force && !t.needs);
  const eligible = args.force ? targets : targets.filter((t) => t.needs);
  const queue = eligible.slice(0, args.limit);
  const deferred = eligible.length - queue.length;
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

  console.log(`model ${args.model} @ ${args.size} ${ASPECT_RATIO}\n`);

  for (const t of queue) {
    process.stdout.write(`gen   ${t.key} ... `);
    try {
      const data = await generate(apiKey, buildPrompt(SUBJECTS[t.key]), {
        model: args.model,
        size: args.size,
      });
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
  if (deferred > 0) {
    console.log(`${deferred} still pending — run the same command again to continue.`);
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
