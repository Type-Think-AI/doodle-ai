---
name: doodle-spark
description: 'Use when the user wants their doodle to POWER UP — "anime power-up", "make my doodle charge up energy", "add speed lines and an impact frame", "give it a glowing aura". The picture they point at becomes frame one, then erupts into a shonen-style action beat: energy aura, speed lines, a held impact frame. Anime STYLE, not any named character. Not for a brand-new scene starring the character: that is doodle-starcast.'
license: MIT
user-invocable: true
metadata:
  id: spark
  kind: video
  displayName: Doodle Power-Up
  tagline: Your doodle charges up, anime action style
  desc: 'Animates one exact doodle into a 5-15 second shonen-anime-style power-up with sound — the drawing you are looking at flares with an energy aura, speed lines and a held impact frame.'
  longDesc: 'Takes a single finished doodle and gives it an anime action beat without redrawing it: the same marker line and flat colours, now clenching a fist and powering up. Expect hand-drawn shonen cues — a glowing aura, radial speed lines, one high-contrast impact frame at the peak, then a springy settle — with a near-still camera. This is an anime STYLE, not any named character or series. Costs one credit per second of clip, renders in the background, and arrives in the chat about a minute after you ask.'
  category: freeform
  tags: [video, animation, anime]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  # A real frame of what this skill renders: a doodle character at the peak of a
  # shonen-action-style power-up (energy aura, speed lines, a held impact frame),
  # produced by scripts/generate-video-skill-covers.ts through the app's own
  # prompt path. A still stands in for a clip because video cannot run until
  # PICX_WEBHOOK_SECRET is provisioned; the tile carries a "Clip" badge so the
  # static cover never implies a static output. Verified HTTP 200 image/png.
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_2b04dc9a-f48e-490b-9caa-4a9bb5552dcd.png"
  order: 42
---

# Doodle Power-Up

Animate ONE image the user already has into a shonen-anime-style action beat.
That image is the clip's first frame, so the output is that exact drawing
powering up — not a new interpretation of it.

This skill is an anime **style**, never an anime **character**. You animate the
user's own doodle with shonen action cues (energy aura, speed lines, an impact
frame). Do not turn it into, or reference, any named character, series or studio.

## When this is the right skill

Pick this when the user points at their doodle and wants energy and action:

- "make my doodle power up" / "anime power-up" / "make it charge up"
- "add speed lines and an impact frame"
- "give it a glowing energy aura"

Choose `doodle-starcast` instead when the user wants a NEW shot starring the
character — a transformation sequence, a scene they are not already in. The test
is the same as motion vs reel: if the request describes something not already in
the picture, it is a starcast, not a spark.

If there is no image yet, make one first with the right image skill, show it,
and only then offer to power it up.

## What to animate

The frame is fixed, so what you are choosing is the ACTION:

- one clear power-up beat — a fist clench into an energy flare, a determined
  set of the jaw, a burst of aura
- hand-drawn shonen cues: radial speed lines, one held impact frame at the peak,
  hair and clothing lifting in the updraft
- a background that stays a calm flat wash so the drawn effects read

Keep it to one beat. A doodle trying to power up three times in five seconds
reads as a glitch, not as impact.

## How to run it

1. Confirm you have the image URL to animate — usually the doodle generated a
   moment ago in this conversation, otherwise the user's attached photo. If you
   have neither, ask; do not call the tool.
2. Call `generateVideo` with `skill: "spark"`, that URL as `imageUrl`, and a
   short `description` of the action if the user named one.
3. Pass `seconds` whenever the user names a length. If you omit it the clip is
   5 seconds. It costs 1 credit per second, so never quietly pick 15.
4. The tool returns `status: "queued"` and a `jobId`. That means the clip is
   RENDERING, not ready. Say so in one line — roughly a minute, it will appear
   here on its own, it has sound — and then stop.

## What not to do

- Do NOT name or depict a character, series, studio or artist. This is a style
  ("shonen action", "energy aura", "speed lines"), not a cast.
- Do NOT call the tool again for the same request while a clip is rendering, and
  do not call it to "check" on one. The finished clip is delivered on its own.
- Do NOT claim the clip is ready, describe what it looks like, or offer a
  download link. You have not seen it.
- Do NOT promise a resolution, a frame rate or a silent clip. Clips render at
  480p and always carry an audio track.
