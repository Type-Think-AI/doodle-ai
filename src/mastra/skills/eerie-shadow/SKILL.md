---
name: eerie-shadow
description: 'Use when the user wants themselves drawn in a supernatural-horror manga look — "make me a spooky anime character", "draw me in a creepy manga style", "eerie shadow anime portrait of me", "spooky supernatural manga version of me". Requires a photo of the person. Eerie and tense, never gory. Never name a series, studio or character in the prompt: this is the supernatural-horror GENRE and its look. For a stealth-action look use ninja-village; for a neon night city use neon-city; for a giant robot use mecha-pilot. Roadmap preview: shown in the catalog, not yet runnable.'
license: MIT
user-invocable: true
metadata:
  id: eerie
  kind: image
  displayName: Eerie Shadow
  tagline: You in a shadowy supernatural manga portrait
  desc: 'Redraws your photo as a supernatural-horror manga portrait — most of you falling into deep shadow, with one carrying highlight catching an eye, drawn in heavy black ink and screentone.'
  longDesc: 'Turns your photo into one supernatural-horror manga illustration, built from the craft and not from any character: heavy solid black ink masses, high-contrast crosshatching and screentone stipple for the mid-greys, and most of the frame dropping to near-silhouette so a single carrying highlight — a catch of light in one eye, the edge of a tooth, a wet streak — does the work. A near-monochrome palette of deep blacks against paper white with one restrained cold accent at most, and empty white negative space used as tense silence against the dense blacks. You keep your hair, face shape and skin tone; the framing is a low-key ominous close-up half-lost in shadow. Eerie and tense, never gory. One square image.'
  category: avatars
  tags: [anime, horror, manga, shadow, spooky]
  runnable: false
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 4
  order: 28
---

# Eerie Shadow

Redraw the person in an uploaded photo as a supernatural-horror manga portrait,
most of the frame lost in shadow.

> **Roadmap preview.** This package is shown in the catalog but is not yet
> attached to the agent (`runnable: false`). It has no generation mode or prompt
> branch wired, so the agent should not try to run it; it documents the intended
> skill so covers and wiring can follow.

## When this is the right skill

Pick this when someone wants **themselves in a spooky, shadowy supernatural
manga look** — heavy black ink, screentone, one highlight carrying the shot,
tense and eerie rather than gory.

Choose a different skill instead when the user asks for:

- a stealth/rooftop action look → `ninja-village`
- a neon-lit night city → `neon-city`
- themselves with a giant robot → `mecha-pilot`
- the house marker-and-ink doodle look → `doodle-avatar`
- several styles at once → `style-roll`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
in the prompt, in what you say to the user, anywhere. Upstream image models
refuse many named-character prompts, so the skill would fail at random and read
as our bug; and a specific character's likeness is a derivative of a protected
character, which is the actual legal exposure. "Supernatural-horror manga" gets
the recognition without it.

If the user names a show, that is fine. Do not carry the name into the
generation — answer with the genre wording instead.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved. Full anime proportions, not chibi.
- Anime facial grammar: eyes drawn with one sharp carrying catchlight, a small
  simplified nose, a still tense mouth.
- Heavy solid black ink masses, high-contrast crosshatching and screentone
  stipple for the mid-greys, most of the frame in near-silhouette so **one**
  highlight does the work.
- A near-monochrome palette — deep blacks against paper white, at most one
  restrained cold accent — with empty white negative space held as tense silence
  against the dense blacks.
- A low-key ominous close-up half-lost in shadow; line favours form over detail,
  jagged and weighty where it shows.
- Keep it **eerie and tense, never gory** — no blood, wounds or graphic content.

## How to run it

While this package is a roadmap preview it is **not runnable** — there is no
`eerie` generation mode or prompt branch, so do not call `generateDoodle` with
it. When it graduates to runnable it will follow the same shape as the other
anime stills: confirm a photo is attached, then call `generateDoodle` with the
photo as `imageUrl` and any mood or accent-colour notes as `description`,
returning ONE image.

## Following up

Offer one next step — the same person as a stealth warrior (`ninja-village`), on
a neon night street (`neon-city`), or as a giant-robot pilot (`mecha-pilot`).
