---
name: chibi-mini-me
description: 'Use when the user wants tiny cartoon mini versions of themselves drawn on top of their real photo — "add mini versions of me", "chibi me on my photo", "cute doodles on my selfie", "annotate my photo with chibis", "Q版", or any request for cartoon overlays on a real image. This is NOT a photo-to-cartoon conversion; the photo stays photographic and only the overlay elements are drawn. For a full cartoon avatar, use doodle-avatar. For a sticker sheet, use sticker-pack. For a grid of illustrated panels, use doodle-collage or full-body-collage. For mood-word captions, use mood-captions.'
license: MIT
user-invocable: true
metadata:
  id: mini-me
  displayName: Chibi Mini-Me
  tagline: Tiny cartoon versions of you doodled over your real photo
  desc: 'Keeps your photo intact and draws cute chibi mini versions of you plus handwritten annotations on top.'
  longDesc: 'Preserves the original photograph as the untouched base layer, then overlays 3-5 tiny chibi cartoon miniatures of the same person doing small playful actions, plus handwritten-marker captions, arrows, and sparkle doodles — like an illustrated selfie annotation.'
  category: avatars
  tags: [chibi, overlay, selfie, annotation]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_12e6d35b-56e0-458c-9300-cefae33bcf46.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_2448ea08-f6d9-4096-bb0e-c1bcba04172e.png"
  order: 9
---

# Chibi Mini-Me

Overlay tiny hand-drawn chibi cartoon miniatures of the user on top of their
real unretouched photo, with handwritten-style annotations and doodle accents.

## When this is the right skill

Pick this skill when the user wants cute illustrated mini versions of
themselves drawn **over** their actual photo — the photo stays real, only
the overlays are cartoon. This is the viral "Q版" selfie-annotation trend.

Choose a different skill instead when the user asks for:

- a full cartoon avatar replacing the photo → `doodle-avatar`
- a 3×2 grid of illustrated panels → `doodle-collage`
- full-body action poses in a grid → `full-body-collage`
- a die-cut sticker sheet → `sticker-pack`
- mood-word captioned panels → `mood-captions`
- a greeting card → `gift`
- no photo at all → `surprise-me`

## What to draw

The base layer is the user's photograph — it must remain **photographic and
unretouched**. Do not cartoonify the photo, do not apply filters, do not
alter the subject's real face or body.

On top of that photo, draw:

1. **3–5 tiny chibi miniatures** of the same person (recognizable by hair,
   outfit colour, face shape) performing small playful actions that relate
   to the photo's context — cheering, holding a mini sign, climbing on the
   subject's shoulder, napping, drinking water, etc.
2. **Short handwritten-marker captions and arrows** pointing to elements in
   the photo or reacting to them. Keep text to 2–4 words per caption.
3. **Small doodle accents** — sparkles, hearts, stars, motion lines —
   scattered lightly so the overlay feels spontaneous, not cluttered.

The chibi minis use a bold-outline flat-colour naive doodle style (matching
the Doodle AI house style) while the photo beneath stays photographic. This
contrast is the defining characteristic of the skill.

## How to run it

1. Confirm a photo is attached. If none is, ask the user to attach one —
   do not call the tool without a photo.
2. Call `generateDoodle` with `skill: "mini-me"` and the uploaded photo as
   `imageUrl`.
3. Report the result briefly. The app displays the image itself, so never
   paste the URL back into the conversation.

## Following up

After a successful generation, offer to try different chibi actions, add
more captions, or switch to a full cartoon avatar or sticker sheet.
