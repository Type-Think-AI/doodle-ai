/**
 * Doodle Idea — prompt builder for the text-only "draw the thing I typed" skill.
 *
 * The opposite of Surprise Me: Surprise Me invents a random fictional CHARACTER
 * and ignores the user's words; this skill draws THE IDEA the user actually
 * typed — an object, scene, motif, creature, or small still life — in the house
 * doodle style. With an empty description it picks one interesting CONCRETE
 * subject rather than defaulting to a person, because the pages using it are
 * "doodle ideas", "doodle prompt generator" and "random doodle generator",
 * where the visitor wants something to draw, not a portrait of a stranger.
 */

/** Concrete, drawable non-person seeds for the empty-description case.
 *  Objects, creatures, food, plants, vehicles and tiny scenes — never a person. */
const IDEA_SEEDS = [
  "a sleepy cat curled up inside a teacup",
  "a tiny rocket ship blasting off from a flower pot",
  "a stack of pancakes with a pat of melting butter",
  "a friendly robot watering a small potted plant",
  "a hot air balloon shaped like a strawberry",
  "a snail carrying a cozy mushroom house on its back",
  "a paper boat sailing across a puddle",
  "a cactus wearing a tiny sun hat",
  "a bowl of ramen with a swirl of steam",
  "a little owl perched on a crescent moon",
  "a bicycle with a basket full of flowers",
  "a whale spouting a fountain of stars",
  "a lighthouse on a rocky little island",
  "a jar of fireflies glowing at night",
  "a fox napping under a big autumn leaf",
];

function pickSeed(): string {
  return IDEA_SEEDS[Math.floor(Math.random() * IDEA_SEEDS.length)];
}

export function buildDoodleIdeaPrompt(input: { themeHint: string; description?: string }): string {
  const idea = input.description?.trim();

  const subjectBlock = idea
    ? `WHAT TO DRAW:
- Draw exactly this idea: "${idea}".
- Follow it closely — the subject itself, its setting, and any little details named.
- If it names an object, scene, motif, creature, or still life, keep that as the ONE clear subject; do not swap it for a person or a portrait unless the idea explicitly asks for one.
- Keep it a single cohesive composition centred with breathing room, not a collage or a grid.`
    : `WHAT TO DRAW:
- No idea was given, so draw this concrete subject: ${pickSeed()}.
- It MUST be a single, clear, drawable object / creature / scene — NOT a person, NOT a portrait, NOT a face. The visitor wants something fun to draw, not a picture of a stranger.
- Keep it one cohesive composition centred with breathing room, not a collage or a grid.`;

  return `Create a single hand-drawn illustrated doodle. This is a "give me something to draw" doodle of a subject described in words — there is no photo and no real person involved.

${subjectBlock}

MEDIUM AND STYLE:
- Naive marker-and-ink doodle, the same house look as a cute hand-sketched cartoon.
- Bold clean confident outlines, simplified friendly shapes, flat cheerful colour.
- Warm off-white background with a little empty space around the subject.
- Playful, spontaneous, hand-drawn charm — like a doodle in the margin of a sketchbook.

HARD NEGATIVES — DO NOT produce any of these:
- No photorealism, no photographic texture, no realistic lighting or shadows.
- No 3D render, no clay/plastic look, no heavy realistic shading or gradients.
- No technical diagram, no clip-art, no stock-illustration slickness.
- No collage, no multi-panel grid, no split scenes — one subject, one composition.
- No lettering, no captions, no signage, no text of any kind.
- No watermark, no logo, no frame or border.

Apply this visual flavour: ${input.themeHint}.

The final image must read unmistakably as one cheerful hand-drawn doodle of the described idea, not a photograph.`;
}
