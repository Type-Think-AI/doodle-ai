/* Faceless Portrait — prompt builder
 *
 * Market evidence: PunoPrints (Etsy) 113.6k sales, 28.9k reviews at 4.8★,
 * top-selling faceless-portrait shop ($3-8/file). The biggest PAID cartoon-
 * portrait market is "hide the face" — a different customer from our other
 * skills, which all draw the face. Buyer motivation is privacy-driven:
 * "I don't show my kids faces online so puno has done a few of these for me
 * now." — Adriana Newby (verified review).
 *
 * Core craft challenge: the portrait must be unmistakably THAT person with
 * zero facial features drawn. Identity is carried entirely by silhouette,
 * hair, posture, outfit, and accessories. The prompt must be extremely
 * explicit that the blank face is a deliberate style choice — models default
 * to sneaking in minimal features or producing horror-artifact smeared faces.
 */

/**
 * Builds the generation prompt for a faceless portrait.
 *
 * Called by generate-doodle.ts when skill === "faceless". The prompt is
 * deterministic (no randomization pools) because the subject's photo
 * provides all the variation — every output is already unique to the person.
 */
export function buildFacelessPortraitPrompt(): string {
  return `Transform the uploaded photo into a minimal, editorial faceless portrait illustration. The subject must be immediately recognizable as the SPECIFIC person in the photo — but with ZERO facial features drawn.

IDENTITY CUES TO PRESERVE (these carry all recognition):
- Exact hairstyle silhouette, texture, volume, and precise hair colour from the photo
- Head tilt and posture exactly as photographed — do not neutralize or straighten
- Body proportions, shoulder width, build, and stance
- Outfit: exact garment type, precise colours, cut, layers, neckline, sleeve length, and any distinctive details (patterns simplified into flat colour blocks)
- Accessories: glasses drawn as a frame shape sitting on the blank face, earrings, necklaces, watches, rings, hats, headbands, scarves
- Skin tone accurately matched on all visible non-face areas (neck, ears, hands, arms)
- If multiple subjects: preserve exact relative heights, who stands where, physical contact (hand-holding, arm around shoulder, child being carried)

THE FACE — DELIBERATE BLANK:
The entire front of the head where facial features would normally appear is a single clean, calm, flat shape filled with the subject's skin tone. This is an intentional editorial style choice, NOT damage or censorship.

ABSOLUTELY FORBIDDEN (the model must not produce any of these):
- Any drawn facial features: no eyes, no eyebrows, no nose, no mouth, no eyelashes, no freckles on the face
- Any blurred, smeared, smudged, or airbrushed face area
- Any pixelation, mosaic, or digital noise on the face
- Any black bar, white bar, or censorship strip
- Any mask, bandage, sticker, emoji, hand, or object covering the face
- Any shadow, depression, or contour suggesting absent features
- Any suggestion of a missing, damaged, erased, or horror-adjacent face
- Any minimal or simplified facial features (not even dots for eyes)

STYLE:
- Minimal, editorial, gallery-wall aesthetic
- Flat muted colour blocks — no gradients, no rendered lighting, no 3D shading
- Clean, confident, bold linework — few strokes, no sketchy hesitant lines
- Generous negative space — the composition breathes
- Warm neutral background: a single flat tone (soft cream, warm stone, blush, or sage)
- Desaturated palette overall; the subject's actual outfit colours are the most saturated elements
- Quieter and more restrained than a cartoon — something a parent would frame and hang on a wall

OUTPUT CONSTRAINTS:
- Square 1:1 aspect ratio
- Single illustration, not a grid or collage
- No text, no captions, no watermarks, no logos
- No photorealism, no photographic texture, no realistic lighting
- No background props or scenery unless the user specifically requested a setting`;
}
