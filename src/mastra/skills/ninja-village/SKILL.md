---
name: ninja-village
description: 'Use when the user wants themselves drawn as an anime stealth warrior — "make me an anime ninja", "draw me on a rooftop about to use a power", "stealth warrior style of me", "anime action portrait with a glow effect". Requires a photo of the person. Never name a series, studio or character in the prompt: this is the shadow-warrior GENRE and its look. For a sea-adventure look use pirate-voyage; for a creature companion use monster-tamer; for the house marker-doodle look use doodle-avatar.'
license: MIT
user-invocable: true
metadata:
  id: ninja
  kind: image
  displayName: Ninja Village
  tagline: You as a rooftop stealth warrior, powering up
  desc: 'Redraws your photo as an anime action illustration — you on village rooftops at dusk, hands pressed together, a glow gathering around them right before the technique lands.'
  longDesc: 'Turns your photo into one anime action illustration in the shadow-warrior genre, built from the craft rather than any character: fine ink outlines with dense crosshatch shadow, a muted sandy earth-tone palette, and exactly one saturated glowing accent so the power effect is the only bright thing in the frame. You keep your hair, face shape and skin tone; you get invented stealth gear — wrapped forearms, high collar, plain cloth headband, wind-caught scarf, no symbols on any of it — tiled rooftops and pine silhouettes behind you, drifting smoke, and speed lines streaking the background while you stay sharp. One square image, one credit.'
  category: avatars
  tags: [anime, ninja, action, hero]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_d8f494ec-4681-49a0-9675-1bdfc93a2d29.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_8a177779-1d39-4592-9f06-073f7c3d6e27.png"
  order: 24
---

# Ninja Village

Redraw the person in an uploaded photo as a rooftop stealth warrior mid
power-up.

## When this is the right skill

Pick this when someone wants **themselves as an anime action hero in the
stealth-warrior genre** — rooftops, wrapped gear, a glow gathering in the hands.

Choose a different skill instead when the user asks for:

- a sea-adventure hero look → `pirate-voyage`
- themselves with a creature sidekick → `monster-tamer`
- the house marker-and-ink doodle look → `doodle-avatar`
- a moving version → `doodle-dash` (an anime action animation)
- several styles at once → `style-roll`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
in the prompt, in what you say to the user, anywhere. Upstream image models
refuse many named-character prompts, so the skill would fail at random and read
as our bug; and a specific character's likeness is a derivative of a protected
character, which is the actual legal exposure. "Anime stealth warrior" gets the
recognition without it.

If the user names a show, that is fine. Do not carry the name into the
generation — answer with the genre wording instead.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved.
- Anime facial grammar: large focused eyes with a sharp highlight, small
  simplified nose, a set determined mouth. Athletic full anime proportions,
  not chibi.
- Invented stealth gear — wrapped forearms and shins, high-collar tunic, utility
  belt, plain cloth headband, loose scarf. **No clan symbol, crest or badge on
  any of it.**
- The action beat: both hands pressed together at the chest, rim glow gathering
  around hands and forearms.
- Muted earth tones everywhere, with exactly **one** saturated accent colour
  used only for the glow.
- Speed lines on the **background**, figure kept sharp.

## How to run it

1. Confirm a photo of the person is attached. Without one there is no likeness
   to preserve, so ask for one rather than inventing a face.
2. Call `generateDoodle` with `skill: "ninja"`, the photo as `imageUrl`, and any
   gear, glow-colour or setting notes the user gave as `description`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

Returns ONE image and costs 1 credit.

## Following up

Offer one next step — the same person as a sea-adventure captain
(`pirate-voyage`), a creature companion (`monster-tamer`), or bringing the
power-up to life as a moving doodle (`doodle-dash`).
