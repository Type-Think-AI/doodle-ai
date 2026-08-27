/**
 * Festival Pack — prompt builder (multi-image pack)
 *
 * Recipe: one uploaded photo → six SEPARATE square doodle images of the same
 * person, each in a different Indian festival scene. Each image changes ONLY
 * the festival-specific layer (clothing details, colour palette, background
 * motifs, overlay doodles) while keeping the person fully recognisable across
 * the set.
 *
 * This is a pack skill: it returns PackVariant[], one entry per image.
 * generate-doodle.ts runs one API call per variant in parallel; total cost
 * is 6 credits (one per image).
 *
 * Cultural accuracy is paramount — each festival's motifs, colour language,
 * and context are historically and regionally specific. No deities depicted.
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Shared medium preamble (front-loaded to anchor the model) ----

const MEDIUM_PREAMBLE = `Naive marker-and-ink doodle illustration. Bold clean hand-drawn outlines, flat cheerful colour with visible marker hatching for shading, warm-white/cream ground. Playful slightly exaggerated proportions, simplified facial features.`;

// ---- Shared negative constraints ----

const NEGATIVES = `ABSOLUTE CONSTRAINTS: No photorealism, no photographic skin texture, no 3D render, no smooth gradient shading, no rendered fur or hair strands, no vector-art or comic-book rendering, no watermarks, no logos, no text or captions unless explicitly stated. No depiction of deities or religious idols. The result is clearly hand-drawn doodle artwork.`;

// ---- Shared identity-preservation clause ----

const IDENTITY = `Preserve the person's recognisable hairstyle, face shape, skin tone, expression, and accessories — correct shapes, never realistic rendering. Identical head-and-shoulders-to-waist framing in all six festival images. The character must be obviously the same person across all six.`;

/**
 * Build the generation prompts for the Festival Pack skill.
 *
 * Returns exactly 6 PackVariant objects (Diwali, Holi, Raksha Bandhan,
 * Onam, Pongal, New Year), each with a complete standalone prompt for
 * /v1/images/edit.
 */
export function buildFestivalPack(input: PromptInput): PackVariant[] {
  return [
    {
      label: "Diwali",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a Diwali celebration scene. ${IDENTITY}

FESTIVAL LAYER — DIWALI (Festival of Lights):
- Clothing: festive kurta or saree with simple gold-accent doodle patterns, dupatta or stole draped casually.
- Palette: warm amber, deep saffron, marigold gold, rich maroon, flickering orange highlights.
- Background: warm-white ground with a night-time atmosphere — scattered small hand-drawn diyas (clay oil lamps) with tiny flame marks, a partial rangoli pattern drawn in simple geometric shapes on the ground, strings of small round lights suggested by dotted arcs.
- Overlay doodles: marigold flower garlands sketched as simple round clusters, small sparkler trails as dotted lines, gentle warm glow marks around the diyas.
- Lighting mood: warm amber night glow — the character lit from below by lamp-light.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Holi",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a Holi celebration scene. ${IDENTITY}

FESTIVAL LAYER — HOLI (Festival of Colours):
- Clothing: white kurta or white T-shirt heavily stained with splashes of bright dry colour powder — magenta, electric blue, sunny yellow, vivid green.
- Palette: pure white base clothing with bold saturated colour splashes — hot pink, cerulean blue, marigold yellow, parrot green, deep violet.
- Background: warm-white ground with bright daytime energy — puffs and clouds of dry colour powder floating in the air drawn as loose irregular blobs, small water balloons sketched as simple teardrop shapes, splatters of colour radiating outward.
- Overlay doodles: powder-burst marks as starburst scribbles, small droplet trails, motion lines suggesting thrown colour, a simple pichkari (water gun) outline nearby.
- Lighting mood: bright sunny daytime — high energy and joy.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Raksha Bandhan",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a Raksha Bandhan celebration scene. ${IDENTITY}

FESTIVAL LAYER — RAKSHA BANDHAN (Bond of Protection):
- Clothing: neat festive outfit — kurta with simple embroidery marks or a salwar-kameez, dressed up but comfortable.
- Palette: warm rose pink, soft saffron, gentle lavender, cream, gold thread accents.
- Background: warm-white ground with an intimate indoor warmth — a simple thali (plate) sketched nearby holding a rakhi thread, a few round sweets (laddoo shapes), small scattered rice grains and kumkum dots.
- Key motif: one wrist prominently showing a decorative rakhi thread being tied — the thread drawn as a simple braided line with a small central ornament.
- Overlay doodles: tiny heart marks suggesting sibling warmth, small diya flame, delicate floral border elements at edges.
- Lighting mood: soft warm indoor glow — affectionate and gentle.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Onam",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in an Onam celebration scene. ${IDENTITY}

FESTIVAL LAYER — ONAM (Kerala Harvest Festival):
- Clothing: traditional white-and-gold kasavu — Kerala mundu/set-saree with a distinctive gold border drawn as a simple parallel-line edge, jasmine flowers tucked in the hair.
- Palette: clean white, rich gold border accents, deep green of banana leaves, warm marigold and orange pookalam flowers, earthy brown.
- Background: warm-white ground with Kerala motifs — a circular pookalam (flower carpet) drawn as concentric rings of simple petal shapes in orange, yellow and white on the ground, large banana leaf shapes at the edges, distant suggestion of a snake boat prow as a single curved line.
- Overlay doodles: small jasmine buds as dot-clusters, banana motifs, simple round payasam bowl, tiny coconut palm silhouettes at the margins.
- Lighting mood: bright golden morning — lush and celebratory.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Pongal",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a Pongal harvest celebration scene. ${IDENTITY}

FESTIVAL LAYER — PONGAL (Tamil Harvest Festival):
- Clothing: bright traditional outfit — vibrant cotton saree or veshti-shirt combo, simple kolam-inspired patterns on fabric suggested by small dot-and-line motifs.
- Palette: sunny golden yellow, terracotta orange, sugarcane green, earthy brown clay tones, bright turmeric.
- Background: warm-white ground with a sunny outdoors feel — a clay pot (pongal pot) with rice boiling over the rim (small bubble marks and steam lines), sugarcane stalks drawn as simple vertical lines with leaf tufts, a kolam (rice-flour pattern) on the ground as a geometric dot-grid design.
- Overlay doodles: small sun-burst marks representing Surya (as a simple radiating circle, not a deity), tiny rice grain shapes, turmeric plant sketches, short celebratory motion lines.
- Lighting mood: warm bright outdoor sunshine — harvest abundance.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "New Year",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a New Year celebration scene. ${IDENTITY}

FESTIVAL LAYER — NEW YEAR (Midnight Celebration):
- Clothing: smart festive outfit — sparkly top or sharp kurta/blazer, party accessories like a simple hand-drawn party hat or tinsel scarf.
- Palette: deep midnight blue, shimmering gold, bright silver, hot magenta, electric purple accents against the dark sky.
- Background: warm-white ground transitions to a night-sky feel at the top — bold firework bursts drawn as simple starburst lines, scattered confetti pieces as tiny geometric shapes (squares, circles, triangles), curling ribbon streamers as simple spiral lines.
- Overlay doodles: hand-drawn sparklers with radiating dot trails, a small "2027" sketched in playful hand-lettering floating among the fireworks, tiny star shapes scattered throughout, confetti motion trails.
- Lighting mood: exciting midnight energy — firework-lit night sky with warm celebration glow on the character.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
  ];
}
