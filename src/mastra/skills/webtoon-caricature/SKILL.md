---
name: webtoon-caricature
description: 'Use when the user wants a Korean webtoon or manhwa style comic transformation of their photo, with speech bubbles and panel beats.'
license: MIT
user-invocable: true
metadata:
  id: webtoon
  displayName: Webtoon Caricature
  tagline: 4 comic panels with speech bubbles from one photo
  desc: 'Turns a photo into 4 separate thick-line webtoon comic panels of the same character — each a different dramatic beat with a hand-lettered speech bubble.'
  longDesc: 'Creates four individual square webtoon-style comic panels from a single photo. Each panel shows the same recognisable character in a different cinematic beat (Hero Shot, Reaction, Close-Up, Action) drawn in a thick-line Korean-webtoon style with cel-shaded colour, halftone textures, and a hand-lettered speech bubble. Designed for sharing as a mini comic strip or social media set.'
  category: packs
  tags: [webtoon, comic, speech-bubbles]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 3
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_103b981c-244f-4237-ad30-20702868129f.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_1c612a1f-0cd2-4f18-9367-965f33257349.png"
  order: 18
---

# Webtoon Caricature

Turn one uploaded photo into 4 separate square webtoon comic panels — the same
character in four dramatic beats, each with a hand-lettered speech bubble.

## When this is the right skill

Pick this skill when the user wants:

- A Korean webtoon / manhwa style transformation of their photo
- Comic panels with speech bubbles from a selfie
- A mini comic strip or social media set in thick-line comic style
- "Make me look like a webtoon character" or "turn me into a comic"
- Dramatic panel beats (hero shot, reaction, close-up, action)

Do NOT use this for a single doodle portrait (use classic or mini-me), for
expression stickers without bubbles (use expression-sheet), or for a Western
comic-book style (different aesthetic — heavy crosshatch vs. clean cel-shading).

## What to draw

Four separate 1:1 images, each a thick-line webtoon comic panel of the same
person in a different cinematic beat:

1. **Hero Shot** — confident three-quarter pose, slight low angle, "Let's go!"
2. **Reaction** — comedic surprise, speed-line background, "No way!"
3. **Close-Up** — intense gaze filling the frame, dramatic shadow, "Watch me."
4. **Action** — dynamic motion with streaking lines, "Take this!"

Visual style: clean uniform-weight ink outlines, flat cel-shaded colour with
hard-edged shadows, glossy anime-style hair highlights, large expressive eyes
with catchlights, soft blush on cheeks, screentone halftone dot texture on
clothing shadows, rounded hand-lettered speech bubbles.

Character consistency is paramount: hairstyle, hair colour, face shape, skin
tone, eye colour, accessories, and outfit are identical across all four panels.
Only framing, pose, expression, and bubble text change.

### IP / style constraint

Prompts describe the GENERIC visual qualities of the webtoon/manhwa medium.
They NEVER name a real artist, real series, real studio, or any living
illustrator. This avoids likeness-of-style IP claims.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "webtoon"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. The tool returns FOUR separate images (one per panel beat). Cost: 4 credits (1 per image).
5. Report the result briefly; the app renders all four panels in a grid.

## Following up

Offer to regenerate a single panel the user dislikes, suggest different bubble
text via the description field, or recommend expression-sheet for a larger
sticker set without speech bubbles.
