---
name: mood-captions
description: 'Use when the user wants shareable doodle reaction images or a 3x2 collage of illustrated moods with short hand-lettered captions such as "Healing", "Enough", or "Miss You".'
license: MIT
user-invocable: true
metadata:
  id: mood-captions
  displayName: Mood Captions
  tagline: Shareable doodle moods with hand-lettered captions
  desc: 'Turns a photo into a 3x2 doodle mood collage with one readable hand-lettered caption in each panel.'
  longDesc: 'Creates a wide six-panel doodle collage for sharing as a reaction image or status update. Each panel pairs a mood-matched pose with a short hand-lettered caption such as Miss You, Healing, Hope, or Enough.'
  category: freeform
  tags: [mood, captions, shareable]
  runnable: true
  requiresPhoto: true
  aspectRatio: '3:2'
  sampleIndex: 0
  order: 7
---

# Mood Captions

Turn one uploaded photo into a wide 3x2 collage of illustrated moods, with a
short hand-lettered caption inside each panel.

## When this is the right skill

Pick this skill when the user asks for mood cards, reaction images, status
updates, emotional captions, or a shareable collage of feelings. The user can
suggest words or moods in their message; the generation tool selects a
balanced set of six captions when no fixed set is requested.

## What to draw

Keep the same recognizable illustrated character across all six panels.
Vary the pose and expression to match each mood, and make each caption large,
legible, and integrated into the hand-drawn doodle style. The output is one
landscape image with exactly six panels in a 3x2 grid.

## How to run it

1. Confirm a photo is attached. If none is available, ask the user to attach one.
2. Call `generateDoodle` with `skill: "mood-captions"` and the uploaded photo as `imageUrl`.
3. Pass `refImageUrl` when the message includes a separate style reference.
4. Report the result briefly; the app renders the image itself.

## Following up

Offer a different caption set, a close-up collage, or a full-body action collage.
