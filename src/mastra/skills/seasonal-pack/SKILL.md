---
name: seasonal-pack
description: 'Roadmap preview, not yet runnable. Would produce a Doodle Collage with a holiday or seasonal theme baked into the props, palette, and overlay doodles.'
license: MIT
user-invocable: false
metadata:
  id: seasonal
  displayName: Seasonal Pack
  tagline: Holiday and seasonal doodle collage themes
  desc: 'Doodle Collage with a seasonal theme baked into the props, palette, and overlay doodles.'
  longDesc: 'On the roadmap: a themed variant of Doodle Collage for holidays and seasons — the overlay doodles, palette, and small props in each panel shift to match (snowflakes in winter, blossoms in spring, and so on).'
  category: collages
  tags: [seasonal, collage, roadmap]
  runnable: false
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 1
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_51fc5883-5be1-476f-a98d-1a57f40c7c5a.png"
  order: 6
---

# Seasonal Pack (roadmap)

Not yet implemented. `runnable: false` keeps it out of the agent while
still listing it in the catalog with honest copy.

## Intended behaviour

A themed variant of `doodle-collage`. Same 3x2 grid and the same rules from
`../doodle-collage/references/grid-layout.md`, with a season driving three
layers:

| Season | Overlay doodles      | Palette                | Props                  |
| ------ | -------------------- | ---------------------- | ---------------------- |
| Winter | Snowflakes, steam    | Cool blues and white   | Scarves, mugs, mittens |
| Spring | Blossoms, small buds | Fresh greens and pink  | Flowers, umbrellas     |
| Summer | Sun rays, waves      | Bright warm brights    | Sunglasses, ice cream  |
| Autumn | Falling leaves       | Rust, mustard, brown   | Sweaters, hot drinks   |

## Open questions before building

- Is the season chosen by the user, or inferred from the current date?
- Should specific holidays be supported separately from broad seasons?
- Does it reuse the `collage` generation mode with an extra prompt layer,
  or need its own mode in doodle-constants.ts?
