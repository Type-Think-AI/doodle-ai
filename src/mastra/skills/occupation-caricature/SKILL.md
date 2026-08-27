---
name: occupation-caricature
description: 'Use when the user wants a caricature showing their job or profession — "draw me as a surgeon", "pilot caricature", "teacher cartoon", "me as a chef", "occupation portrait", "professional caricature", "me in my work uniform", "draw me doing my job", "nurse cartoon", "engineer doodle". Requires a photo of the person. For a plain avatar without occupation theme use doodle-avatar instead.'
license: MIT
user-invocable: true
metadata:
  id: occupation
  displayName: Occupation Caricature
  tagline: Turn a photo into a friendly caricature in your profession's setting
  desc: 'Transforms a portrait photo into a warm, flattering caricature dressed in profession-specific attire with workplace props and setting.'
  longDesc: 'Takes a portrait photo and creates a friendly affectionate caricature in naive marker-and-ink doodle style. Gently exaggerates one or two signature features (hair volume, smile, glasses) while keeping the person clearly recognisable and always flattering — never mocking. Dresses the subject in correct profession attire with recognisable tools and a simplified workplace background. Supports any named occupation: surgeon, pilot, teacher, chef, nurse, engineer, firefighter, artist, lawyer, and more.'
  category: avatars
  tags: [caricature, occupation, profession]
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'
  sampleIndex: 1
  order: 20
---

# Occupation Caricature

Turn a portrait photo into a friendly caricature in the user's profession.

## When this is the right skill

Pick this skill when the user wants a **caricature tied to their job** —
"draw me as a surgeon", "pilot cartoon of me", "me as a chef", "teacher
caricature". The user supplies a photo of themselves and names (or implies)
an occupation.

Choose a different skill instead when the user asks for:

- a plain avatar with no occupation theme → `doodle-avatar`
- two people together → `couple-doodle`
- a family group → `family-portrait`
- a pet portrait → `pet-portrait`
- an expression sheet → `expression-sheet`

## What to draw

A friendly, affectionate caricature — warm and playful, NEVER mocking.

**Staying flattering is the hard requirement.** Only gently exaggerate one
or two signature visual features (hair volume, smile width, glasses size).
Never distort body size, ethnic features, or anything that could feel
unkind. The subject must remain immediately recognisable.

Preserve from the source photo:
- hairstyle, hair colour, and length
- face shape, skin tone, distinguishing marks
- glasses, facial hair, piercings, accessories
- eye colour and general expression mood

Add from the stated occupation:
- correct profession-specific attire (lab coat, flight suit, apron, etc.)
- 2–3 recognisable tools or props for that job
- a simplified workplace setting as background

If no occupation is stated, fall back to a neutral desk/office scene — do
NOT guess a profession.

## How to run it

1. Confirm a photo is attached with a single person clearly visible.
2. The agent passes the user's stated profession as `description`.
3. Call `generateDoodle` with `skill: "occupation"`, the uploaded photo as
   `imageUrl`, and the profession text as `description`.
4. Pass `refImageUrl` when the message includes a separate style reference.
5. Report the result briefly; the app renders the image itself.

The skill returns ONE image and costs 1 credit.

## Following up

After a successful generation, offer one next step — a different
occupation, a different theme style, or pairing it with a greeting card
(gift skill) for a retirement/promotion present.
