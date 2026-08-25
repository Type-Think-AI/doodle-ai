---
name: sticker-pack
description: 'Use when the user wants a sticker sheet, die-cut stickers, printable stickers, or several playful sticker poses from a photo.'
license: MIT
user-invocable: true
metadata:
  id: stickers
  displayName: Sticker Pack
  tagline: Die-cut sticker sheets from your doodles
  desc: 'Turns a photo into a sheet of separate die-cut doodle stickers with paper grain and soft shadows.'
  longDesc: 'Creates a square sticker sheet from a photo, with several distinct illustrated poses of the same character, an even white die-cut border, subtle paper grain, and soft contact shadows.'
  category: freeform
  tags: [stickers, die cut, printable]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 4
  thumbnailUrl: 'https://cdn.picxstudio.com/api/generated/image_560d04c6-b592-4f2a-a1a8-e54d87dca174.png'
  order: 4
---

# Sticker Pack

Turn one uploaded photo into a square sheet of separate die-cut doodle
stickers featuring the same illustrated character in several poses.

## When this is the right skill

Pick this skill for sticker sheets, printable stickers, die-cut sticker
packs, messaging stickers, or a set of playful character reactions.

## What to draw

Create four or five separate head-and-shoulders stickers of the same
recognizable character. Give every sticker its own clean white die-cut border,
subtle paper grain, and soft contact shadow. Use a clean warm-white sheet
background with enough space between stickers.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "stickers"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

## Following up

Offer a different sticker pose set, a mood-caption collage, or a full-body action collage.
