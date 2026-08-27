---
name: expression-sheet
description: 'Use when the user wants an expression pack, reaction stickers, emotion set, or multiple expressions of the same person from a photo.'
license: MIT
user-invocable: true
metadata:
  id: expressions
  displayName: Expression Pack
  tagline: 9 expressive reaction stickers from one photo
  desc: 'Turns a photo into 9 separate doodle stickers of the same character, each showing a different expression — ready to use as messaging reactions.'
  longDesc: 'Creates nine individual square doodle stickers from a single photo. Each sticker shows the same recognizable character in a different expression (happy, laughing, love, sad, angry, shocked, thinking, sleepy, thumbs up) with matching die-cut borders, designed for use as a custom messaging sticker set.'
  category: collages
  tags: [expressions, reactions, sticker-set]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  order: 14
---

# Expression Pack

Turn one uploaded photo into 9 separate square doodle stickers — the same
character in nine distinct expressions, each its own image file.

## When this is the right skill

Pick this skill when the user wants:

- An expression or reaction sticker set of themselves
- Multiple emotions / moods of the same character
- A messaging sticker pack (WhatsApp, Telegram, iMessage, Discord)
- "Give me different reactions" or "make me an emoji set"

Do NOT use this for a single sticker sheet image (use sticker-pack instead)
or for a collage grid (use collage or mood-captions).

## What to draw

Nine separate 1:1 images, each a head-and-shoulders naive marker-and-ink
doodle of the same person showing one expression:

1. Happy — big smile, sparkles
2. Laughing — head back, mouth wide
3. Love — hands forming heart, floating hearts
4. Sad — downturned mouth, teardrop
5. Angry — crossed arms, vein-pop mark
6. Shocked — wide eyes, O mouth, exclamation lines
7. Thinking — chin-in-hand, thought bubble
8. Sleepy — droopy eyes, Zzz marks
9. Thumbs Up — confident grin, raised thumb

Character consistency is paramount: hairstyle, hair colour, face shape,
skin tone, accessories, and outfit are identical across all nine. Only
expression, head tilt, hand gesture, and emotive marks change.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "expressions"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. The tool returns NINE separate images (one per expression). Cost: 9 credits (one generation per image).
5. Report the result briefly; the app renders all nine images in a grid.

## Following up

Offer to regenerate a single expression the user dislikes, suggest a
different theme, or recommend the sticker-pack skill for a composite
sheet layout instead.
