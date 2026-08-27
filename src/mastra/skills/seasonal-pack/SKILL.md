---
name: seasonal-pack
description: 'Use when the user wants their photo turned into a set of four seasonal doodle illustrations — one per season (Spring, Summer, Autumn, Winter) — showing the same character in season-matched clothing, palette, and doodle props.'
license: MIT
user-invocable: true
metadata:
  id: seasonal
  displayName: Seasonal Pack
  tagline: Four hand-drawn seasonal portraits from one photo
  desc: 'Transforms a photo into four separate square doodle images — one per season — with matched clothing, colour palette, and overlay doodles.'
  longDesc: 'Produces a four-image set (Spring, Summer, Autumn, Winter) from a single uploaded photo. Each image is its own standalone square doodle illustration keeping the person fully recognisable while changing only the seasonal layer: clothing, colour palette, background props, and hand-drawn overlay accents.'
  category: packs
  tags: [seasonal, pack, multi-image]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 1
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_51fc5883-5be1-476f-a98d-1a57f40c7c5a.png"
  order: 6
---

# Seasonal Pack

Turn one uploaded photo into four separate square doodle illustrations — one
per season — of the same person in season-matched style.

## When this is the right skill

Pick this skill when the user asks for seasonal portraits, a "four seasons"
set, spring/summer/autumn/winter versions, or a multi-image seasonal pack.
Also appropriate when the user wants a set of the same character in different
seasonal moods, or asks for a seasonal gift set.

## What to draw

Each of the four images keeps the person's face, hairstyle, skin tone, and
expression fully recognisable as a naive marker-and-ink doodle character. Only
the seasonal layer changes:

| Season | Palette                        | Clothing           | Doodle accents              |
| ------ | ------------------------------ | ------------------ | --------------------------- |
| Spring | Cherry-blossom pink, mint, cream | Light cardigan, pastel scarf | Petals, sprouts, butterflies |
| Summer | Coral, golden yellow, sky-blue | Sleeveless top, sunglasses   | Sun rays, waves, splashes   |
| Autumn | Amber, rust, mustard, burgundy | Chunky scarf, boots, beanie  | Falling leaves, acorns, steam |
| Winter | Pale blue, silver, lavender-grey | Pom-pom beanie, puffy coat, mittens | Snowflakes, sparkles, breath clouds |

The four images must look like one cohesive set of the same character.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "seasonal"` and the uploaded photo as `imageUrl`.
3. The tool returns FOUR images (one per season: Spring, Summer, Autumn, Winter). Total cost is 4 credits — one per image.
4. Report the results briefly; the app renders all four images.

## Following up

Offer to regenerate a single season with a different vibe, switch to a
different pack skill (stickers, mini-me), or try a full six-panel collage.
