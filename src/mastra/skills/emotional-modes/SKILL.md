---
name: emotional-modes
description: 'Roadmap preview, not yet runnable. Would redraw an avatar through a chosen emotional lens (cozy, chaotic, dreamy) instead of a fixed visual theme.'
license: MIT
user-invocable: false
metadata:
  id: moods
  displayName: Emotional Modes
  tagline: 'Mood-driven doodle variations — cozy, chaotic, dreamy'
  desc: 'Same avatar, redrawn through a chosen emotional lens instead of a fixed visual theme.'
  longDesc: 'On the roadmap: instead of picking a fixed visual theme, describe a mood — cozy, chaotic, dreamy, moody — and the doodle avatar linework, palette, and composition shift to match it.'
  category: freeform
  tags: [mood, style, roadmap]
  runnable: false
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_298403d7-f0f6-477f-a996-ebfb09cf6f83.png"
  order: 5
---

# Emotional Modes (roadmap)

Not yet implemented. `runnable: false` keeps it out of the agent while
still listing it in the catalog with honest copy.

## Intended behaviour

Today the visual style comes from a fixed theme picked in Settings. This
skill would replace that with a described mood, and shift three things to
match it:

| Mood    | Linework            | Palette                  | Composition           |
| ------- | ------------------- | ------------------------ | --------------------- |
| Cozy    | Soft, rounded       | Warm creams and rust     | Close, centered       |
| Chaotic | Scratchy, uneven    | Clashing brights         | Off-center, crowded   |
| Dreamy  | Light, broken       | Pale washes              | Floating, lots of air |
| Moody   | Heavy, high contrast| Desaturated, cool        | Tight crop, shadowed  |

## Open questions before building

- Does mood replace the Settings theme, or layer on top of it?
- Should free-text moods be accepted, or only a fixed set?
- Is one mood per generation enough, or should it produce a comparison set?
