---
name: family-portrait
description: 'Use when the user wants a doodle of their whole family — "draw my family", "family portrait cartoon", "family as cartoon characters", "me and my kids", "us as a doodle", "family caricature", "cartoon of my family". Requires a photo with all family members visible. For only two people use couple-doodle instead; for a single person use doodle-avatar.'
license: MIT
user-invocable: true
metadata:
  id: family
  displayName: Family Portrait
  tagline: Turn a family photo into one illustrated group portrait
  desc: 'Transforms a group photo of 2–6 people (including children and pets) into a warm hand-drawn doodle portrait preserving every member''s distinct likeness.'
  longDesc: 'Takes a family photo and redraws the entire group as a single illustrated doodle portrait in naive marker-and-ink style. Preserves each person''s individual likeness — hair, face shape, height, age, skin tone, glasses, outfit colours — and maintains their exact arrangement and physical contact from the photo. Children stay short, grandparents stay older, pets keep their breed and fur colour. Warm natural family grouping on a warm-white ground.'
  category: avatars
  tags: [family, portrait, group]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_5863b66f-130f-40b8-b15f-b2f2ff7e9be1.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6da5f95c-0ddb-48fe-b91b-e3ce4f1b7136.png"
  order: 19
---

# Family Portrait

Turn one uploaded family photo into an illustrated group doodle portrait.

## When this is the right skill

Pick this skill when the user wants a doodle of **their whole family** —
parents, children, grandparents, siblings, pets — in a single warm portrait.
The photo must contain all the people they want drawn.

Choose a different skill instead when the user asks for:

- exactly two people (couple, best friends) → `couple-doodle`
- a single person's avatar → `doodle-avatar`
- a pet without people → `pet-portrait`
- separate panels per person → `doodle-collage`
- a greeting card with a message → `gift`

## What to draw

Redraw every person (and pet) from the source photo as illustrated doodle
characters in the house style: bold clean outlines, simplified features,
flat cheerful colours, playful proportions on a warm-white ground.

**Multi-person likeness is the hard requirement.** Every person must appear,
in the same left-to-right order, preserving:

- relative heights and apparent ages (children stay small, elders stay older)
- each person's own hair colour/style, face shape, skin tone
- glasses, facial hair, hats, accessories per individual
- outfit colours and general clothing shape
- physical arrangement and contact (who holds whom, arm placement)
- pets in their correct position with correct breed and fur colour

## How to run it

1. Confirm a photo is attached **and that the family group is clearly
   visible** (2–6 people). If only one person is in the photo, suggest
   `doodle-avatar`; if exactly two suggest `couple-doodle`.
2. Call `generateDoodle` with `skill: "family"`, the uploaded photo as
   `imageUrl`, and any occasion/clothing context the user provided as
   `description`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

The skill returns ONE image and costs 1 credit.

## Following up

After a successful generation, offer one next step — a different theme,
adding occasion embellishments (holiday, birthday), or converting to a
greeting card via the gift skill.
