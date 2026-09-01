---
name: doodle-motion
description: 'Use when the user wants an image they already have to start moving — "animate this", "make it move", "turn this doodle into a video". The picture they point at becomes the first frame of the clip, so the result is recognisably that exact drawing, animated. Not for a new scene starring the character: that is doodle-reel.'
license: MIT
user-invocable: true
metadata:
  id: motion
  kind: video
  displayName: Doodle in Motion
  tagline: Make the doodle you just made start moving
  desc: 'Animates one exact doodle into a 5-15 second clip with sound — the drawing you are looking at becomes frame one, then blinks, smiles and waves.'
  longDesc: 'Takes a single finished doodle and animates it without redrawing it: the same marker line, the same flat colours, the same face. Expect small, springy, hand-drawn motion — a blink, a smile, a wave, hair drifting — with a near-still camera and a soft sound bed. Costs one credit per second of clip, and it renders in the background, so the clip arrives in the chat about a minute after you ask.'
  category: freeform
  tags: [video, animation, motion]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  # A real frame of what this skill renders: the doodle in sourceImageUrl,
  # mid-wave with hand-drawn motion cues, produced by
  # scripts/generate-video-skill-covers.ts through the app's own prompt path.
  # A still stands in for a clip because video cannot run until
  # PICX_WEBHOOK_SECRET is provisioned; the tile carries a "Clip" badge so the
  # static cover never implies a static output.
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_d9fb91bd-db63-4840-92ae-18814f2e8ddc.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/edited/image_68c82e2b-e269-4089-9155-728069958e04.png"
  order: 40
---

# Doodle in Motion

Animate ONE image the user already has. That image becomes the clip's first
frame, so the output is that drawing moving — not a new interpretation of it.

## When this is the right skill

Pick this when the user points at something specific and asks for movement:

- "animate this" / "make this move" / "can you make it a video"
- "make the doodle you just made wave"
- "turn my avatar into a short clip"

Choose `doodle-reel` instead when the user wants a NEW shot starring the
character ("a clip of her riding a scooter", "make a video of this character
in a coffee shop"). The test is simple: if the user's request describes a
scene that is not already in the picture, it is a reel, not motion.

If there is no image yet, make one first with the right image skill, show it,
and only then offer to animate it.

## What to animate

The frame is fixed, so what you are choosing is the MOTION:

- one clear primary action (a wave, a blink-and-smile, a small nod, a laugh)
- secondary drift in hair, scarf, earrings, clothing
- a background that stays a calm flat wash — it should not compete

Keep it small. A doodle that tries to do three things in five seconds reads as
a glitch, not as charm.

## How to run it

1. Confirm you have the image URL to animate. Usually it is the doodle you
   generated a moment ago in this same conversation; otherwise it is the
   user's attached photo. If you have neither, ask — do not call the tool.
2. Call `generateVideo` with `skill: "motion"`, that URL as `imageUrl`, and a
   short `description` of the action if the user named one.
3. Pass `seconds` whenever the user names a length. If you omit it the clip is
   5 seconds. It costs 1 credit per second, so never quietly pick 15.
4. The tool returns `status: "queued"` and a `jobId`. That means the clip is
   RENDERING, not ready. Say so in one line — roughly a minute, it will appear
   here on its own, it has sound — and then stop.

## What not to do

- Do NOT call the tool again for the same request while a clip is rendering,
  and do not call it to "check" on one. There is nothing to poll: the finished
  clip is delivered to the app by itself.
- Do NOT claim the clip is ready, describe what it looks like, or offer a
  download link. You have not seen it.
- Do NOT promise a resolution, a frame rate or a silent clip. Clips render at
  480p and always carry an audio track.
