---
name: pet-portrait
description: 'Use when the user wants an illustrated portrait of their pet — "my dog", "my cat", "draw my pet", "doodle my puppy", "me and my cat", "me with my dog", a pet name like "draw Luna" or "make Mochi a doodle". Handles pet alone or pet together with its owner in one frame. For a human-only portrait without an animal, use doodle-avatar instead. For sticker sheets of the user (not their pet), use sticker-pack.'
license: MIT
user-invocable: true
metadata:
  id: pet
  displayName: Pet Portrait
  tagline: Your pet, illustrated exactly as they are
  desc: 'Turns a pet photo into an illustrated doodle portrait preserving breed, markings, and personality.'
  longDesc: 'Reads breed silhouette, coat pattern, specific markings, ear carriage, muzzle shape, and eye colour from the photo and redraws the animal in naive doodle style without genericising or anthropomorphising it. Supports pet alone or pet with owner in the same illustrated frame.'
  category: freeform
  tags: [pet, dog, cat, portrait]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 3
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_69258a65-9196-4de9-b913-ae36d5fbc7a3.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_23cfb42b-c1a5-4240-8786-eca548a23fa4.png"
  order: 12
---

# Pet Portrait

Turn an uploaded photo of a pet — or a pet with its owner — into a single
illustrated doodle portrait that owners instantly recognise as *their*
specific animal.

## When this is the right skill

Pick this skill when the photo contains a pet (dog, cat, rabbit, bird,
hamster, etc.) and the user wants an illustrated portrait of that animal,
with or without a human companion.

Choose a different skill instead when:

- The user wants a human-only portrait with no animal → `doodle-avatar`
- The user wants a multi-panel collage of themselves → `doodle-collage`
- The user wants full-body human action poses → `full-body-collage`
- The user wants die-cut stickers of themselves → `sticker-pack`
- The user wants mood-word captioned panels → `mood-captions`
- The user wants a greeting card → `gift`
- No photo is available and the user wants something random → `surprise-me`

## What to draw

### Pet alone

Read the photo and preserve the animal's **actual identifying features**:

- Breed silhouette and body proportions (stocky bulldog vs lean whippet,
  cobby Persian vs lithe Siamese)
- Coat pattern and specific markings — the white chest patch, the tabby M
  forehead, the odd-coloured sock, the brindle streaks, the calico splashes
- Ear carriage (erect, floppy, folded, one up one down, torn tip)
- Muzzle length and nose colour
- Eye colour and shape
- Tail shape (curled, docked, bottle-brush, whip-thin)

Then redraw in the house illustrated doodle style: bold clean outlines, flat
cheerful colours, slightly simplified but **not genericised**. The result
should look like that *specific* animal drawn by hand, not "a cartoon dog".

### Pet with owner

When the photo shows a human holding, petting, or posed alongside the animal:

- Keep both subjects in the same illustrated style and same frame
- Preserve the real physical interaction (held in arms, on lap, nose-to-nose,
  leaning against leg)
- Apply the same human-likeness rules as `doodle-avatar` to the person:
  hairstyle, face shape, skin tone, expression, accessories
- Apply the pet-likeness rules above to the animal
- Neither subject dominates — compose as a pair portrait

### Hard constraints

- **Never** anthropomorphise the animal (no upright stance, no human
  clothing unless actually visible in the source photo)
- **Never** change the breed or species
- **Never** "cute-en" the muzzle into a generic round cartoon face — if the
  animal has a long snout, keep the long snout
- **Never** add accessories, bows, hats, or costumes absent from the photo
- **Never** make it photorealistic — it must read as illustration

## How to run it

1. Confirm a photo containing a pet is attached. If none is present, ask the
   user to upload one. If they want a human-only portrait, redirect to
   `doodle-avatar`.
2. Call `generateDoodle` with `skill: "pet"` and the uploaded photo as
   `imageUrl`.
3. If the user also attached a style reference, pass it as `refImageUrl`.
4. Report the result briefly — the app displays the image itself.
