---
name: doodle-daydream
description: 'Use when the user wants their doodle to have a soft, quiet everyday moment — "make it gently come to life", "a calm breathing loop", "just a little movement, nothing wild", "have it daydream by the window". The picture they point at becomes the first frame, then breathes: a near-still hold with one moving light layer drifting across it. Anime slice-of-life STYLE, not any named character. Not for an action beat: that is doodle-dash. Not for a brand-new scene: that is doodle-intro.'
license: MIT
user-invocable: true
metadata:
  id: daydream
  kind: video
  displayName: Doodle Daydream
  tagline: A soft, breathing everyday moment
  desc: 'Brings one exact doodle to life as a calm slice-of-life moment — the drawing you are looking at holds almost still while a gentle light shifts across it, hair drifts, and it takes one soft breath.'
  longDesc: 'Takes a single finished doodle and gives it the quiet, lingering feel of an everyday slice-of-life moment, without redrawing it. The frame stays nearly still on a two-to-three-frame hold — the trick real animators use for calm scenes — while one moving layer of light drifts across it: a warm glow sliding over the face, a soft rim light picking out the edges, a slow blink, hair and clothing breathing in a barely-there breeze. Cel-shaded flat colours, hard-edged shadow shapes, a hushed room tone. Costs one credit per second, comes to life in the background, and lands in the chat in a few seconds.'
  category: freeform
  tags: [video, animation, anime]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  # Cover: frame one of this skill's own finished clip
  # (daydream-quiet), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/daydream-first-frame_b1d9ee2a-c9c5-4ed8-9437-581a23a8d6cd.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 44
---

# Doodle Daydream

Bring ONE image the user already has to life as a calm, everyday slice-of-life
moment. That image is the first frame, so the result is that exact drawing
breathing — not a new interpretation of it.

This skill is an anime slice-of-life **style**, never an anime **character**.
You animate the user's own doodle with the quiet craft of a lingering shot — a
near-still hold, one moving layer of light, cel-shaded flat colour. Do not turn
it into, or reference, any named character, series or studio.

## When this is the right skill

Pick this when the user wants a little life, not action:

- "make it gently come to life" / "a calm breathing loop"
- "just a bit of movement, nothing dramatic"
- "have my doodle daydream / sit by the window / relax"

Choose `doodle-dash` when they want energy and a NEW action shot, and
`doodle-intro` when they want a title-sequence style reel. The test is the same
as motion vs reel: if the request describes something not already in the
picture, this is the wrong skill.

If there is no image yet, make one first with the right image skill, show it,
and only then offer to bring it to life.

## What to animate

The frame is fixed, so what you are choosing is the QUIET:

- one small primary action — a slow blink, a soft breath, the hint of a smile
- one moving light layer — a warm glow drifting across the face, a soft rim
  light tracing the edges, a slow shift from cool to golden
- barely-there secondary drift in hair, a scarf, an earring
- everything else held nearly still on a two-to-three-frame hold, the way a
  calm anime shot lingers

Keep it hushed. The whole point is stillness with one thing moving. A doodle
doing three things at once breaks the calm.

## How to run it

1. Confirm you have the image URL to bring to life — usually the doodle
   generated a moment ago in this conversation, otherwise the user's attached
   photo. If you have neither, ask; do not call the tool.
2. Call `generateVideo` with `skill: "daydream"`, that URL as `imageUrl`, and a
   short `description` of the mood if the user named one.
3. Pass `seconds` whenever the user names a length. If you omit it, it lasts
   5 seconds. It costs 1 credit per second, so never quietly pick 15.
4. The tool returns `status: "queued"` and a `jobId`. That means it is coming to
   life, not ready. Say so in one line — a few seconds, it will appear here on
   its own, it has sound — and then stop.

## What not to do

- Do NOT name or depict a character, series, studio or artist. This is a style
  ("slice-of-life", "lingering shot", "rim light"), not a cast.
- Do NOT ask for or add loud action, a camera move or a scene change — that is
  what `doodle-dash` and `doodle-intro` are for.
- Do NOT call the tool again for the same request while it is coming to life,
  and do not call it to "check" on one. The finished result is delivered on its
  own.
- Do NOT claim it is ready, describe what it looks like, or offer a download
  link. You have not seen it.
- Do NOT promise a resolution, a frame rate or a silent result. It always
  carries an audio track.
