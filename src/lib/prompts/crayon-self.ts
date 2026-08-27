/**
 * Crayon Self — prompt builder for the "deliberately bad, ugly-cute" skill.
 *
 * Evidence:
 * - @yr7191 https://x.com/yr7191/status/2052686034803265672
 *   834 likes, 149 reposts, 203 quotes, 275k views, 761 bookmarks
 * - @umesh_ai https://x.com/umesh_ai/status/2027699861827838249
 *   462 likes, 28k views — kid-crayon converter
 * - @AiwithLariab https://x.com/AiwithLariab/status/2056574566865211793
 *   219 likes — "4-year-old crayon drawing"
 * - Forbes 6 May 2026: https://www.forbes.com/sites/lesliekatz/2026/05/06/chatgpt-trend-has-users-requesting-clumsy-scribbly-and-pathetic-ai-images/
 *
 * The hard constraint: charming-bad (child drew it with love) — never
 * broken-bad (AI glitch, horror, uncanny valley).
 */

export function buildCrayonPrompt(input: { themeHint: string; description?: string }): string {
  const personalNote = input.description
    ? ` The user mentioned: "${input.description}" — if it names a feature, setting, or prop, incorporate it in the child's drawing.`
    : "";

  return `Transform the uploaded photo into a drawing that looks like a genuine 4-year-old child drew it with waxy crayons on white notebook paper. This is deliberately bad art made with love — ugly-cute, not broken.

WHAT TO KEEP (recognisability anchors):
- The subject's hair colour and rough shape (drawn as a scribbled mass on top of a big circle head)
- Glasses if worn (two wonky hand-drawn circles)
- One or two signature features (beard, freckles, a hat, a distinctive shirt colour)

WHAT TO DISTORT (childlike incompetence):
- Huge circle head taking up half the drawing, tiny stick-figure body below
- Wobbly uneven crayon outlines that wander and don't close properly
- Colour scribbled enthusiastically outside the lines
- Lopsided open smile, maybe one eye bigger than the other
- Stick arms coming from weird places, mitten hands or wrong finger count
- Simple flat shoes or triangle feet
- Optional: the person's name written in wobbly shaky child handwriting underneath, slightly misspelled

MEDIUM AND TEXTURE:
- Waxy crayon strokes with visible pressure variation (darker where a kid pressed hard)
- White or faintly lined notebook paper background with visible paper grain
- A few stray crayon scribble marks where the kid changed their mind
- Maybe a wobbly sun, heart, or star drawn in the corner

HARD NEGATIVES — DO NOT produce any of these:
- No polished illustration, no clean vector art, no professional linework
- No photorealism, no photographic texture, no realistic lighting or shadows
- No 3D rendering, no digital watercolour, no marker-style doodle art
- No melted/dripping/dissolving anatomy, no body horror, no extra limbs
- No uncanny valley expressions, no hollow eyes, no horror aesthetic
- No AI text artifacts, no garbled Unicode, no unreadable glyphs
- No Photoshop filter look, no "crayon brush overlay on a photo"
- No glitch art, no distortion effects, no smeared digital artifacts
- No realistic background or environment — just the paper
- No watermark, no logo, no caption (child handwriting name is OK)

Apply this visual flavour: ${input.themeHint}.${personalNote}

The final image must read unmistakably as a real child's crayon drawing — the kind a parent sticks on the fridge.`;
}
