---
name: pirate-voyage
description: 'Use when the user wants themselves drawn as an anime sea-adventure captain — "make me an anime pirate", "draw me as a captain of a ship crew", "anime adventure style of me", "put me on a pirate ship", "high seas anime portrait". Requires a photo of the person. Never name a series, studio or character in the prompt: this is the sea-adventure GENRE and its look. For a stealth-action anime look use ninja-village; for a creature companion use monster-tamer; for the house marker-doodle look use doodle-avatar.'
license: MIT
user-invocable: true
metadata:
  id: pirate
  kind: image
  displayName: Pirate Voyage
  tagline: You as the captain of an anime sea crew
  desc: 'Redraws your photo as a bold anime adventure poster — you on the deck of a tall ship, coat open in the wind, bright tropical colours and streaking sky lines behind you.'
  longDesc: 'Turns your photo into one anime sea-adventure illustration in the style people know from big shonen adventure shows, built from the craft and not from any character: crisp ink outlines, flat cel colour in two or three shadow blocks, stretchy exaggerated limbs mid-pose, and a bright tropical palette of sea blues, sun-warm sand and sail cream. You keep your hair, face shape and skin tone; you get an invented captain outfit, a ship deck with rigging and barrels, an island on the horizon, and motion lines streaking across the sky behind you while you stay sharp. One square image, one credit.'
  category: avatars
  tags: [anime, pirate, adventure, hero]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 1
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_d2d83e77-3e77-404f-8ed2-85cc90b11ca6.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_8a177779-1d39-4592-9f06-073f7c3d6e27.png"
  order: 23
---

# Pirate Voyage

Redraw the person in an uploaded photo as the captain of an anime sea crew.

## When this is the right skill

Pick this when someone wants **themselves as an anime sea-adventure hero** — a
ship deck, an open coat, tropical colour, big heroic energy.

Choose a different skill instead when the user asks for:

- a stealth/rooftop action look → `ninja-village`
- themselves with a creature sidekick → `monster-tamer`
- the house marker-and-ink doodle look → `doodle-avatar`
- a moving version → `doodle-dash` (an anime action animation)
- several styles at once → `style-roll`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
in the prompt, in what you say to the user, anywhere. Two reasons, both real:
upstream image models refuse many named-character prompts, so the skill would
fail at random and look like our bug; and asking for a specific character's
likeness produces a derivative of a protected character, which is the actual
legal exposure. "Anime sea-adventure captain" gets the recognition without it.

If the user names a show, that is fine — they can say what they like. Do not
repeat the name into the generation. Answer with the genre wording instead.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved.
- Anime facial grammar: large expressive eyes with a bright highlight, small
  simplified nose, confident open smile. Full anime proportions, not chibi.
- Invented captain costume — long open coat, waist sash, loose shirt, cuffed
  boots. No emblem, crest or flag mark on anything.
- Bright tropical palette, ship-deck props, an island on the horizon.
- Motion lines on the **background** with the figure kept sharp — the anime
  convention, not streaks smeared across the character.

## How to run it

1. Confirm a photo of the person is attached. Without one there is no likeness
   to preserve, so ask for one rather than inventing a face.
2. Call `generateDoodle` with `skill: "pirate"`, the photo as `imageUrl`, and
   any costume, colour or setting notes the user gave as `description`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

Returns ONE image and costs 1 credit.

## Following up

Offer one next step — the same person in the stealth-action look
(`ninja-village`), a creature companion (`monster-tamer`), or bringing this
scene to life as a moving doodle (`doodle-dash`).
