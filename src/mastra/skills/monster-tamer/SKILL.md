---
name: monster-tamer
description: 'Use when the user wants themselves drawn in anime style beside a cute creature companion — "draw me with a monster sidekick", "anime creature trainer style of me", "me and my own little monster", "give me a cute creature buddy". Requires a photo of the person. The creature is always newly invented — never name or reproduce a creature from any published series, film or game. For a sea-adventure look use pirate-voyage; for stealth action use ninja-village; for a real pet from a photo use pet-portrait.'
license: MIT
user-invocable: true
metadata:
  id: tamer
  kind: image
  displayName: Monster Tamer
  tagline: You and your own invented creature buddy
  desc: 'Redraws your photo as a bright anime adventure scene — you as a creature tamer outdoors, with one small original companion invented just for you standing at your side.'
  longDesc: 'Turns your photo into one cheerful anime two-shot: you as a young creature tamer on a sunny grass path, beside a small companion designed from scratch for this image. The creature follows real mascot craft — one clean readable silhouette that still works tiny, soft rounded shapes so it reads friendly, exactly one signature feature (a leaf tail, an ember crest, stubby cloud wings) and its own three-colour palette picked to sit next to your hair colour. You keep your hair, face shape and skin tone, plus an invented adventuring outfit. Tell it an element — leaf, flame, water, stone, spark, cloud — and the companion is built around it. One square image, one credit.'
  category: freeform
  tags: [anime, creature, companion, adventure]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 3
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_ddb8b27c-3ec7-40b1-94b6-00671812fb69.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_8a177779-1d39-4592-9f06-073f7c3d6e27.png"
  order: 25
---

# Monster Tamer

Redraw the person in an uploaded photo as an anime creature tamer, beside one
small original companion.

## When this is the right skill

Pick this when someone wants **themselves plus a cute invented creature** in the
bright anime creature-collector look.

Choose a different skill instead when the user asks for:

- their real pet drawn from a photo → `pet-portrait`
- a sea-adventure hero look → `pirate-voyage`
- a stealth-action look → `ninja-village`
- the house marker-and-ink doodle look → `doodle-avatar`
- a moving version → `doodle-spark` or `doodle-dash`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
and never a creature that already exists. Two reasons, both real: upstream image
models refuse many named-character prompts, so the skill would fail at random and
read as our bug; and reproducing a known creature is a derivative of a protected
character, which is the actual legal exposure.

The invented creature is also the better product. A companion designed around the
user's own colours and chosen element is more personal than a copy of one
everybody already has. If the user names a creature from a show, ask which
element they want instead and design a fresh one.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved. Full anime proportions, not chibi.
- An invented adventuring outfit — light hooded jacket, sturdy boots, small
  satchel. No emblem or symbol on it.
- **One** original creature, knee-height or shoulder-sized, following mascot
  craft: a single readable silhouette that survives at coin size, rounded shape
  language so it reads friendly, exactly one signature feature, and a limited
  three-colour palette chosen not to clash with the person's hair.
- The two of them clearly interacting — a hand reaching out, or the creature
  leaning against their leg — on a sunny outdoor path.
- Nothing that reads as capture or restraint: no cages, collars, leashes or
  chains. The companion is a friend.

## How to run it

1. Confirm a photo of the person is attached. Without one there is no likeness
   to preserve, so ask for one rather than inventing a face.
2. Ask for or infer an **element** — leaf, flame, water, stone, spark or cloud —
   and pass it as `description`. Without one the skill picks its own, which is
   fine but less personal.
3. Call `generateDoodle` with `skill: "tamer"`, the photo as `imageUrl`, and the
   element plus any colour or setting notes as `description`.
4. Pass `refImageUrl` when the message includes a separate style reference.
5. Report the result briefly; the app renders the image itself.

Returns ONE image and costs 1 credit.

## Following up

Offer one next step — a different element for a second companion, the same
person as a sea-adventure captain (`pirate-voyage`) or a stealth warrior
(`ninja-village`), or bringing the pair to life as a moving doodle
(`doodle-spark`).
