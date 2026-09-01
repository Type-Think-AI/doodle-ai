---
name: doodle-dash
description: 'Use when the user wants a NEW high-energy action shot starring their doodle character — "make an action scene of him running", "a dynamic anime dash with speed lines", "have her leap into a big pose", "a fast sakuga-style moment". The reference doodles fix the likeness, and the shot itself is new and kinetic. Anime action STYLE, not any named character. Not for gently animating one exact picture: that is doodle-daydream or doodle-motion.'
license: MIT
user-invocable: true
metadata:
  id: dash
  kind: video
  displayName: Doodle Dash
  tagline: A fast, high-energy anime action shot
  desc: 'Films a NEW dynamic action shot starring your doodle character — same face and colours, now dashing through a burst of speed lines and smear frames into a punchy held impact frame.'
  longDesc: 'Reference-driven action: you supply doodles that say who the character is, and it films a brand-new high-energy shot of them in motion — a run, a leap, a quick spin into a strong pose. Expect the real hand-drawn action toolkit: bold radial speed lines, stretched smear frames through the fastest moves, a single high-contrast impact frame held for a beat at the peak, then a springy settle, all as flat cel-shaded line-and-fill. One committed camera move, a punchy sparse sound bed. Costs one credit per second, comes to life in the background, and lands in the chat in a few seconds.'
  category: freeform
  tags: [video, action, anime]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 1
  # Cover: the frame at t=3.5s of this skill's own finished clip (dash-run),
  # decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. NOT frame one, deliberately: this clip opens on an empty page
  # and the runner only enters around 0.5s, so frame one is a blank tile. 3.5s is
  # the apex of the leap, legs extended inside a full radial speed-line burst.
  # The chosen time lives in FRAME_TIME_OVERRIDES in that script; clip, frame time
  # and dimensions are in src/data/skill-video-covers.json, so this is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/dash-first-frame_3516d6a5-a58b-4352-9b72-9014ebbd9cb3.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_889bf322-8840-44d1-82ea-fac82be13d77.png"
  order: 45
---

# Doodle Dash

Film a NEW high-energy action shot starring a character the user already has
doodles of. The references define who the character IS — hair, face, colours,
outfit — not the composition of the shot.

This skill is an anime action **style**, never an anime **character**. You film
the user's own doodle character with the real action toolkit — speed lines,
smear frames, a held impact frame — none of which belongs to anyone. Do not
turn it into, or reference, any named character, series or studio.

## When this is the right skill

Pick this when the request describes fast movement that is not already in the
picture:

- "make an action scene of him running" / "a dynamic dash"
- "have her leap into a big pose with speed lines"
- "a fast, punchy anime moment of my character"

Choose `doodle-daydream` or `doodle-motion` when the user wants THAT exact
drawing to move gently in place, `doodle-spark` when they want it to power up on
the spot, and `doodle-intro` when they want a title-sequence style reel. Getting
image vs reference backwards produces a technically fine clip of the wrong
thing — the most common mistake with this model.

## What to film

- One clear action beat — a running dash across frame, a leap, a quick spin
  that lands in a strong pose. One beat, committed to fully.
- The hand-drawn action toolkit: bold radial speed lines streaking the motion,
  stretched smear frames through the fastest part of the move, one held
  high-contrast impact frame at the peak (a brief flash with a starburst
  behind), then a springy settle — like keyframes inked on paper.
- Cel-shaded flat colour with hard-edged shadow shapes and a thin rim light, so
  the figure reads clearly against the speed.
- One committed camera move — a fast follow or a quick push into the impact
  beat. One move, not two, and never a whip-pan-plus-orbit.
- Staging that survives a phone screen: full body or waist up, generous empty
  space, one simple flat background so the speed lines read.

## How to run it

1. Gather the reference URLs. Best case is several doodles of the same character
   from this conversation; one is enough. Put the clearest full view first —
   references are cited in order.
2. Call `generateVideo` with `skill: "dash"`, those URLs as `referenceUrls`, and
   the user's action in `description`. If they named a length, pass `seconds` —
   otherwise it lasts 5 seconds at 1 credit per second.
3. If the user has no doodle of the character yet, make one first with an image
   skill, show it, then offer the action shot.
4. The tool returns `status: "queued"` with a `jobId`: it is coming to life. Say
   it will land here on its own in a few seconds and that it has sound, then
   stop.

## What not to do

- Do NOT name or depict a character, series, studio or artist. This is a style
  ("action beat", "speed lines", "smear frames", "impact frame"), not a cast.
- Do NOT stack three actions into one shot — one committed beat reads as impact;
  three read as a glitch.
- Do NOT send more than ten references — the extras are dropped, and the first
  ones shape the character anyway.
- Do NOT re-call the tool for the same request, or call it to check progress.
  The finished result is delivered on its own.
- Do NOT describe or evaluate the result. You have not seen it.
- Do NOT film a real, named person. This skill is for the user's own doodle
  characters.
