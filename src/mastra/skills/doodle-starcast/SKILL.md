---
name: doodle-starcast
description: 'Use when the user wants a NEW magical-girl-style transformation clip starring their doodle character — "make a magical girl transformation of her", "anime transformation reel", "have my character twirl with ribbons and sparkles into a hero pose". The reference doodles fix the likeness, and the shot itself is new. Anime STYLE, not any named character. Not for animating one exact picture: that is doodle-spark.'
license: MIT
user-invocable: true
metadata:
  id: starcast
  kind: video
  displayName: Doodle Transformation
  tagline: A magical-girl-style transformation reel of your character
  desc: 'Uses one to ten doodles as character references and films a NEW 5-15 second magical-girl-style transformation with sound — same face, same colours, ribbons, sparkles and a hero pose.'
  longDesc: 'Reference-to-video keeps a character recognisable across a clip that was never drawn: you supply doodles that say who they are, and it films an anime-style transformation — a graceful twirl wrapped in ribbon trails and a rising shower of sparkles, landing in a confident hero pose. Expect one continuous camera move, a bright magical-girl palette layered as flat cel tints, and a sparse shimmering sound bed. This is an anime STYLE, not any named character or series. Costs one credit per second of clip, renders in the background, and arrives in the chat about a minute after you ask.'
  category: freeform
  tags: [video, reel, anime]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 3
  # A real frame of what this skill renders: a doodle character mid magical-girl-
  # style transformation (ribbon trails, a shower of sparkles, a hero pose),
  # produced by scripts/generate-video-skill-covers.ts through the app's own
  # prompt path. A still stands in for a clip because video cannot run until
  # PICX_WEBHOOK_SECRET is provisioned; the tile carries a "Clip" badge so the
  # static cover never implies a static output. Verified HTTP 200 image/png.
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_557d2804-b6c6-4308-b8db-dc4c238cfde3.png"
  order: 43
---

# Doodle Transformation

Film a NEW magical-girl-style transformation shot starring a character the user
already has doodles of. The references define who the character IS — hair, face,
colours, outfit — not the composition of the shot.

This skill is an anime **style**, never an anime **character**. You film the
user's own doodle character with magical-girl flourishes (ribbons, sparkles, a
bright palette, a hero pose). Do not turn it into, or reference, any named
character, series or studio.

## When this is the right skill

Pick this when the request describes a transformation that is not already in the
picture:

- "make a magical-girl transformation of her"
- "anime transformation reel of my character"
- "have him twirl with ribbons and sparkles into a hero pose"

Choose `doodle-spark` instead when the user wants THAT exact drawing to power up
in place ("make my doodle charge up", "add an aura to this one"). Getting this
backwards produces a technically fine clip of the wrong thing, the most common
mistake with this model.

## What to film

- One transformation beat, described plainly. A twirl into a hero pose. A
  ribbon sweep that settles into a smile.
- Hand-drawn magical-girl flourishes: looping ribbon trails, a rising shower of
  sparkles, a soft radial glow behind the final pose.
- One continuous camera move — a slow arc that follows the twirl and settles on
  the pose. Not two moves, and never a whip pan or an orbit.
- Staging that survives a phone screen: full body or waist up, generous empty
  space, one flat background so the ribbons and sparkles read.

## How to run it

1. Gather the reference URLs. Best case is several doodles of the same character
   from this conversation; one is enough. Put the clearest full view first —
   references are cited in order.
2. Call `generateVideo` with `skill: "starcast"`, those URLs as `referenceUrls`,
   and the user's action in `description`. If they named a length, pass
   `seconds` — otherwise it renders 5 seconds at 1 credit per second.
3. If the user has no doodle of the character yet, make one first with an image
   skill, show it, then offer the transformation.
4. The tool returns `status: "queued"` with a `jobId`: the clip is RENDERING.
   Say it will land here on its own in about a minute and that it has sound,
   then stop.

## What not to do

- Do NOT name or depict a character, series, studio or artist. This is a style
  ("magical-girl transformation", "ribbons and sparkles", "hero pose"), not a
  cast.
- Do NOT send more than ten references — the extras are dropped, and the first
  ones shape the character anyway.
- Do NOT re-call the tool for the same request, or call it to check progress.
  The finished clip is delivered on its own.
- Do NOT describe or evaluate the clip. You have not seen it.
- Do NOT film a real, named person. This skill is for the user's own doodle
  characters.
