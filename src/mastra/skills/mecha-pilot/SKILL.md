---
name: mecha-pilot
description: 'Use when the user wants themselves drawn as an anime pilot beside their own giant robot — "make me an anime mecha pilot", "draw me with a giant robot", "me piloting a mech", "anime robot cockpit portrait of me". Requires a photo of the person. The robot is always newly invented — never name or reproduce a mecha, robot or character from any published series, film or game. This is the giant-robot GENRE and its look. For a sea-adventure look use pirate-voyage; for stealth action use ninja-village; for a creature companion use monster-tamer. Roadmap preview: shown in the catalog, not yet runnable.'
license: MIT
user-invocable: true
metadata:
  id: mecha
  kind: image
  displayName: Mecha Pilot
  tagline: You and your own invented giant robot
  desc: 'Redraws your photo as a bold anime mecha key visual — you as the pilot, with one original giant robot towering beside you, metallic plating catching a cool rim light and a glowing display lighting the cockpit.'
  longDesc: 'Turns your photo into one anime giant-robot illustration, built from the craft and not from any character: crisp panel-line detail across a hard-surface machine, a gunmetal body with one or two saturated accent plates, a cool metallic rim light along every joint, and a glowing display overlay with an anamorphic lens flare that reads the scene as a cockpit. The robot is designed from scratch for you — a stable, blocky, colossal silhouette with no emblem, insignia or badge on it. You keep your hair, face shape and skin tone, plus an invented pilot suit; the robot looms in a towering low-angle hero shot behind you. One square image.'
  category: avatars
  tags: [anime, mecha, robot, pilot, hero]
  runnable: false
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  order: 26
---

# Mecha Pilot

Redraw the person in an uploaded photo as an anime mecha pilot, beside one
original giant robot.

> **Roadmap preview.** This package is shown in the catalog but is not yet
> attached to the agent (`runnable: false`). It has no generation mode or prompt
> branch wired, so the agent should not try to run it; it documents the intended
> skill so covers and wiring can follow.

## When this is the right skill

Pick this when someone wants **themselves as an anime pilot with their own giant
robot** — hard-surface machinery, a cockpit glow, big colossal-scale energy.

Choose a different skill instead when the user asks for:

- a sea-adventure hero look → `pirate-voyage`
- a stealth/rooftop action look → `ninja-village`
- themselves with a creature sidekick → `monster-tamer`
- the house marker-and-ink doodle look → `doodle-avatar`
- several styles at once → `style-roll`

## The naming rule (not optional)

Name the **genre and the look**, never a series, studio, artist or character —
and never a robot that already exists — in the prompt, in what you say to the
user, anywhere. Two reasons, both real: upstream image models refuse many
named-character prompts, so the skill would fail at random and read as our bug;
and reproducing a known mecha is a derivative of a protected design, which is the
actual legal exposure. "Anime giant-robot pilot" gets the recognition without it.

The invented robot is also the better product — a machine designed around the
user's own colours reads as theirs, not a copy of one everybody already has. If
the user names a mecha from a show, that is fine; do not carry the name into the
generation. Answer with the genre wording instead.

## What to draw

- The same person: hairstyle, hair colour, face shape, skin tone, freckles,
  glasses, facial hair all preserved. Full anime proportions, not chibi.
- Anime facial grammar: large focused eyes with a sharp highlight, small
  simplified nose, a set confident mouth.
- An invented pilot suit — fitted flight gear, a collar and thin light-line
  seams. No emblem, insignia or badge on it.
- **One** original giant robot with hard-surface craft: crisp panel-line detail
  across the plating, clean mechanical edges and visible joints, a gunmetal body
  with one or two saturated accent plates, and a cool metallic rim light tracing
  the edges and joints. A stable, blocky, colossal silhouette. No mark on it.
- A cockpit read: a glowing display overlay and one anamorphic lens flare.
- A towering low-angle hero shot so the machine feels colossal; a restrained
  industrial palette with the accent plating and the display glow as the only
  bright notes.

## How to run it

While this package is a roadmap preview it is **not runnable** — there is no
`mecha` generation mode or prompt branch, so do not call `generateDoodle` with
it. When it graduates to runnable it will follow the same shape as the other
anime stills: confirm a photo is attached, then call `generateDoodle` with the
photo as `imageUrl` and any suit, robot-colour or setting notes as `description`,
returning ONE image.

## Following up

Offer one next step — the same person as a sea-adventure captain
(`pirate-voyage`), a stealth warrior (`ninja-village`), or a creature companion
(`monster-tamer`).
