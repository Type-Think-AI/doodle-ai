---
name: doodle-creature
description: 'Use when the user wants a vertical, post-ready clip of their doodle character with a little creature companion — "make me a monster tamer video", "my doodle with a cute creature", "call out a pet monster", "creature collector clip for a reel". Fifteen seconds, portrait 9:16, built for a phone feed. The creature is ORIGINAL and invented for the clip; creature-collector STYLE through craft only, never any named franchise, creature or character. Not for gently animating one exact picture: that is doodle-motion.'
license: MIT
user-invocable: true
metadata:
  id: creature
  kind: video
  displayName: Monster Tamer
  tagline: A vertical clip with your own little creature
  desc: 'Films a fifteen-second portrait clip starring your doodle character and an original creature — a call-out, a sparkle-puff appearance, and the two of them landing side by side.'
  longDesc: 'A vertical clip made to be posted. Your doodles fix who the person is, then it invents an original little creature and films a brand-new beat in three parts: the call, the creature appearing in a puff of sparkle, and the two of them squared up together on the last frame. The creature is built to real design discipline — a silhouette that still reads at coin size, one clear signature feature, and its own limited high-identity palette so it looks designed rather than generic. Bouncy squash-and-stretch on its landing, flat cel shading throughout. Portrait 9:16 at fifteen seconds, one credit per second; it comes to life in the background and lands in the chat.'
  category: freeform
  tags: [video, creature, anime, vertical]
  runnable: true
  requiresPhoto: true
  aspectRatio: '9:16'
  sampleIndex: 2
  # Cover: the frame at t=10s of this skill's own finished clip, chosen deliberately because the companion creature does not exist on screen until the mid beat, so frame one shows a character alone and misrepresents the skill; 10s has the creature landed beside them with its signature silhouette readable at tile size,
  # (vertical-creature), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/creature-first-frame_caf944d0-8b47-44cc-9e9f-0f729510b3e5.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 49
---

# Monster Tamer

Film a NEW vertical clip starring a character the user already has doodles of,
alongside a creature invented for this clip. The references define the **person**
— hair, face, colours, outfit — not the composition, and never the creature.

## The creature must be original, and that is a design brief not a disclaimer

Every recognisable creature-collector franchise rests on the same discipline, and
the discipline is reproducible without borrowing a single character:

- a **silhouette readable at coin size** — if it only works large, it is not a
  mascot
- **one clear signature feature** rather than five competing ones
- a **limited, high-identity palette** of its own, so it reads as a designed
  character instead of a colourful blob
- **rounded shape language**, because rounded reads as friendly and triangular
  reads as threatening

Name no franchise, creature or character anywhere in the prompt. A named-creature
request is an IP problem and one the model frequently refuses, which would look
like our bug rather than a policy.

## Vertical and fifteen seconds, on purpose

`reference` mode, because H3 Max ignores `aspect_ratio` in image mode and a
portrait request from a square doodle returns square. Fifteen seconds because
call → appear → bounce → settle together is four moments; five seconds fits one.
