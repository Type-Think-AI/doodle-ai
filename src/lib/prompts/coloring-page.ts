/**
 * Coloring Page — prompt builder for turning an uploaded photo into clean,
 * uncoloured line art that is printed and coloured in by hand.
 *
 * This is the deliberate opposite of Crayon Self: where that skill is
 * charmingly bad and fully coloured, this one is confident, clean, and
 * carries NO colour at all. The output is a black-on-white outline drawing —
 * a real colouring-book page of the person or pet in the photo, with every
 * region left open so a child (or adult) can fill it in.
 */

export function buildColoringPagePrompt(input: { themeHint: string; description?: string }): string {
  const personalNote = input.description
    ? ` The user mentioned: "${input.description}" — if it names a feature, prop, outfit, or setting, add it as simple outlined shapes ready to colour.`
    : "";

  return `Transform the uploaded photo into a clean black-and-white COLOURING PAGE — bold uncoloured line art on plain white paper, made to be printed and coloured in by hand. The finished image is an outline drawing only: crisp black lines, nothing filled in.

WHAT TO KEEP (recognisability anchors):
- The subject's pose, silhouette, and overall proportions from the photo — it must still read clearly as the same person or pet
- Hairstyle shape, glasses, facial hair, and one or two signature features, drawn as clean outlines
- Distinctive clothing or accessories, reduced to their essential outlined shapes

WHAT TO CHANGE (turn the photo into printable line art):
- Redraw everything as bold, confident, fully CLOSED outlines — every shape completely bounded so colour can't leak out when someone fills it
- Even, consistent line weight, like a printed colouring book; slightly thicker on the outer silhouette, finer for interior detail
- Leave generous white space inside every shape — no fill of any kind, the whole interior stays paper-white
- Simplify busy areas into a small number of large, clearly separated regions rather than many tiny ones
- Turn shadows and shading into a few optional outline contour lines, never into tone
- Plain, empty white background — no scene, no border pattern, no framing unless the theme calls for one simple outlined prop

MEDIUM AND FINISH:
- Pure black ink line on white; the drawing looks like a page torn from a children's colouring book
- Lines are smooth and deliberate, not sketchy or wobbly — this is the neat, confident opposite of a scribble
- Every enclosed area is empty and colourable; the image reads as "ready to be coloured in", not "already coloured"

HARD NEGATIVES — DO NOT produce any of these:
- No colour of any kind, no tinting, no coloured lines — black outline on white only
- No grey fill, no solid black fill areas, no silhouettes filled in
- No shading, no crosshatching, no stippling, no gradients, no soft tone
- No photorealism, no photographic texture, no realistic lighting or reflections
- No 3D rendering, no digital painting, no watercolour, no marker fills
- No open or broken outlines that would let colour spill between regions
- No busy background, no textured paper grain, no drop shadows
- No watermark, no logo, no signature, no lettering or captions of any kind

Apply this visual flavour to the line work: ${input.themeHint}.${personalNote}

The final image must read unmistakably as a printable colouring page — bold clean outlines, all-white interior, ready for someone to pick up crayons and colour it in.`;
}
