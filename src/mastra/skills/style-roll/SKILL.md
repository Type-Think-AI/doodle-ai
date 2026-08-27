---
name: style-roll
description: 'Use when the user wants to see their photo in multiple art styles to choose from, or asks for different drawing styles, a style sampler, or "give me options".'
license: MIT
user-invocable: true
metadata:
  id: style-roll
  displayName: Style Roll
  tagline: 4 distinct art styles from one photo — pick your favourite
  desc: 'Transforms a photo into 4 separate doodle portraits, each in a genuinely different hand-drawn medium (marker, crayon, ink sketch, watercolour), so the user can choose the style they like best.'
  longDesc: 'Addresses the #1 pain point of single-roll AI art — you never know if you will like the result. Style Roll generates four materially different illustrations of the same person from one photo: bold felt-tip marker, waxy crayon, cross-hatched ink pen, and soft watercolour wash. Same person, same framing, four different media. Pick your favourite and run with it.'
  category: packs
  tags: [style-sampler, multi-style, pick-favourite]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  order: 15
---

# Style Roll

Upload one photo, get four genuinely different hand-drawn styles of the same
person — then pick the one you like best.

## When this is the right skill

Pick this skill when the user wants:

- Multiple art styles to choose from ("give me options", "show me different styles")
- A style sampler or comparison of illustration media
- To try different looks before committing to one
- "I don't know what style I want" or "surprise me with variety"

Do NOT use this for a single specific style (use normal, crayon, or mini-me),
for multiple expressions of one style (use expression-sheet), or for seasonal
variations (use seasonal-pack).

## What to draw

Four separate 1:1 images from the same uploaded photo, each rendered in a
materially different hand-drawn medium:

1. **Marker** — bold felt-tip on sketch paper, thick outlines, flat colour fills, directional hatching
2. **Crayon** — wax crayon on textured paper, soft waxy strokes, paper grain showing through
3. **Ink Sketch** — black pen cross-hatching on cream paper, no colour, pure linework depth
4. **Watercolour** — translucent washes on cold-pressed paper, bleeding edges, paper-white highlights

Character consistency is paramount: hairstyle, hair colour, face shape, skin
tone, accessories, and outfit are identical across all four. Only the drawing
medium changes — that IS the product.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "style-roll"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. The tool returns FOUR separate images (one per medium). Cost: 4 credits (one generation per image).
5. Present all four and ask which style the user prefers.

## Following up

Once the user picks a favourite style, offer to generate more images in that
specific style (suggest the matching single-style skill if one exists), or
offer to re-roll one of the four they didn't like with a tweaked prompt.
