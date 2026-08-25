---
name: surprise-me
description: 'Use when the user has no photo and does not want to upload one, or explicitly says "surprise me" / "make something up" / "random character". This is the only skill that needs no photo.'
license: MIT
user-invocable: true
metadata:
  id: surprise
  displayName: Surprise Me
  tagline: 'No photo needed — a random fictional doodle character'
  desc: 'Skips the photo entirely and generates a fully fictional doodle avatar from a random character description.'
  longDesc: 'For when you do not have (or do not want to use) a photo. Picks a random fictional character description — hairstyle, expression, accessories — and draws it in the same naive doodle style as Doodle Avatar.'
  category: freeform
  tags: [freeform, no photo, random]
  runnable: true
  requiresPhoto: false
  aspectRatio: '1:1'
  sampleIndex: 3
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_33f43b6a-1bc7-48b8-af1e-4b44abe09a73.png"
  order: 3
---

# Surprise Me

Draw a fully fictional naive doodle fashion-chibi character. No photo
required — this is the only skill that works with nothing attached.

## When this is the right skill

Pick this skill when:

- the user explicitly asks to be surprised, or for something random
- the user describes a character in words instead of attaching a photo
- the user says they have no photo, or would rather not upload one

It is also the right thing to **offer** whenever a photo-based skill is
blocked because nothing is attached. Suggest it rather than leaving the
user stuck.

## What to draw

If the user gave any description at all — hair, vibe, outfit, accessories,
personality, occupation — build the character from it and follow it
closely. If they gave nothing, invent something fun yourself; see
`references/character-ideas.md` for seeds worth combining.

Style notes for this skill specifically:

- bold graphic hair shapes
- rough marker or dry-brush edges
- restrained, watercolor-like color rather than fully flat fills
- clean white or warm-white background
- fashion-forward, deliberately naive brushwork with playful asymmetry

No photorealism, no 3D, no heavy shading. The shared rules in
`../doodle-avatar/references/style-guide.md` still apply.

## How to run it

1. Never ask for a photo — the point of this skill is that none is needed.
2. Call `generateDoodle` with `skill: "surprise"`. Pass the user's own
   words as `description` when they gave any; omit it to get a random one.
3. Never pass `imageUrl` for this skill. There is no subject photo, and the
   tool ignores it.
4. Report the result briefly without repeating the URL.

## Following up

Invite a twist on the same character — a different palette, a new outfit,
a change of mood — or point out that attaching a real photo unlocks the
likeness-preserving skills.
