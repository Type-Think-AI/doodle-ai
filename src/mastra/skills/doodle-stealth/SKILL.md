---
name: doodle-stealth
description: 'Use when the user wants a vertical, post-ready ninja action clip starring their doodle character — "make a ninja video", "rooftop leap with a power effect", "shinobi-style action for a reel", "hand signs then a big glow". Fifteen seconds, portrait 9:16, built for a phone feed. Stealth-action anime STYLE through craft only — earth tones, one glowing accent, crosshatch, the hands-together focusing beat — never any named series or character. Not for gently animating one exact picture: that is doodle-motion.'
license: MIT
user-invocable: true
metadata:
  id: stealth
  kind: video
  displayName: Ninja Village
  tagline: A vertical rooftop action clip
  desc: 'Films a fifteen-second portrait action clip starring your doodle character — a rooftop crouch at dusk, hands together to focus, then a leap as a glowing power effect bursts around them.'
  longDesc: 'A vertical clip made to be posted. Your doodles fix who the character is, then it films a brand-new stealth-action beat in three parts: the rooftop at dusk, the focus and the burst at full energy, and a low ready stance held on the last frame. Expect the action-anime toolkit — a muted earth-tone and sandy palette with exactly one saturated glowing accent, dense crosshatch shading, background speed lines and drifting smoke, and the hands-together focusing gesture that comes before the glow rather than during it. Portrait 9:16 with the action staged up and down the frame. Fifteen seconds at one credit per second; it comes to life in the background and lands in the chat.'
  category: freeform
  tags: [video, action, anime, vertical]
  runnable: true
  requiresPhoto: true
  aspectRatio: '9:16'
  sampleIndex: 1
  # Cover: frame one of this skill's own finished clip
  # (vertical-stealth), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/stealth-first-frame_53498050-3e8e-485d-9a5d-ab42b6b83433.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 48
---

# Ninja Village

Film a NEW vertical action clip starring a character the user already has
doodles of. The references define who the character **is** — hair, face,
colours, outfit — not the composition of the shot.

## The one ordering detail that makes it read right

The **hands-together focusing gesture comes before the glow, never during it.**
That order is the genre's own cinematic shorthand for "power incoming"; collapse
the two into one moment and the beat stops reading as a charge-up and becomes a
character standing in a light.

## The craft that carries the genre

A muted earth-tone and sandy palette for gear and village, with **exactly one**
saturated accent colour reserved for the technique effect — the restraint is
what makes the accent land. Dense crosshatch shading, speed lines on the
*background* rather than the figure (the Japanese convention keeps the subject
sharp), smoke and a rim glow on the release.

No series, studio or character name appears in the prompt. "Shinobi" is also
avoided — it carries a live trademark — so the gear is described as wrapped
stealth gear instead.

## Vertical and fifteen seconds, on purpose

`reference` mode, because H3 Max ignores `aspect_ratio` in image mode and a
portrait request from a square doodle comes back square. Fifteen seconds because
crouch → focus → leap → land is four moments, and five seconds only fits one.
