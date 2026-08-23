---
name: doodle-collage
description: 'Use when the user asks for multiple close-up poses, expressions, or faces from one photo — for example "six different expressions", "a contact sheet", "a collage of my face", or "3x2 grid".'
license: MIT
user-invocable: true
metadata:
  id: collage
  displayName: Doodle Collage
  tagline: Six close-up doodle poses in one 3x2 grid
  desc: 'Turns a photo into a landscape 3-column by 2-row collage of the same illustrated subject in six different candid close-up moments.'
  longDesc: 'Reads your photo once, then draws six different candid close-up poses and expressions of the same illustrated character across a 3x2 grid, with hand-drawn doodle overlays (motion lines, sparkles, squiggles) tying the panels together like a lively scrapbook page.'
  category: collages
  tags: [collage, six panel, scrapbook]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 1
  order: 1
---

# Doodle Collage

Turn one uploaded photo into a single wide landscape image laid out as a
strict 3-column by 2-row grid — six close-up panels in one picture.

## When this is the right skill

Pick this skill whenever the user wants **more than one** version of
themselves from a single photo, framed close-up: a set of expressions, a
contact sheet, a mood board of faces, a "6 panel" or "3x2" request.

Choose a different skill instead when the user asks for:

- one single portrait → `doodle-avatar`
- head-to-toe or action poses → `full-body-collage`

## What to draw

One image, six panels. Every panel shows the **same** illustrated character
— matching hairstyle, face shape, and outfit translated from the photo into
doodle art — captured in a different candid close-up moment. Vary the pose,
camera angle, and expression from panel to panel while keeping it obviously
the same person.

Hand-drawn doodle overlays (motion lines, sparkles, squiggles, small stars)
run across and between the panels to tie the page together like a scrapbook
spread. See `references/grid-layout.md` for the panel breakdown and
`../doodle-avatar/references/style-guide.md` for the shared house style.

## How to run it

1. Confirm a photo is attached. If none is, ask for one — this skill cannot
   run without a subject to redraw.
2. Call `generateDoodle` with `skill: "collage"` and the uploaded photo as
   `imageUrl`.
3. If the message contains a line like `Reference image: <url>`, pass it as
   `refImageUrl` — it is an extra style reference, not the subject.
4. Report the result briefly. The app renders the image, so do not repeat
   the URL.

## Following up

Offer the full-body variant (`full-body-collage`) as the natural next step,
or a refinement such as fewer overlay doodles or a different palette.
