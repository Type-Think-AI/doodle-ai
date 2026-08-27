---
name: faceless-portrait
description: 'Use when the user wants a portrait that deliberately hides their face or their family''s faces — requests containing "faceless", "without showing faces", "no face", "hide my face", "minimal portrait", "I don''t want my kids faces online", "privacy portrait", "print for the wall", or "anonymous portrait". This skill omits ALL facial features on purpose; if the user wants their face drawn in any way (cute, cartoon, exaggerated), use doodle-avatar instead.'
license: MIT
user-invocable: true
metadata:
  id: faceless
  displayName: Faceless Portrait
  tagline: A portrait that carries identity without a face
  desc: 'Minimal editorial portrait with no facial features — identity carried entirely by silhouette, hair, posture, and outfit.'
  longDesc: 'Creates a gallery-wall-ready illustration where the subject is unmistakably recognizable through hairstyle, body shape, outfit, and accessories — with the face left as a clean intentional blank. Built for the privacy-first parent, the aesthetic minimalist, and anyone who wants a beautiful portrait without revealing faces online.'
  category: avatars
  tags: [portrait, faceless, privacy, minimal]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 4
  thumbnailUrl: "https://cdn.picxstudio.com/api/edited/image_7cc91c45-a8c1-4e74-8a55-8c5cc8b942fe.png"
  sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_2448ea08-f6d9-4096-bb0e-c1bcba04172e.png"
  order: 13
---

# Faceless Portrait

<!-- Market evidence: PunoPrints (Etsy) — 113.6k sales, 28.9k reviews at 4.8★,
     top-selling faceless-portrait shop, $3-8 per digital file. Related:
     EditingStudio 136.5k sales, BananaRoseArt 19.7k sales. Strategic insight:
     viral English X is "show my face, make it cute" but the largest PAID
     cartoon-portrait market found is "hide the face" — different customers,
     and this skill serves the one our other skills structurally cannot. -->

Turn one uploaded photo into a minimal, editorial faceless portrait — no eyes,
no nose, no mouth, just the person's unmistakable silhouette, hair, and outfit
rendered in flat muted color blocks on a warm neutral background.

## When this is the right skill

Pick this when the user explicitly wants faces hidden — whether for privacy,
aesthetics, or both. Common signals:

- "faceless portrait"
- "don't show my face / my kids' faces"
- "anonymous illustration"
- "minimal portrait for the wall"
- couple, family, or group where nobody's face should be drawn

Choose a different skill instead when:

- The user wants their face drawn (cute, cartoon, exaggerated) → **doodle-avatar**
- The user wants a multi-panel grid of expressions → **doodle-collage**
- The user wants full-body action poses with faces drawn → **full-body-collage**
- The user wants vinyl sticker cutouts with faces → **sticker-pack**
- The user wants mood captions paired with expressions → **mood-captions**
- The user wants a greeting card with a face drawn → **gift**
- The user wants a random character from scratch → **surprise-me**

## Privacy use case

The primary buying reason in this market is explicit and privacy-driven:
parents who share online but refuse to expose their children's faces, couples
who want recognizable wall art without identifiable features, and creators who
maintain visual anonymity. This is a *deliberate style choice*, not damage.

## What to draw

From the photo, preserve and emphasize:

- Hairstyle silhouette, texture, and exact hair colour
- Head tilt, posture, and body proportions
- Outfit: exact colours, cut, layers, distinctive details
- Glasses (as a shape on the head, no eyes behind them)
- Jewellery, hats, scarves, held objects
- Skin tone (on hands, neck, ears — any visible non-face area)

Omit entirely — the head's front is a **clean, flat, intentionally blank shape**:

- No eyes, no eyebrows, no nose, no mouth
- No blurred, smeared, or smudged face
- No pixelation, mosaic, or digital censorship bar
- No mask, bandage, sticker, emoji, or obstruction
- No shadow, divot, or any mark suggesting absent features
- Nothing that reads as damaged, erased, or horror

Style target: minimal, editorial, gallery-wall. Flat muted colour blocks,
clean confident linework, generous negative space, warm neutral background
(soft cream, stone, blush, or sage). Quieter and more restrained than our
other skills — something a parent would frame and hang.

Supports: single subject, couples side-by-side, families, groups, kids.

## How to run it

1. Confirm a photo is attached. If none, ask for one — this skill always
   requires a reference photo. There is no faceless version of `surprise-me`.
2. Call `generateDoodle` with `skill: "faceless"` and the uploaded photo as
   `imageUrl`.
3. If the user attached a style reference, pass it as `refImageUrl`.
4. Report the result briefly. The app displays the image itself.

## Following up

After generation, offer:

- A couple or family version if the original was a single subject
- A different warm background tone (cream, sage, blush, stone)
- Slight posture or crop adjustments
