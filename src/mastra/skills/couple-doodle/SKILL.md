---
name: couple-doodle
description: 'Use when the user wants a doodle of two people together — "us as cartoons", "me and my girlfriend", "draw me and my partner", "couple portrait", "me and my boyfriend as a cartoon", "my partner and me", "anniversary", "engagement doodle", "our wedding cartoon". Requires a photo with BOTH people visible. For a single-person avatar use doodle-avatar instead; for a greeting card (birthday, thank-you) use gift instead.'
license: MIT
user-invocable: true
metadata:
  id: couple
  displayName: Couple Doodle
  tagline: Turn a photo of two people into one illustrated couple portrait
  desc: 'Transforms a couple photo into a hand-drawn doodle portrait preserving each person''s distinct likeness.'
  longDesc: 'Takes a photo of two people and redraws them as a single illustrated couple portrait in naive marker-and-ink doodle style. Preserves each person''s individual likeness — hair, face shape, height difference, skin tone, glasses — and keeps their physical relationship from the photo (holding hands, arm around shoulder, leaning together). Supports optional occasions like anniversary, engagement, proposal, wedding, or Valentine''s that add matched doodle embellishments.'
  category: avatars
  tags: [couple, portrait, two-people, relationship]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_5ef46520-6769-496f-9f10-35863fac3234.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_1a1bab44-6d4a-4ea9-8a1b-331fbe2c3613.png"
  order: 11
---

# Couple Doodle

Turn one uploaded photo of two people into an illustrated couple portrait.

## When this is the right skill

Pick this skill when the user wants a doodle of **two people together** in
a single portrait — partners, spouses, best friends photographed side by
side. The photo must contain both people.

Choose a different skill instead when the user asks for:

- a single person's avatar → `doodle-avatar`
- a greeting card with a message → `gift`
- multiple panels or expressions → `doodle-collage`
- head-to-toe or action poses → `full-body-collage`
- a sticker sheet → `sticker-pack`
- mood-word captioned panels → `mood-captions`
- artwork with no photo at all → `surprise-me`

## What to draw

Redraw both subjects as illustrated doodle characters in the house style:
bold clean outlines, simplified features, flat cheerful colors, playful
proportions. **Likeness is the hard requirement** — see
`references/two-subject-likeness.md` for the full anchor checklist.

Preserve from the source photo:
- each person's own hair colour, style, and length
- each person's face shape, skin tone, and distinguishing marks
- glasses, facial hair, piercings, and accessories per person
- relative height and body-size difference between the two
- their left/right positions exactly as photographed
- their physical relationship (holding hands, arm around shoulder,
  foreheads together, etc.) — never invent a generic pose

When an occasion is detected from the user's message (anniversary,
engagement, proposal, wedding, Valentine's, just-us), add small
occasion-matched doodle embellishments around the couple — the same pattern
the gift skill uses for its occasions.

## How to run it

1. Confirm a photo is attached **and that two people are clearly visible**.
   If only one person is in the photo, tell the user: "I can see one person
   — for a couple doodle I need a photo with both of you in it. Want to
   upload a different photo, or shall I make a single avatar instead?"
2. Call `generateDoodle` with `skill: "couple"`, the uploaded photo as
   `imageUrl`, and the user's occasion or message as `description` (if any).
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

## Following up

After a successful generation, offer one next step — a greeting-card
version (gift skill), a collage of the couple in different moments, or a
refinement such as a different theme or occasion.
