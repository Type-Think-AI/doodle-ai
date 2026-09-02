---
name: doodle-intro
description: 'Use when the user wants a title-sequence style reel starring their doodle character — "make it feel like an anime opening", "a montage of my character with a cool ending pose", "quick cuts that end on a key-visual pose", "an intro reel". The reference doodles fix the likeness, and the shot is a new, tightly edited montage that lands on a hero key visual. Anime opening STYLE, not any named character or show. Not for one gentle loop: that is doodle-daydream. Not for a single action shot: that is doodle-dash.'
license: MIT
user-invocable: true
metadata:
  id: intro
  kind: video
  displayName: Doodle Intro
  tagline: A title-sequence style reel that lands on a hero pose
  desc: 'Films a NEW title-sequence style montage starring your doodle character — same face and colours, a few kinetic expression-and-pose cuts timed to the beat, settling on a bold key-visual pose.'
  longDesc: 'Reference-driven and built like an anime opening: you supply doodles that say who the character is, and it films a short, tightly edited montage of them — a couple of quick expression and pose cuts with kinetic timing, symbolic little touches, then a settle onto one bold key-visual hero pose. Expect a colour-script mood (golden-hour rim light, a twilight gradient), cel-shaded flat colour with hard-edged shadows, and an upbeat sparse sound bed with the final pose landing on the beat. Costs one credit per second, comes to life in the background, and lands in the chat in a few seconds.'
  category: freeform
  tags: [video, intro, anime]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 2
  # Cover: frame one of this skill's own finished clip
  # (intro-titles), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/intro-first-frame_fb9333ef-669f-4c73-9821-7fed1bd84932.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/edited/image_12e6d35b-56e0-458c-9300-cefae33bcf46.png"
  order: 46
---

# Doodle Intro

Film a NEW title-sequence style reel starring a character the user already has
doodles of. The references define who the character IS — hair, face, colours,
outfit — not the composition of the shot.

This skill is an anime opening **style**, never an anime **character** or a real
show's opening. You film the user's own doodle character with the craft of a
title sequence — kinetic cuts, a colour-script mood, a key-visual ending pose.
Do not turn it into, or reference, any named character, series, studio or actual
opening.

## When this is the right skill

Pick this when the user wants that "opening titles" feel:

- "make it feel like an anime opening / intro"
- "a montage of my character that ends on a cool pose"
- "quick cuts that settle on a key-visual pose"

Choose `doodle-daydream` when they want one calm loop of the exact drawing,
`doodle-dash` when they want a single high-energy action shot, and
`doodle-reel` when they want a plain new scene with no title-sequence styling.

## What to film

- A short montage feel: two or three quick beats — an expression, a small
  gesture, a turn — with kinetic timing, then a clear settle. Keep it legible;
  this is a montage feel, not a slideshow of unrelated shots.
- A colour-script mood that carries the whole reel — a golden-hour rim light, a
  twilight gradient behind the character, a single accent colour — layered as
  flat cel tints, never as realistic lighting.
- A strong final key-visual pose: the character squares up to the viewer and
  holds, lit like the poster frame, landing on the beat of the sound.
- Cel-shaded flat colour with hard-edged shadow shapes throughout, so every cut
  reads as hand-drawn.
- Staging that survives a phone screen: full body or waist up, generous empty
  space, simple flat backgrounds so the character stays the subject.

## How to run it

1. Gather the reference URLs. Best case is several doodles of the same character
   from this conversation; one is enough. Put the clearest full view first —
   references are cited in order.
2. Call `generateVideo` with `skill: "intro"`, those URLs as `referenceUrls`, and
   the user's mood or ending pose in `description`. If they named a length, pass
   `seconds` — otherwise it lasts 5 seconds at 1 credit per second.
3. If the user has no doodle of the character yet, make one first with an image
   skill, show it, then offer the intro reel.
4. The tool returns `status: "queued"` with a `jobId`: it is coming to life. Say
   it will land here on its own in a few seconds and that it has sound, then
   stop.

## What not to do

- Do NOT name or depict a character, series, studio, artist or a real anime
  opening. This is a style ("title sequence", "key visual", "colour script"),
  not a cast.
- Do NOT try to cram a whole story in — two or three legible beats and a strong
  ending pose beat a blur of cuts.
- Do NOT send more than ten references — the extras are dropped, and the first
  ones shape the character anyway.
- Do NOT re-call the tool for the same request, or call it to check progress.
  The finished result is delivered on its own.
- Do NOT describe or evaluate the result. You have not seen it.
- Do NOT film a real, named person. This skill is for the user's own doodle
  characters.
