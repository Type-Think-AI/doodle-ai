---
name: coloring-page
description: 'Use when the user wants a printable colouring page of themselves, a friend, a kid, or a pet from a photo — phrases like "colouring page", "coloring book page", "line art to colour in", "black and white outline of me", "turn my photo into a page I can print and colour", or "colouring sheet". The output is uncoloured line art, not a finished coloured drawing. For a fully coloured childlike crayon portrait, use crayon-self instead. For a polished coloured doodle avatar, use doodle-avatar.'
license: MIT
user-invocable: true
metadata:
  id: coloring
  displayName: Coloring Page
  tagline: 'Your photo, redrawn as a printable colouring page'
  desc: 'Turns a photo into clean black-and-white line art — bold closed outlines, no fill — ready to print and colour in by hand.'
  longDesc: 'Redraws the person or pet in your photo as a real colouring-book page: bold confident black outlines, every shape fully closed, generous white space inside so colour never leaks, and a plain white background. No colour, no shading, no gradients — just neat line art you print out and colour in with crayons, pencils, or markers. Still recognisably the subject in the photo.'
  category: freeform
  tags: [coloring, line art, printable, kids]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 4
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_60da4049-9adf-4901-ac58-42c5567acbe5.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_a5af382e-7ea1-4712-813c-f33a65d78ffd.jpg"
  order: 21
---

# Coloring Page

Turn one uploaded photo into a clean, printable colouring page — bold
uncoloured line art on plain white paper, made to be printed and coloured
in by hand. The output is an outline drawing only: crisp black lines,
every region left empty and ready to fill.

## When this is the right skill

Pick this skill when the user wants line art they can print and colour in
themselves — a colouring-book page of a person, a child, a friend, or a
pet from their photo. The intent is an *uncoloured* sheet: the fun is in
colouring it in later, so the model must leave every shape empty.

Choose a different skill instead when the user asks for:

- a fully coloured childlike crayon drawing → `crayon-self`
- a polished hand-drawn doodle avatar with colour → `doodle-avatar`
- a multi-panel expression grid → `doodle-collage`
- full-body action poses → `full-body-collage`
- die-cut stickers → `sticker-pack`
- mood-captioned panels → `mood-captions`
- a greeting card → `gift`
- artwork with no photo → `surprise-me`

If the user wants the drawing *already coloured*, this is the wrong skill —
send them to `crayon-self` or `doodle-avatar`.

## What to draw

The reference is a page from a children's colouring book: bold black
outlines on white, nothing filled in. It should still read clearly as the
subject in the photo, just reduced to clean colourable line work.

Keep these recognisability anchors from the photo:

- overall pose, silhouette, and proportions
- hairstyle shape, glasses, and facial hair
- one or two signature features (a hat, freckles as tiny outlined dots, a
  distinctive item of clothing)

Redraw the photo as printable line art:

- bold, confident, fully **closed** outlines — every shape completely
  bounded so colour can't leak between regions
- even, consistent line weight like a printed colouring book, slightly
  thicker on the outer silhouette and finer for interior detail
- generous white space inside every shape — no fill of any kind
- busy areas simplified into a few large, clearly separated regions rather
  than many tiny ones
- shadows and shading reduced to a handful of optional contour lines, never
  tone
- a plain empty white background, no scene or border unless a theme calls
  for one simple outlined prop

The single hardest constraint: **no colour and no fill anywhere**. If any
region ends up shaded, tinted, or filled in, the page is unusable — the
whole point is that the person colours it in themselves.

## How to run it

1. Confirm a photo is attached. If none is, ask the user to attach one —
   do not call the tool without a photo.
2. Call `generateDoodle` with `skill: "coloring"` and the uploaded photo as
   `imageUrl`.
3. If the user also attached a style reference, pass it as `refImageUrl`.
4. Report the result briefly. The app displays the image itself.

## Following up

After a successful generation, offer to print it at page size, or suggest
`crayon-self` if the user would rather see a colourful childlike version
instead of colouring one in themselves.
