# Mood caption word guide

The generateDoodle tool auto-selects six words at random from the pool
below (`VIRAL_MOOD_WORDS` in `src/lib/doodle-constants.ts`) every time this
skill runs, each paired with a matching pose so the tool doesn't have to
invent one. This reference exists so you can talk about the skill
accurately — which words exist, and what the six-panel result will look
like — even though you don't pick the words yourself.

## The word pool

| Word          | Matching pose                                                         |
| ------------- | ---------------------------------------------------------------------- |
| Miss You      | Hugging a small hand-drawn heart, soft wistful smile                   |
| Enough        | Palm raised outward, calm and steady                                   |
| Healing       | Eyes closed, hand over the heart, peaceful                             |
| Overthinking  | Hand at the temple, a small spiral swirling above the head             |
| Lonely        | Knees hugged to the chest, a little distance in the eyes               |
| Lost          | Looking off to one side, shoulders slightly slumped                    |
| Tired         | Half-closed eyes, holding a small doodle coffee cup                    |
| Hope          | Looking slightly upward, a small sparkle near the eyes                 |
| Peace         | Soft closed-eye smile, relaxed shoulders                               |
| Sorry         | Hands clasped together, gentle apologetic half-smile                   |
| Goodbye       | One hand raised in a small wave, bittersweet expression                |
| Wait          | Palm raised, glancing at a small doodle wristwatch                     |
| Maybe         | Head tilted, eyebrow raised, small shrug                               |
| Almost        | Thumb and finger pinched close together                                |
| Still         | Standing calm, hands folded, steady gaze                               |
| Again         | Sleeves rolled up, determined half-smile                               |
| Never         | Arms crossed, firm expression                                          |
| Why?          | Palms open and raised, puzzled, small question marks nearby            |

This list is intentionally short and will grow — treat it as a living pool,
not a fixed set tied to any one release.

## What you can and can't influence

- You **cannot** hand-pick specific words for a run today — the tool always
  randomizes six from the pool. If a user asks for a particular word (e.g.
  "make one say Miss You"), be upfront that today's version picks a random
  six rather than exact words, and offer to run it again for a fresh set.
- You **can** pass `description` through as general style guidance (it is
  otherwise unused by this skill), but it will not force specific words.

## Caption style

Every caption is drawn as bold, slightly uneven hand-lettering that matches
the illustration's own linework — never a clean digital font, and never
placed so it overlaps the character's face.
