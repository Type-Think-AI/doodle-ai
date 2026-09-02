---
name: doodle-voyage
description: 'Use when the user wants a vertical, post-ready adventure clip starring their doodle character on the high seas — "make a pirate adventure video", "put my doodle on a ship", "a swashbuckling clip for TikTok", "sea adventure reel". Fifteen seconds, portrait 9:16, built for a phone feed. Pirate-adventure anime STYLE through craft only — rubbery limbs, tropical palette, motion lines — never any named series or character. Not for gently animating one exact picture: that is doodle-motion.'
license: MIT
user-invocable: true
metadata:
  id: voyage
  kind: video
  displayName: Pirate Voyage
  tagline: A vertical high-seas adventure clip
  desc: 'Films a fifteen-second portrait adventure clip starring your doodle character — a dash across a ship deck, a rope swing over the water, and a grinning landing at the rail.'
  longDesc: 'A vertical clip made to be posted. Your doodles fix who the character is, then it films a brand-new high-seas beat in three parts: the deck under open sky, the swing at full energy, and a held victory stance on the last frame. Expect the adventure-anime toolkit — exaggerated rubbery limbs, a bright tropical palette of sea-and-sky blues and sun-warm sand, heavy hand-drawn motion lines with stretch-and-snap on the fastest move. Portrait 9:16 with the action staged up and down the frame, so nothing important sits where a feed puts its buttons. Fifteen seconds at one credit per second; it comes to life in the background and lands in the chat.'
  category: freeform
  tags: [video, adventure, anime, vertical]
  runnable: true
  requiresPhoto: true
  # 9:16 because the OUTPUT is portrait. A square or landscape cover would
  # misrepresent the shape of what this skill actually returns.
  aspectRatio: '9:16'
  sampleIndex: 0
  # Cover: the frame at t=9s of this skill's own finished clip, chosen deliberately because frame one is a plain portrait before the action starts; 9s is mid rope-swing over the water toward the ship, with the motion arc drawn in, and it is full-bleed 9:16,
  # (vertical-voyage), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/voyage-first-frame_e0e7587f-aa6e-4462-b525-e6e24c694eb8.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 47
---

# Pirate Voyage

Film a NEW vertical adventure clip starring a character the user already has
doodles of. The references define who the character **is** — hair, face,
colours, outfit — not the composition of the shot.

## Why this skill is vertical and long

Two deliberate differences from the square 5-second clip skills:

- **9:16, and `reference` mode to get it.** H3 Max ignores `aspect_ratio` in
  image mode, because the output follows the frame you gave it — so asking for
  portrait from a square doodle silently returns square. Reference mode keeps
  the likeness and lets the composition be built vertical.
- **Fifteen seconds.** A swing that starts, peaks and lands cannot happen in
  five. The prompt names three beats with rough timings so the length becomes a
  story rather than a longer fidget.

## The craft that carries the genre

Adventure anime is recognisable from technique, not from a cast: exaggerated
rubbery elastic limb proportions, expressive comedic faces, a bright
tropical-island palette, and heavy hand-drawn motion lines with elastic
stretch-and-snap through the fastest part of a move. Name none of that after a
series — the drawing technique is not anyone's trademark, and a named-character
prompt is both an IP problem and one the model will often refuse outright.

## What the user gets

A fifteen-second portrait clip with sound, one credit per second, delivered to
the chat when it is ready. The final pose is held still for the last second so
the clip ends on a frame worth pausing on.
