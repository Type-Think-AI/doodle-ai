---
name: doodle-avatar
description: 'Use when the user wants a single hand-drawn doodle avatar from one photo, or simply says "doodle me" / "make me a doodle" with no other detail. This is the default choice when the request is a plain portrait and nothing else fits.'
license: MIT
user-invocable: true
metadata:
  id: normal
  displayName: Doodle Avatar
  tagline: One hand-drawn doodle avatar from your photo
  desc: 'Turns a portrait into a single naive doodle fashion-chibi avatar — bold outlines, flat cheerful color, clearly illustrated.'
  longDesc: 'Preserves your recognizable hairstyle, face shape, expression, skin tone, and accessories, then redraws them in cute naive marker-and-ink cartoon style: bold clean outlines, simplified features, flat cheerful colors, and a clean warm-white background. No photorealism.'
  category: avatars
  tags: [portrait, avatar, marker]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png"
  order: 0
---

# Doodle Avatar

Turn one uploaded photo into a single naive doodle fashion-chibi avatar.

## When this is the right skill

Pick this skill when the user wants **one** illustrated portrait of the
person in their photo. It is the fallback for vague requests such as
"doodle me" or "turn this into a cartoon".

Choose a different skill instead when the user asks for:

- multiple panels, expressions, or a grid → `doodle-collage`
- head-to-toe or action poses → `full-body-collage`
- artwork with no photo at all → `surprise-me`

## What to draw

Read the photo and keep the subject recognizable: hairstyle and hair color,
face shape, expression, skin tone, glasses, and any distinctive accessories.
Then redraw all of it as illustration — never a filtered photograph.

House style (see `references/style-guide.md` for the full spec):

- bold, clean, confident outlines
- simplified facial features, no rendered detail
- flat cheerful colors with minimal shading
- playful, slightly exaggerated proportions
- clean white or warm-white background

## How to run it

1. Confirm a photo is attached. If none is, ask the user to attach one —
   do not call the tool without a photo. If they would rather not upload
   anything, offer `surprise-me` instead.
2. Call `generateDoodle` with `skill: "normal"` and the uploaded photo as
   `imageUrl`.
3. If the user also attached a style reference (their message contains a
   line like `Reference image: <url>`), pass it as `refImageUrl`.
4. Report the result briefly. The app displays the image itself, so never
   paste the URL back into the conversation.

## Following up

After a successful generation, offer one concrete next step — a collage of
several expressions, full-body action poses, or a refinement such as
thicker outlines or a warmer paper tone.
