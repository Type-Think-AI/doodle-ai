---
name: sticker-pack
description: 'Roadmap preview, not yet runnable. Would slice a doodle into a sheet of die-cut stickers with paper grain and a soft drop shadow.'
license: MIT
user-invocable: false
metadata:
  id: stickers
  displayName: Sticker Pack
  tagline: Die-cut sticker sheets from your doodles
  desc: 'Slices a doodle into a sheet of die-cut stickers with paper grain and a soft drop shadow.'
  longDesc: 'On the roadmap: feed a photo or an existing doodle through a cut-out pass that finds clean silhouettes, then lays each one on a sticker sheet with paper grain, a white die-cut border, and a soft contact shadow.'
  category: freeform
  tags: [stickers, die cut, roadmap]
  runnable: false
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 4
  order: 4
---

# Sticker Pack (roadmap)

Not yet implemented. This package exists so the skill appears in the
catalog with accurate copy, and so the eventual implementation has a home.
`runnable: false` keeps it out of the agent, so the model is never offered
a skill it cannot actually run.

## Intended behaviour

Take a photo or an existing doodle and produce a sticker sheet:

1. Find clean silhouettes in the source artwork.
2. Cut each one out with a white die-cut border of even thickness.
3. Lay the cut-outs across a sheet with paper grain texture.
4. Add a soft contact shadow under each sticker.

## Open questions before building

- Should the source be a fresh photo, or only doodles already generated in
  the current thread?
- How many stickers per sheet, and is the count user-controlled?
- Does the sheet need to be print-ready (bleed, cut lines, fixed DPI)?
