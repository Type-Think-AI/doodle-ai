/* Pet Portrait prompt builder — produces the generation prompt for skill "pet".
 *
 * Evidence that this niche has demand:
 * - @rutu609 https://x.com/rutu609/status/2063956011086442649 (dog Mini, illustrated, 116 likes)
 * - @mushrisepark https://x.com/mushrisepark/status/2092587358893875682 (798 likes, 23k views —
 *   backlash post re: auto-stickerised cat, proving platforms assume demand)
 * - Peta Sticker (peta-sticker.com, live 24 Aug 2026) — ONE pet photo → 9 LINE-stamp designs, paid
 * - @mhp_guy https://x.com/mhp_guy/status/2082151951417086408 (147 likes) — pet-portrait shop
 *   reached $1M revenue pre-AI; now considering AI transition
 * - Etsy/Fiverr both price pet as a premium add-on
 *
 * The hard problem: owners recognise their specific animal by breed silhouette,
 * coat markings, ear carriage, muzzle length, eye colour, and tail shape — NOT
 * by a generic cartoon animal. The prompt must read and preserve those features.
 */

/**
 * Build the generation prompt for a pet-portrait (pet alone OR pet with owner).
 *
 * @param withOwner - true when the photo contains a human alongside the pet.
 *   The calling code detects this from agent vision or user input.description.
 * @param styleHint - optional theme style hint (same as other skills use via THEMES[].styleHint)
 */
export function buildPetPortraitPrompt(withOwner: boolean, styleHint?: string): string {
  const themeClause = styleHint
    ? ` Apply this visual theme: ${styleHint}.`
    : "";

  if (withOwner) {
    return `Transform the uploaded photo into a single naive marker-and-ink doodle illustration showing both the pet and its owner together in one frame.

MEDIUM — this is flat hand-drawn cartoon artwork: visible marker or ink linework, bold slightly uneven outlines, flat blocks of colour with no gradients, no rendered fur, no smooth digital airbrushing. Read the photo to decide WHICH shapes and markings to draw, then draw them in simplified naive doodle style. Detail accuracy here means the correct shapes and markings — never realistic rendering.

FOR THE ANIMAL — read and preserve its breed-specific identifying features exactly as they appear in the photo: breed silhouette and body proportions, coat pattern and specific markings (patches, spots, brindle, tabby stripes, tuxedo pattern — replicate their exact placement), ear carriage (erect, floppy, folded, asymmetric, notched), muzzle length and nose colour, eye colour and shape, and tail shape. If the animal has asymmetric markings (one white paw, a half-face split, a torn ear tip), preserve the asymmetry — do not symmetrise. Do NOT substitute a generic round cartoon face regardless of the animal's actual skull shape: a long-muzzled dog stays long-muzzled, a flat-faced cat stays flat-faced.

FOR THE HUMAN — preserve their recognizable hairstyle, hair colour, face shape, expression, skin tone, clothing, and accessories, then redraw in the same illustrated doodle style as the animal.

INTERACTION — preserve the real physical relationship shown in the photo (held in arms, on lap, nose-to-nose, leaning against leg, sitting beside). Compose as a pair portrait where neither subject dominates.

STYLE — bold clean marker outlines, simplified shapes that still carry the correct breed markings, flat cheerful colours, playful slightly exaggerated proportions, clean warm-white background. Simplify the rendering, never the identifying markings. The result must read as naive hand-drawn doodle art — not a photograph, and not a polished vector or comic-book illustration.${themeClause}

HARD NEGATIVES — no anthropomorphism (the animal must NOT stand upright like a human, must NOT wear clothing unless the source photo shows it), no breed change, no generic cute-face substitution (do not round out a pointed muzzle, do not enlarge eyes beyond breed proportion, do not shrink ears), no added accessories or costumes absent from the photo, no photorealism, no photographic skin or fur texture, no rendered individual fur strands, no smooth colour gradients, no polished vector or comic-book rendering, no realistic lighting, no 3D render, no heavy realistic shading, no text, no captions, no watermark, no logo.`;
  }

  return `Transform the uploaded photo into a single naive marker-and-ink doodle illustration of the pet.

MEDIUM — this is flat hand-drawn cartoon artwork: visible marker or ink linework, bold slightly uneven outlines, flat blocks of colour with no gradients, no rendered fur, no smooth digital airbrushing. Read the photo to decide WHICH shapes and markings to draw, then draw them in simplified naive doodle style. Detail accuracy here means the correct shapes and markings — never realistic rendering.

Read and preserve the animal's breed-specific identifying features exactly as they appear in the photo: breed silhouette and body proportions (stocky vs lean, cobby vs lithe, compact-low vs large-heavy), coat pattern and specific markings (replicate exact placement of patches, spots, brindle streaks, tabby stripes, tuxedo pattern, calico splashes, pointed coloring, merle blotches, the odd-coloured sock, the white chest blaze), ear carriage (erect, floppy, folded, rose, asymmetric, notched or torn tip), muzzle length and nose leather colour, eye colour and shape (including heterochromia if present — preserve which eye is which colour), and tail shape (curled, docked, plume, whip, bottle-brush).

If the animal has asymmetric markings or features (one ear up, one white paw among dark ones, a scar, a half-face colour split), preserve the asymmetry exactly — do not symmetrise or normalise.

STYLE — bold clean marker outlines, simplified shapes that still carry the correct breed markings, flat cheerful colours, playful slightly exaggerated proportions, clean warm-white background. Simplify the rendering, never the identifying markings. The result must look like THIS specific animal drawn by hand in naive doodle style — not "a cartoon dog", and not a polished vector or comic-book illustration.${themeClause}

HARD NEGATIVES — no anthropomorphism (the animal must NOT stand upright, must NOT wear clothing unless the source photo shows it, must NOT hold objects with human-like hands), no breed change, no generic cute-face substitution (do NOT round out a pointed muzzle into a circle, do NOT enlarge eyes beyond breed proportion, do NOT shrink or reshape ears to be "cuter"), no added accessories or costumes absent from the photo, no photorealism, no photographic fur texture, no rendered individual fur strands, no smooth colour gradients, no polished vector or comic-book rendering, no realistic lighting, no 3D render, no heavy realistic shading, no text, no captions, no watermark, no logo.`;
}
