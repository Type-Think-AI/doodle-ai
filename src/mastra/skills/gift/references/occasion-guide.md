# Gift occasion guide

The generateDoodle tool inspects the `description` you pass along (see
`pickGiftOccasion` in `src/lib/doodle-constants.ts`) for one of the keyword
groups below, and picks the matching embellishments and card message. If
nothing matches, it falls back to a warm, occasion-neutral default. This
reference exists so you know what will actually happen before you call the
tool — pick your wording (or the user's) to land on the right occasion on
purpose rather than by accident.

## Recognized occasions

| If the description mentions...                | Occasion    | Embellishments                                   | Card message      |
| ----------------------------------------------- | ----------- | ------------------------------------------------- | ------------------ |
| "birthday", "bday"                              | Birthday    | Balloons, a confetti burst, a lit candle           | Happy Birthday      |
| "thank"                                          | Thank You   | Small flowers, looping ribbon swirls               | Thank You           |
| "congrat"                                        | Congrats    | Stars, ribbon streamers, a party popper            | Congrats!           |
| "get well", "feel better", "sorry you"          | Get Well    | Soft pastel flowers, a small heart                 | Get Well Soon       |
| "love", "anniversary", "valentine"              | Love        | Small hearts, soft swirl accents                   | With Love           |
| *(none of the above)*                            | Thinking of You (default) | Warm hearts, dotted trails, gentle sparkles | Thinking of You     |

## How to use this

1. When the user names an occasion directly ("make a birthday card"), pass
   their own wording through as `description` — the keyword match is
   case-insensitive and just needs the word to appear anywhere in the text.
2. When the user gives no occasion at all, you can still call the skill —
   it correctly falls back to the warm neutral "Thinking of You" version.
   Mention that default in your reply so it doesn't read as a mistake.
3. The card message is fixed per occasion (see table) — there is currently
   no way to set fully custom card text. If a user asks for specific
   wording, be upfront that today's version uses the standard message for
   the detected occasion.
4. Only one occasion is detected per run, from the first keyword match
   found. If a message could plausibly match two occasions, the tool will
   pick whichever is listed first in `doodle-constants.ts` — don't guess
   differently in conversation than what will actually render.
