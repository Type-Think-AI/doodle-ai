---
name: childhood-me
description: 'Use when the user wants to see themselves as a child, wants a de-aged doodle, childhood version, or asks for "me as a kid" from an adult photo.'
license: MIT
user-invocable: true
metadata:
  id: childhood
  displayName: Childhood Me
  tagline: See yourself as a kid — 4 ages from one photo
  desc: 'Turns an adult photo into 4 separate doodle portraits of the same person de-aged to childhood stages — toddler, early school, pre-teen, and teenager.'
  longDesc: 'Creates four individual square doodle images from a single adult photo. Each image shows the same recognizable person at a different childhood age (3, 6, 10, and teen) while preserving their core identity features — hair colour, eye colour, face shape, and distinguishing marks. Age-appropriate proportions, clothing, and features change per stage, but the character is unmistakably the same person across the set.'
  category: packs
  tags: [childhood, de-age, nostalgia]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 1
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_f559efad-7183-4f0d-8fc2-aff3e2cdc4e4.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_1c612a1f-0cd2-4f18-9367-965f33257349.png"
  order: 16
---

# Childhood Me

Turn one uploaded adult photo into 4 separate square doodle portraits — the
same person de-aged to four childhood stages, each its own image file.

## When this is the right skill

Pick this skill when the user wants:

- A childhood version of themselves or someone else
- "Me as a kid" / "what did I look like as a child"
- De-aged portraits at multiple stages
- A nostalgia / throwback set from an adult photo
- "Show me growing up" or "baby me to teen me"

Do NOT use this for a single baby photo (use normal doodle), for aging
someone UP (not supported), or for turning a child photo into an adult.

## What to draw

Four separate 1:1 images, each a head-and-shoulders naive marker-and-ink
doodle of the same person de-aged to one childhood stage:

1. **Age 3** — toddler: very round chubby cheeks, huge head-to-body ratio,
   button nose, wide-set oversized eyes, baby-plump jawline. Simple toddler
   outfit (onesie or elastic shorts).
2. **Age 6** — early school: round cheeks with a gap-tooth grin (missing
   front teeth), head still large, slightly longer face. Simple graphic tee
   and light-up sneakers.
3. **Age 10** — pre-teen: face lengthening, adult front teeth slightly
   oversized for the face, less baby-fat, emerging jawline. Hoodie and
   chunky trainers.
4. **Teen** — around 14: proportions nearing adult but softer and less
   defined, rounder jaw, narrower shoulders. Oversized band tee and
   canvas sneakers.

Identity consistency is paramount: hair colour and pattern, eye colour,
skin tone, face shape, freckles/moles, and glasses persist across all four.
Only age-appropriate proportions, clothing, and developmental features
change. No adult attributes (facial hair, makeup, jewellery) on any child.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "childhood"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. The tool returns FOUR separate images (one per age). Cost: 4 credits (one generation per image).
5. Report the result briefly; the app renders all four images in a row.

## Following up

Offer to regenerate a specific age the user dislikes, suggest adding a
description for era-specific clothing ("80s kid", "90s kid"), or recommend
the seasonal-pack skill for a different multi-image concept.
