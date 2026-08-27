---
name: crayon-self
description: 'Use when the user wants a deliberately bad, ugly-cute, childlike drawing of themselves — phrases like "draw me badly", "like a 4 year old drew it", "crayon drawing of me", "ugly cute", "MS Paint me", "scribble me", "make it look terrible", "kindergarten portrait", "kid drawing", or "deliberately bad". For a polished hand-drawn avatar, use doodle-avatar instead. For sticker sheets, use sticker-pack.'
license: MIT
user-invocable: true
metadata:
  id: crayon
  displayName: Crayon Self
  tagline: A 4-year-old drew you (on purpose)
  desc: 'Turns your photo into a wobbly, ugly-cute crayon drawing — deliberately bad, unmistakably you.'
  longDesc: 'Redraws you as if a charming but untalented 4-year-old grabbed their crayons and did their absolute best: wobbly uneven outlines, colour scribbled outside the lines, hilariously wrong proportions, maybe your name misspelled in shaky child handwriting — on notebook paper with visible waxy crayon texture. Still recognisably you.'
  category: avatars
  tags: [crayon, ugly-cute, childlike, anti-slop]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 1
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_99868a77-06d4-4421-9101-30d37aa41808.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_2448ea08-f6d9-4096-bb0e-c1bcba04172e.png"
  order: 10
---

# Crayon Self

Turn one uploaded photo into a deliberately bad, charming crayon drawing —
as if a genuine 4-year-old studied you for ten seconds and drew you with
their favourite waxy crayons on notebook paper.

## When this is the right skill

Pick this skill when the user explicitly wants something ugly-cute,
childlike, deliberately terrible, or drawn-by-a-kid. The intent is humour
and charm through incompetence, not polish.

Choose a different skill instead when the user asks for:

- a polished hand-drawn doodle avatar → `doodle-avatar`
- a multi-panel expression grid → `doodle-collage`
- full-body action poses → `full-body-collage`
- die-cut stickers → `sticker-pack`
- mood-captioned panels → `mood-captions`
- a greeting card → `gift`
- artwork with no photo → `surprise-me`

## What to draw

The reference is a genuine small child's crayon drawing. Charming-bad, not
broken-bad. See `references/bad-on-purpose.md` for the full line between
those two.

Keep these recognisability anchors from the photo so the joke lands:

- hair colour and rough shape
- glasses (if worn)
- one or two signature features (beard, freckles, distinctive clothing)

Apply these childlike distortions:

- wobbly, uneven outlines (not smooth vector art)
- colour scribbled enthusiastically outside the lines
- wrong proportions: huge circle head, stick limbs, tiny body
- a lopsided open smile (the kid tried)
- optional: the person's name in wobbly misspelled child handwriting
- drawn on white or faintly lined notebook paper
- visible waxy crayon texture

## How to run it

1. Confirm a photo is attached. If none is, ask the user to attach one —
   do not call the tool without a photo.
2. Call `generateDoodle` with `skill: "crayon"` and the uploaded photo as
   `imageUrl`.
3. If the user also attached a style reference, pass it as `refImageUrl`.
4. Report the result briefly. The app displays the image itself.

## Following up

After a successful generation, offer to try doodle-avatar for a polished
version, or sticker-pack for die-cut stickers of the same face.
