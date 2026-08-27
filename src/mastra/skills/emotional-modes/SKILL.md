---
name: emotional-modes
description: 'Use when the user wants their photo redrawn through multiple emotional moods at once — cozy, chaotic, dreamy, and moody — as a set of four distinct doodle images.'
license: MIT
user-invocable: true
metadata:
  id: moods
  displayName: Emotional Modes
  tagline: Four moods, one face — a hand-drawn emotional spectrum
  desc: 'Produces 4 separate square doodle images from one photo, each redrawn through a different emotional lens: Cozy, Chaotic, Dreamy, Moody.'
  longDesc: 'Turns a single uploaded photo into a set of four distinct hand-drawn doodle portraits. Each image preserves the person''s recognisable features but shifts the linework energy, colour palette, composition and background marks to embody a different mood — warm and snug, frenetic and clashing, airy and floating, or dark and dramatic.'
  category: packs
  tags: [mood, style, pack]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 0
  thumbnailUrl: "https://cdn.picxstudio.com/api/generated/image_298403d7-f0f6-477f-a996-ebfb09cf6f83.png"
  order: 5
---

# Emotional Modes

Turn one uploaded photo into four separate square doodle portraits — each redrawn through a different emotional lens.

## When this is the right skill

Pick this skill when the user wants a mood-driven set of images from a single photo: a cozy version, a chaotic version, a dreamy version, and a moody version. It's ideal for "draw me in different vibes", "mood board of my face", or "show me in four feelings". Do NOT pick this for a single themed doodle — use the standard avatar skill for that.

## What to draw

Each image is a standalone naive marker-and-ink doodle portrait (not a panel on a shared sheet). The person stays recognisably the same across all four — same hairstyle, face shape, skin tone, accessories. What changes per mood:

| Mood    | Linework              | Palette                    | Composition             |
| ------- | --------------------- | -------------------------- | ----------------------- |
| Cozy    | Soft, rounded, gentle | Warm ambers, cream, honey  | Close, centered, snug   |
| Chaotic | Jittery, overshooting | Clashing saturated brights | Off-center, crowded     |
| Dreamy  | Light, broken, floaty | Pale lavender, blush, gold | Airy, elevated, spacious|
| Moody   | Heavy, thick ink      | Charcoal, slate, burgundy  | Tight crop, dramatic    |

This skill deliberately ignores the user's selected visual theme — the emotional lens IS the style.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "moods"` and the uploaded photo as `imageUrl`.
3. Pass the user's free-text description (if any) as `description` — it can nudge subject matter without overriding the four moods.
4. The tool returns FOUR images (one per mood: Cozy, Chaotic, Dreamy, Moody). This costs 4 credits — one per image.
5. Present all four together, labelling each by mood name.

## Following up

Offer to regenerate a single mood if one didn't land, suggest sending a favourite as a sticker, or offer the gift skill to turn the best mood into a greeting card.
