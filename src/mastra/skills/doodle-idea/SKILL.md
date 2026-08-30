---
name: doodle-idea
description: 'Use when the user wants a doodle of a THING they have in mind — an object, a scene, a motif, a creature, a small still life — drawn in the house doodle style, with no photo. Phrases like "draw a cat riding a bike", "doodle idea", "give me something to draw", "random doodle", or a bare noun. For a random FICTIONAL CHARACTER instead of the thing they typed, use surprise-me. For a doodle of a real person or pet from a photo, use doodle-avatar or pet-portrait.'
license: MIT
user-invocable: true
metadata:
  id: idea
  displayName: Doodle Idea
  tagline: 'Draw the thing you have in mind — no photo needed'
  desc: 'Turns a typed idea — an object, scene, motif, creature, or still life — into a hand-drawn doodle. No photo required.'
  longDesc: 'Give it an idea in words and it draws that idea as a naive marker-and-ink doodle: a cat on a skateboard, a teapot garden, a tiny rocket, a bowl of ramen. With nothing typed it picks one interesting concrete subject to draw. Built for the "give me something to doodle" moment, not for portraits.'
  category: freeform
  tags: [freeform, no photo, ideas, objects, scenes]
  runnable: true
  requiresPhoto: false
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_7a41e957-849c-4acd-a5f1-f546a8a8e3c1.jpg"
  order: 22
---

# Doodle Idea

Draw the idea the user typed — an object, a scene, a motif, a creature, or a
small still life — as a single hand-drawn doodle in the house style. No photo
required.

## When this is the right skill

Pick this skill when the user gives you an *idea for a thing to draw* and wants
it rendered as a doodle:

- a concrete subject in words — "a cat riding a bicycle", "a cactus in a mug",
  "a little haunted house", "a bowl of ramen"
- an open-ended "give me a doodle idea", "random doodle", or "something to draw"
- a bare noun or short phrase with no photo attached

The important distinction — **do not confuse this with `surprise-me`**:

- `surprise-me` invents a **random fictional CHARACTER** (a person: hair, outfit,
  expression) and ignores whatever the user asked for. It is a portrait of a
  made-up stranger.
- This skill draws **the idea the user actually typed** — usually an object,
  scene, or creature, not a person — and stays faithful to it.

So when the user names a *thing*, use this skill. When they explicitly want a
surprise character or a random person, use `surprise-me` instead. For a doodle
of a real person from a photo use `doodle-avatar`; for a real pet use
`pet-portrait`.

## What to draw

If the user described a subject at all, draw **that** subject and follow the
description closely — the object, its setting, the little details they named.
Keep it a single clear composition, not a collage.

If the user typed **nothing**, pick one interesting, drawable, **concrete**
subject yourself — a plant, an animal, a food, a small object, a vehicle, a tiny
scene. Deliberately **do not default to a person or a portrait**: the pages that
use this skill are "doodle ideas", "doodle prompt generator" and "random doodle
generator", where the visitor wants a fun thing to draw, not a picture of a
stranger. Vary the subject run to run so repeat visitors get fresh ideas.

Style notes for this skill specifically:

- naive marker-and-ink doodle, the same house look as the rest of the catalogue
- bold clean outlines, simplified shapes, flat cheerful colour
- warm off-white ground, one cohesive subject centred with breathing room
- playful, hand-sketched charm — not a technical diagram, not clip-art

No photorealism, no 3D, no heavy realistic shading, no lettering.

## How to run it

1. Never ask for a photo — this skill needs none.
2. Call `generateDoodle` with `skill: "idea"`. Pass the user's own words as
   `description` when they gave any; omit it to have the skill pick a subject.
3. Never pass `imageUrl` for this skill — there is no source photo and the tool
   ignores it.
4. Report the result briefly without repeating the URL.

## Following up

Offer a twist on the same idea — a different palette, a new setting, or a
companion object — or suggest another concrete subject to doodle next.
