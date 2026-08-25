---
name: full-body-collage
description: 'Use when the user asks for full-body, head-to-toe, or action poses from one photo — for example "dancing", "karate", "jumping", "action shot", "full body", or "my whole body doing stuff".'
license: MIT
user-invocable: true
metadata:
  id: full-body
  displayName: Full-Body Action Collage
  tagline: Six full-body action poses in one 3x2 grid
  desc: 'Like Doodle Collage, but head-to-toe: six dynamic full-body poses (dancing, jumping, walking) of the same illustrated character.'
  longDesc: 'Same 3x2 landscape grid as Doodle Collage, but every panel shows the full body performing a different dynamic action — dancing, jumping, walking, stretching — with motion-line doodle overlays that trace the movement across the page.'
  category: collages
  tags: [full body, action, six panel]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 2
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_889bf322-8840-44d1-82ea-fac82be13d77.png"
  order: 2
---

# Full-Body Action Collage

Turn one uploaded photo into a single wide landscape image laid out as a
strict 3-column by 2-row grid, where every panel shows the character
**head to toe** in motion.

## When this is the right skill

Pick this skill when the request involves movement or the whole body:
dancing, jumping, running, karate, yoga, "action shot", "full body",
"head to toe", "show my outfit".

Choose a different skill instead when the user asks for:

- one single portrait → `doodle-avatar`
- close-up faces and expressions → `doodle-collage`

## What to draw

Six panels, same illustrated character in all of them, each performing a
different dynamic action. The critical constraint: every panel shows the
**complete figure from head to feet** — never cropped to the face or torso.
That is the only thing separating this skill from `doodle-collage`.

Because the whole body is visible, the outfit matters as much as the face.
Carry the clothing, colors, and silhouette across from the photo, and keep
them identical in all six panels.

Motion-line doodle overlays trace the movement across the page. See
`references/pose-library.md` for action ideas,
`../doodle-collage/references/grid-layout.md` for the grid spec, and
`../doodle-avatar/references/style-guide.md` for the house style.

## How to run it

1. Confirm a photo is attached. If none is, ask for one.
2. If the photo is a tight headshot, say so honestly — the full body will
   have to be invented below the crop — and offer `doodle-collage` as the
   better fit before proceeding.
3. Call `generateDoodle` with `skill: "full-body"` and the uploaded photo
   as `imageUrl`.
4. If the message contains a line like `Reference image: <url>`, pass it as
   `refImageUrl`.
5. Report the result briefly without repeating the URL.

## Following up

Offer a refinement such as different actions, a specific sport or dance
style, or a switch to close-up panels with `doodle-collage`.
