---
name: festival-pack
description: 'Use when the user wants a festival photo set, Indian celebration pack, or multiple festive versions of the same person from a photo.'
license: MIT
user-invocable: true
metadata:
  id: festival
  displayName: Festival Pack
  tagline: 6 festive Indian celebration scenes from one photo
  desc: 'Turns a photo into 6 separate doodle images of the same character, each celebrating a different Indian festival — perfect for WhatsApp sharing and seasonal greetings.'
  longDesc: 'Creates six individual square doodle images from a single photo. Each image places the same recognizable character in a distinct Indian festival scene (Diwali, Holi, Raksha Bandhan, Onam, Pongal, New Year) with culturally accurate motifs, clothing, and palettes — designed for WhatsApp stickers, Instagram stories, and seasonal greeting cards.'
  category: packs
  tags: [festivals, indian, seasonal]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 2
  order: 17
---

# Festival Pack

Turn one uploaded photo into 6 separate square doodle images — the same
character celebrating six different Indian festivals, each its own image file.

## When this is the right skill

Pick this skill when the user wants:

- A festival-themed photo set of themselves
- Indian celebration versions (Diwali, Holi, Raksha Bandhan, etc.)
- Seasonal greeting images for WhatsApp or social sharing
- "Make me a festival pack" or "Diwali avatar" or "Holi version of me"
- Multiple festive looks of the same person

Do NOT use this for a single festival scene (use normal doodle with a theme
hint instead), for expressions/reactions (use expression-sheet), or for
seasonal weather scenes (use seasonal-pack).

## What to draw

Six separate 1:1 images, each a head-and-shoulders-to-waist naive
marker-and-ink doodle of the same person in a festival scene:

1. **Diwali** — diyas/oil lamps, rangoli, marigold garlands, warm amber night glow, festive kurta or saree
2. **Holi** — bright dry colour powder clouds, white clothing stained with colour, water balloons, sunny daytime energy
3. **Raksha Bandhan** — rakhi thread being tied on a wrist, sweets on a thali, sibling warmth, soft indoor light
4. **Onam** — Kerala setting, pookalam flower carpet, white-and-gold kasavu clothing, banana leaf and boat motifs
5. **Pongal** — Tamil harvest, clay pot boiling over with rice, sugarcane, kolam floor pattern, sunny outdoors
6. **New Year** — fireworks, confetti, sparklers, midnight sky, party outfit

Character consistency is paramount: hairstyle, face shape, skin tone,
and accessories are identical across all six. Only the festival layer
(clothing details, palette, background, motifs) changes.

Cultural accuracy matters — motifs are never mixed between festivals,
and no deities are depicted.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "festival"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. The tool returns SIX separate images (one per festival). Cost: 6 credits (1 per image).
5. Report the result briefly; the app renders all six images in a grid.

## Following up

Offer to regenerate a specific festival the user dislikes, suggest pairing
with the expression-sheet skill for a complete sticker set, or recommend
the seasonal-pack for weather-based scenes instead.
