# Two-Subject Likeness Preservation

On-demand reference for generating illustrations of two distinct people in
one image without the model blending, swapping, or flattening their
individual features.

## Why this is hard

Diffusion models treat the entire image as one latent — there is no native
concept of "person A vs person B". Without explicit constraints:

- **Face blending**: both faces drift toward an average, losing what makes
  each person recognizable.
- **Hair swapping**: curly hair ends up on the straight-haired person; a
  dark-haired subject gets the partner's highlights.
- **Sibling-ification**: skin tones, eye shapes, and bone structure
  converge so the two people look related rather than distinct.
- **Height flattening**: the model crops or rescales to fit a square,
  erasing a meaningful height difference.
- **Pose invention**: the model defaults to a generic standing pose rather
  than the actual physical relationship from the source photo.

## Per-person anchor checklist

For each person, the prompt must explicitly name and preserve:

| Anchor | What to lock | Common drift |
|--------|-------------|--------------|
| Hair colour | Exact shade per person | Averages to mid-brown |
| Hair style & length | Short/long, curly/straight, updos | Swaps between subjects |
| Face shape | Round, oval, angular, square | Converges to oval |
| Skin tone | Light/medium/dark per person | Lightens toward the lighter subject |
| Relative height | Who is taller, by how much | Equalizes heights |
| Glasses | Only on the person who wears them | Duplicated to both or removed |
| Facial hair | Beard, stubble, clean-shaven | Removed or added to wrong person |
| Piercings / accessories | Earrings, necklace, hat | Swapped or dropped |
| Left/right position | Who is on which side | Mirrored |
| Body type | Build, shoulder width | Homogenized to same build |

## Physical relationship anchoring

The couple's pose, proximity, and touch points must come from the source
photo, not from a default template:

- **Holding hands** — specify which hand of each person
- **Arm around shoulder/waist** — specify whose arm, around whom
- **Foreheads or cheeks together** — preserve direction and tilt
- **Leaning / height accommodation** — taller person bending down, shorter
  on tiptoes, etc.
- **Distance** — close embrace vs side-by-side with a gap

If the source shows a specific gesture (one person's head on the other's
shoulder, piggyback, proposal pose), name it explicitly rather than
describing it abstractly.

## Prompt discipline

1. **Describe each person separately** before describing them together.
   "Person on the left: short curly dark-brown hair, warm medium skin,
   round face, wire-frame glasses, slightly shorter. Person on the right:
   long straight blonde hair, light skin, angular jaw, taller by ~10 cm,
   small hoop earrings."

2. **Anchor left/right explicitly**: "Maintain the exact left-right
   positions as they appear in the source photo — do not mirror or swap."

3. **Name the pose from the photo**: "They are holding hands with
   interlocked fingers, the left person's right hand holding the right
   person's left hand."

4. **Hard negatives**: include explicit prohibitions against the known
   failure modes:
   - "Do NOT blend or average their facial features."
   - "Do NOT swap hair styles or hair colours between the two people."
   - "Do NOT make them look like siblings or the same person twice."
   - "Do NOT equalize their heights — preserve the visible height
     difference from the photo."
   - "Do NOT invent a pose — reproduce their body contact exactly as
     photographed."

5. **Single image, not split panels**: the output is one unified
   illustration, not a collage or side-by-side split. Both people exist
   naturally in the same scene/frame.

## Occasion embellishments (optional layer)

When an occasion is detected, add small doodle props around the couple
without obscuring either person's face or distinguishing features:

| Occasion | Embellishments |
|----------|---------------|
| Anniversary | Small hand-drawn hearts, a "years" numeral if mentioned, soft swirl accents |
| Engagement / Proposal | A small doodle ring sparkle, scattered confetti dots, tiny stars |
| Wedding | Minimal floral arch doodle framing the top, small scattered petals |
| Valentine's | Hand-drawn hearts of varying sizes, soft pink/red accent tones |
| Just-us / everyday | Minimal — a couple of small sparkles or a soft warm glow, nothing heavy |

Embellishments are drawn around the border and negative space, never on top
of the subjects' faces or bodies.

## Quality gate

A successful couple doodle passes when:

1. A viewer can match each illustrated person back to their real photo
   counterpart without guessing.
2. The two illustrated people look like distinct individuals, not
   variations of one character.
3. Their pose, proximity, and touch reproduce the source photo's
   relationship.
4. The image reads as one unified illustrated scene, not a split panel or
   collage.
