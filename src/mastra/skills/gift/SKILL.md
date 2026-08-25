---
name: gift
description: 'Use when the user wants a greeting card, birthday doodle, thank-you image, congratulations message, or another gift-style illustration from a photo.'
license: MIT
user-invocable: true
metadata:
  id: gift
  displayName: Gift Doodle
  tagline: A hand-drawn greeting or gift image from your photo
  desc: 'Turns a photo into a playful illustrated greeting card with occasion-matched doodle details.'
  longDesc: 'Creates a square hand-drawn doodle greeting image from a photo. The prompt detects occasions such as birthdays, thank-you messages, congratulations, celebrations, or general gifts and adapts the embellishments and message accordingly.'
  category: freeform
  tags: [gift, greeting, occasion]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 3
  thumbnailUrl: 'https://cdn.picxstudio.com/api/generated/image_fbca2637-7236-4565-a6c7-e909110cf472.png'
  order: 8
---

# Gift Doodle

Turn one uploaded photo into a playful square doodle greeting or gift image.

## When this is the right skill

Pick this skill for birthday cards, thank-you notes, congratulations,
celebrations, invitations, gifts, or any image intended to send to another
person. Use the user's wording to infer the occasion and preserve any
specific message they requested.

## What to draw

Keep the person recognizable as a hand-drawn doodle character. Add occasion-
matched props, colors, border decorations, and a short readable greeting.
Keep the composition clean and friendly so it works as a digital card.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "gift"`, the uploaded photo as `imageUrl`, and the user's occasion or message as `description`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

## Following up

Offer a different occasion, a simpler avatar, or a six-panel collage.
