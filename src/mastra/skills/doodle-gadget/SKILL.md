---
name: doodle-gadget
description: 'Use when the user wants a vertical, post-ready comedy clip starring their doodle character with a silly invented gadget — "make a funny retro cartoon video", "my doodle with a gadget that goes wrong", "old-school gag anime clip", "comedy reel". Fifteen seconds, portrait 9:16, built for a phone feed. Retro gag-comedy STYLE through craft only — even thick outline, flat primaries, four-panel timing — never any named series or character. Not for gently animating one exact picture: that is doodle-motion.'
license: MIT
user-invocable: true
metadata:
  id: gadget
  kind: video
  displayName: Gadget Gag
  tagline: A vertical retro comedy clip
  desc: 'Films a fifteen-second portrait comedy clip starring your doodle character — they proudly hold up an invented gadget, it misfires with a harmless pop, and they turn to camera with a big reaction.'
  longDesc: 'A vertical clip made to be posted. Your doodles fix who the character is, then it films a brand-new gag in three parts: the proud reveal in an ordinary suburban room, the misfire, and a held reaction on the last frame — the reaction is the punchline and gets the most screen time. Expect the retro broadcast-cartoon toolkit: a thick ink outline of even weight all the way round, very rounded simple shapes, flat primary-colour fills with almost no shading, oversized round eyes with dot-and-line features, and a faint paper grain. Locked-off camera like a TV gag shot with one snap-in on the reaction. Portrait 9:16 at fifteen seconds, one credit per second; it comes to life in the background and lands in the chat.'
  category: freeform
  tags: [video, comedy, anime, vertical]
  runnable: true
  requiresPhoto: true
  aspectRatio: '9:16'
  sampleIndex: 3
  # Cover: frame one of this skill's own finished clip
  # (vertical-gadget), decoded from the mp4 and uploaded as a managed asset by
  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a
  # lookalike still. Clip, frame time and dimensions are recorded in
  # src/data/skill-video-covers.json, so this cover is re-derivable.
  thumbnailUrl: "https://cdn.picxstudio.com/uploads/api/gadget-first-frame_b83908fa-034f-4bd5-8538-d722ff2260f7.jpg"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 50
---

# Gadget Gag

Film a NEW vertical comedy clip starring a character the user already has
doodles of. The references define who the character **is** — hair, face,
colours, outfit — not the composition of the shot.

## Comedy is timing, so the prompt spends its words on timing

Hold, misfire, **big held reaction**. The reaction is the punchline and takes the
most screen time; a gag that cuts away from the reaction has thrown away its own
payoff. The camera is locked off like a TV gag shot with a single snap-in on the
reaction, because a drifting camera reads as drama and kills the joke.

## The craft that carries the genre

This look is unusually specific and easy to get wrong: a **thick ink outline of
even weight all the way round** (not the tapered brush line of action anime),
very rounded simple shapes, **flat primary-colour fills with almost no shading**,
oversized round eyes with dot-and-line features, an ordinary suburban setting,
and a soft broadcast-era finish with faint paper grain.

The gadget is invented for the clip and described by what it does, never named
after anything. No series, studio or character noun appears in the prompt.

## Vertical and fifteen seconds, on purpose

`reference` mode, because H3 Max ignores `aspect_ratio` in image mode and a
portrait request from a square doodle returns square. Fifteen seconds because a
gag needs setup, turn and reaction — three beats, not one.
