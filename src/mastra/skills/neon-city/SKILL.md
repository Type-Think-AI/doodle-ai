---
name: neon-city
description: 'Use when the user wants themselves drawn in a cyberpunk neon-city anime look — "make me an anime cyberpunk character", "draw me in a neon city at night", "neon-city anime portrait of me", "put me on a rain-slicked neon street". Requires a photo of the person. Never name a series, studio or character in the prompt: this is the neon-city cyberpunk GENRE and its look. For a sea-adventure look use pirate-voyage; for stealth action use ninja-village; for a giant robot use mecha-pilot. Roadmap preview: shown in the catalog, not yet runnable.'
license: MIT
user-invocable: true
metadata:
  id: neon
  kind: image
  displayName: Neon City
  tagline: You on a rain-lit neon street after dark
  desc: 'Redraws your photo as a cyberpunk anime night scene — you on a rain-slicked street lit only by towering neon signage, cyan and magenta reflections shining up off the wet ground.'
  longDesc: 'Turns your photo into one cyberpunk neon-city anime illustration, built from the craft and not from any character: an inky near-black base of charcoal and midnight blue cut by high-saturation cyan, magenta and electric-pink neon, lit from the signage rather than the sky so light rakes across you from the side and below. Rain-slicked streets throw long mirror reflections, holographic ads and stacked glowing signs tower over cramped alleys, and a light haze of smog and steam catches the glow. You keep your hair, face shape and skin tone; you get invented near-future streetwear with thin light-line accents, and a slight glow bleed where neon meets an edge. No brand names or real logos on any sign. One square image.'
  category: avatars
  tags: [anime, cyberpunk, neon, city, night]
  runnable: false
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  order: 27
---

# Neon City

Redraw the person in an uploaded photo as a cyberpunk anime figure on a
neon-lit night street.

> **Roadmap preview.** This package is shown in the catalog but is not yet
> attached to the agent (`runnable: false`). It has no generation mode or prompt
> branch wired, so the agent should not try to run it; it documents the intended
> skill so covers and wiring can follow.

## When this is the right skill

Pick this when someone wants **themselves in a rain-slicked neon night city** —
glowing signage, wet reflections, near-future streetwear, after-dark mood.

Choose a different skill instead when the user asks for:

- a sea-adventure hero look → `pirate-voyage`
- a stealth/rooftop action look → `ninja-village`
- themselves with a giant robot → `mecha-pilot`
- the house marker-and-ink doodle look → `doodle-avatar`
- several styles at once → `style-roll`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
in the prompt, in what you say to the user, anywhere. Upstream image models
refuse many named-character prompts, so the skill would fail at random and read
as our bug; and a specific character's likeness is a derivative of a protected
character, which is the actual legal exposure. "Cyberpunk neon-city anime" gets
the recognition without it.

If the user names a show, that is fine. Do not carry the name into the
generation — answer with the genre wording instead. Keep every sign generic:
glowing invented glyphs and shapes, never a real brand name or logo.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved. Full anime proportions, not chibi.
- Anime facial grammar: large expressive eyes with a bright neon catchlight,
  small simplified nose, a cool composed mouth.
- Invented near-future streetwear — a technical jacket, layered collar, thin
  glowing light-line seams. No brand marks.
- An inky near-black base of charcoal and midnight blue, cut by saturated cyan,
  magenta and electric-pink neon, with the light coming from the signage so the
  figure is lit from the side and below.
- Rain-slicked ground throwing long mirror reflections of the neon, towering
  holographic ads and stacked glowing signs, a light haze of smog and steam.
- A slight glow bleed where neon meets an edge; a perpetual-twilight street
  level under a wall of signage.

## How to run it

While this package is a roadmap preview it is **not runnable** — there is no
`neon` generation mode or prompt branch, so do not call `generateDoodle` with
it. When it graduates to runnable it will follow the same shape as the other
anime stills: confirm a photo is attached, then call `generateDoodle` with the
photo as `imageUrl` and any outfit, neon-colour or setting notes as
`description`, returning ONE image.

## Following up

Offer one next step — the same person as a stealth warrior (`ninja-village`), a
giant-robot pilot (`mecha-pilot`), or a sea-adventure captain (`pirate-voyage`).
