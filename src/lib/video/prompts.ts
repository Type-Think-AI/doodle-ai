/* Clip prompts, one builder per video skill.
 *
 * Same builder shape as src/lib/prompts/*.ts so the two families read alike,
 * and registered in an object keyed by VIDEO_SKILL_IDS so a skill added without
 * a prompt is a tsc error rather than a silently generic clip.
 *
 * What these prompts have to fight is the model's default instinct, which is
 * photorealism and cinematic camera work. Every builder therefore states the
 * medium (2D hand-drawn animation, visible marker line), names the camera move
 * explicitly (a request with no camera direction gets a slow dolly the model
 * chose), and forbids the three failure modes that ruin a doodle clip:
 * re-rendering the character as a 3D model, morphing the face between frames,
 * and burning captions into the picture.
 *
 * Audio is not optional on H3 Max — it always renders a track — so each prompt
 * describes the sound it wants instead of leaving the model to invent a
 * soundscape that fights the drawing.
 */
import type { VideoSkillId } from "./skills";

export interface VideoPromptInput {
  /** Palette/mood hint from the selected theme (src/lib/style-choice.ts). */
  themeHint: string;
  /** Line/rendering hint from the same theme. */
  styleHint: string;
  /** Whatever the user asked for in prose, if anything. */
  description?: string;
  /**
   * Art-family style directive from the selected family chip
   * (src/lib/art-families.ts -> resolveFamilyHint(familyId, "video")). Craft
   * vocabulary only, never a franchise noun. Optional and defaults to none: an
   * absent or empty hint is the doodle look, so a caller that does not pass it
   * (and the no-selection path) produces the exact clip prompt as before. When
   * present it is woven into houseRules alongside the theme's style/palette
   * hints so ONE family chip changes both a still and its animation.
   */
  familyHint?: string;
}

export type VideoPromptBuilder = (input: VideoPromptInput) => string;

/** Shared tail: the things that must be true of every doodle clip. */
function houseRules(themeHint: string, styleHint: string, familyHint?: string): string {
  const family = familyHint?.trim();
  return [
    `Look: 2D hand-drawn animation. Keep the visible marker or ink line, the flat cheerful fills and the simplified features of the source drawing in every frame. ${styleHint}`,
    // The art family narrows the look before palette/mood; empty by default, so
    // the doodle family adds nothing and the prompt is unchanged from before.
    ...(family ? [`Art family: ${family}`] : []),
    themeHint,
    "Hold the character's identity steady: same hairstyle, same face shape, same colours, same accessories from first frame to last.",
    "Never: photorealism, 3D rendering, plastic skin, live-action footage, morphing or melting features, extra fingers, on-screen text, captions, subtitles, watermarks or logos.",
  ].join("\n\n");
}

/* ── Shared rules for the vertical genre clips ───────────────────────────────
   Two things every 9:16 fifteen-second clip needs and no 5-second square clip
   did, so they live here rather than being retyped four times. */

/* A feed crops and overlays. State the staging explicitly or the model composes
   for landscape and the subject ends up cut or hidden behind feed chrome. */
const VERTICAL_FRAME =
  "Framing: vertical 9:16 for a phone feed. Keep the character centred with headroom, stage the action UP and DOWN " +
  "the frame rather than across it, keep the background simple so the figure still reads at thumbnail size, and leave " +
  "the outer tenth of the frame free of anything important — a feed's own buttons sit there.";

/* Fifteen seconds is long enough that a single instruction produces a loop of
   one gesture. Naming three beats with rough timings is what turns the length
   into a story instead of a longer fidget. */
const THREE_BEATS =
  "Structure, about fifteen seconds in three beats: roughly 0-4s establish the character and the place, roughly " +
  "4-10s the main action at full energy, roughly 10-15s settle onto one strong final pose and HOLD it still for the " +
  "last second so the clip ends on a frame worth pausing.";

const builders: Record<VideoSkillId, VideoPromptBuilder> = {
  /* mode 'image' — the supplied doodle is frame one, so the prompt describes
     MOTION rather than a scene. Anything scene-like here fights the frame. */
  motion: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Bring this hand-drawn doodle to life without redrawing it.",
      description?.trim()
        ? `What should happen: ${description.trim()}`
        : "What should happen: the character blinks, breaks into a warm smile, and gives a small friendly wave; hair and clothing drift as if in a light breeze.",
      "Camera: almost still — a very slow push in, a few percent at most, with gentle parallax between the character and the background. No orbit, no whip pan, no rack focus.",
      "Motion quality: loose, springy, slightly imperfect timing, like a flipbook drawn by hand. Small secondary movement in hair and clothes. The background stays a calm flat wash.",
      "Sound: a soft room tone with one light playful accent on the wave — no music bed, no speech, no sound effects competing with the picture.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'reference' — the supplied doodles say who the character IS, and the
     clip is a new shot of them, so the prompt is allowed to describe a scene. */
  reel: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a short hand-drawn clip starring the character shown in the reference images. The references define who the character is — their hair, face, colours and outfit — not the composition of this shot.",
      description?.trim()
        ? `The shot: ${description.trim()}`
        : "The shot: the character walks into frame, notices the viewer, and does a happy little spin before settling into a wave.",
      "Camera: one continuous move only — a gentle hand-held drift following the character, or a slow push in. Pick one and hold it for the whole clip.",
      "Staging: full body or waist up, plenty of empty space around the character, one simple flat-colour background with at most two doodled props. Readable as a thumbnail.",
      "Sound: light, upbeat and sparse — a simple playful motif and one or two soft foley accents matched to the character's movement. No speech, no lyrics.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'image' — anime-STYLE action beat over the exact doodle frame. This is
     a STYLE instruction, never a cast one: shonen linework, speed lines and an
     impact frame, described so no proper noun (character, series, studio or
     artist) is needed or allowed. The doodle is frame one, so this is motion,
     not a new scene. */
  spark: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Bring this hand-drawn doodle to life as a short shonen-anime-style action beat, without redrawing the character. Keep it recognisably the same doodle — this frame is the starting point that powers up.",
      description?.trim()
        ? `What should happen: ${description.trim()}`
        : "What should happen: the character sets a determined expression, clenches a fist, and powers up — a burst of glowing energy aura flares around them, hair and clothing lift in the updraft, then they settle back with a confident grin.",
      "Anime-style motion cues, drawn by hand: bold radial speed lines streaking outward from the character, one held impact frame where the action peaks (a brief high-contrast flash with a starburst behind them), then a soft settle. Small springy overshoot on the pose, like keyframes inked on paper.",
      "Camera: almost still — a slight punch-in on the impact beat only, then hold. No orbit, no whip pan, no rack focus; let the drawn effects carry the energy, not the lens.",
      "Keep it as flat 2D cel animation: the aura, speed lines and flash are hand-drawn line-and-fill layers over the doodle, not volumetric light or 3D particles.",
      "Sound: one short rising energy 'whoosh' into a soft bright chime on the impact frame, then quiet room tone. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'reference' — anime-STYLE transformation reel starring the doodle
     character. STYLE only: magical-girl palette, ribbon sweeps, cel-shaded
     sparkle, a hero landing — with NO proper noun for any character, series,
     studio or artist. The references fix the likeness, the shot is new, so a
     scene is allowed. */
  starcast: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a short magical-girl-style transformation clip starring the character shown in the reference images. The references define who the character is — their hair, face, colours and outfit — not the composition of this shot.",
      description?.trim()
        ? `The shot: ${description.trim()}`
        : "The shot: the character does a graceful twirl as swirling ribbons and a sweep of sparkles wrap around them, then lands in a confident hero pose facing the viewer with a bright smile.",
      "Anime-style flourishes, all hand-drawn: looping ribbon trails, a rising shower of star and sparkle shapes, a soft radial glow behind the character on the final pose, gentle hair and fabric motion carried through the spin. Springy, slightly imperfect timing like keyframes drawn on paper.",
      "Palette: a bright magical-girl mood — soft rose, lilac and gold accents over the character's own colours — layered as flat cel tints, never as realistic lighting.",
      "Camera: one continuous move only — a slow arc that follows the twirl and settles square on the hero pose. Pick that one move and hold it; no whip pan, no second camera move.",
      "Staging: full body or waist up, generous empty space around the character, one simple flat-colour background so the ribbons and sparkles read clearly. Readable as a thumbnail.",
      "Keep it flat 2D cel animation: the sparkles, ribbons and glow are drawn line-and-fill layers, not 3D particles or volumetric light.",
      "Sound: light and sparse — a soft shimmering chime as the sparkles rise and one gentle bell on the final pose. No speech, no lyrics.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'image' — anime slice-of-life STYLE over the exact doodle frame. This
     is the "near-still frame plus a moving light layer" trick real animators
     use for calm scenes: the drawing barely moves, held on a two-to-three-frame
     hold, while ONE layer of light drifts across it. STYLE only, no proper
     noun. The doodle is frame one, so this is motion, not a new scene. */
  daydream: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Bring this hand-drawn doodle to life as a calm, everyday slice-of-life moment, without redrawing it. Keep it recognisably the same doodle — this frame is the starting point and it barely changes.",
      description?.trim()
        ? `The mood: ${description.trim()}`
        : "The mood: the character is quietly at ease — a slow blink, the faint start of a soft smile, one gentle breath. Nothing dramatic happens; it simply feels alive.",
      "Anime slice-of-life technique, drawn by hand: hold the character almost perfectly still on a two-to-three-frame hold, like a lingering quiet shot, and let ONE moving layer of light do the work — a warm glow drifting slowly across the face, a thin bright rim light tracing the edges, or a soft shift from a cool tone into golden. Add only barely-there secondary drift in hair, a scarf or an earring.",
      "Keep it flat 2D cel animation: hard-edged cel shadow shapes and flat fills, the drifting light layered as a soft cel tint rather than volumetric or realistic lighting.",
      "Camera: effectively still — no move at all, or an almost imperceptible drift of a percent or two. No push-in worth noticing, no orbit, no rack focus. The stillness is the point.",
      "Sound: a hushed, warm room tone with one tiny ambient accent — a distant soft chime or a breath of wind — no music bed, no speech, no busy effects.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'reference' — anime action STYLE starring the doodle character. STYLE
     only: speed lines, smear frames, a sakuga burst, a held impact frame — none
     owned by anyone, no proper noun. The references fix the likeness, the shot
     is new and kinetic, so a scene is allowed. */
  dash: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a short, high-energy hand-drawn action shot starring the character shown in the reference images. The references define who the character is — their hair, face, colours and outfit — not the composition of this shot.",
      description?.trim()
        ? `The shot: ${description.trim()}`
        : "The shot: the character bursts into a fast run across frame, then leaps and lands hard in a strong, confident pose facing the viewer.",
      "Anime action technique, all hand-drawn: bold radial speed lines streaking along the motion, stretched smear frames through the fastest part of the move (a brief distorted in-between that reads as pure speed), then ONE held high-contrast impact frame at the peak — a split-second flash with a starburst behind the character — before a springy settle onto the final pose. Timing like keyframes inked on paper, snappy with a little overshoot.",
      "Keep it flat 2D cel animation: cel-shaded flat colour with hard-edged shadow shapes and a thin bright rim light so the figure stays readable against the speed. The speed lines, smears and impact flash are drawn line-and-fill layers, not 3D motion blur or particles.",
      "Camera: one committed move only — a fast follow that tracks the run, or a quick punch-in into the impact beat. Pick one and hold it; no whip pan plus orbit.",
      "Staging: full body or waist up, generous empty space, one simple flat-colour background so the speed lines read clearly. Readable as a thumbnail.",
      "Sound: punchy and sparse — a rising whoosh through the dash, one sharp bright hit on the impact frame, then quick quiet. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  /* mode 'reference' — anime opening/title-sequence STYLE starring the doodle
     character. STYLE only: a kinetic montage feel, a colour-script mood, a
     key-visual hero pose — no proper noun, and never a real show's OP. The
     references fix the likeness, the montage is new, so a scene is allowed. */
  intro: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a short title-sequence-style hand-drawn reel starring the character shown in the reference images, built like the opening titles of an animated series. The references define who the character is — their hair, face, colours and outfit — not the composition of this shot.",
      description?.trim()
        ? `The feel and ending pose: ${description.trim()}`
        : "The feel and ending pose: a couple of quick, punchy beats — a confident expression, a small turn or gesture — then a clear settle onto one bold hero pose squared up to the viewer.",
      "Title-sequence technique, all hand-drawn: two or three quick kinetic beats with snappy timing, then a decisive settle onto a strong key-visual pose — the poster frame — that lands right on the beat of the sound. Keep the cuts legible; this is a tight montage feel, not a blur of unrelated shots.",
      "Colour-script mood: carry one deliberate palette through the whole reel — a golden-hour rim light, a twilight gradient behind the character, or a single bold accent colour — layered as flat cel tints over the character's own colours, never as realistic lighting.",
      "Keep it flat 2D cel animation: cel-shaded flat colour with hard-edged shadow shapes on every beat, so each cut reads clearly as hand-drawn.",
      "Camera: energetic but disciplined — a quick push or a small tracking move per beat that settles square and still on the final hero pose. No chaotic whip-pans stacked on orbits.",
      "Staging: full body or waist up, generous empty space, simple flat backgrounds so the character stays the subject in every cut. Readable as a thumbnail on the final pose.",
      "Sound: upbeat and sparse — a light driving motif that builds across the cuts and lands one clean accent as the hero pose settles. No speech, no lyrics.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),
  /* ── Vertical genre clips (9:16, 15s, reference mode) ────────────────────
     Each carries its genre's CRAFT SIGNATURE — linework, palette, motion and
     shot grammar from docs/anime-style-research.md — and never a series,
     studio or character name. The look people recognise comes from the drawing
     technique, which is not anyone's trademark. */

  voyage: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a vertical hand-drawn adventure clip starring the character in the reference images. The references define who they are — hair, face, colours, outfit — not the composition.",
      description?.trim()
        ? `What happens: ${description.trim()}`
        : "What happens: the character bursts across a ship's deck under open sky, swings out on a rope over the water, and lands hard at the rail in a grinning victory stance.",
      "Craft: bold cel-shaded outlines with exaggerated rubbery elastic limbs, expressive comedic faces, and a bright tropical-island palette of warm sea-and-sky blues and sun-warm sand. Heavy hand-drawn motion lines with elastic stretch-and-snap on the fastest part of the swing.",
      VERTICAL_FRAME,
      THREE_BEATS,
      "Camera: one committed move only — a rising tilt that follows the swing, settling square on the landing. No orbit stacked on a whip pan.",
      "Sound: sea wind and rigging creak, one rising whoosh through the swing, a solid thud on the landing, then quick quiet. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  stealth: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a vertical hand-drawn action clip starring the character in the reference images. The references define who they are — hair, face, colours, outfit — not the composition.",
      description?.trim()
        ? `What happens: ${description.trim()}`
        : "What happens: the character crouches on a village rooftop at dusk, brings both hands together to focus, then leaps upward as a glowing power effect bursts around them and lands ready in a low stance.",
      "Craft: detailed action-anime linework, athletic figure in wrapped stealth gear, a muted earth-tone and sandy palette with exactly ONE saturated glowing accent for the technique, dense crosshatch shading, background speed lines and drifting smoke. The hands-together focusing gesture comes BEFORE the glow, never during it.",
      VERTICAL_FRAME,
      THREE_BEATS,
      "Camera: still on the crouch, a fast upward follow on the leap, still again on the landing.",
      "Sound: quiet evening ambience, a low charging hum under the focus, one sharp release on the burst, then stillness. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  creature: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a vertical hand-drawn creature-companion clip starring the character in the reference images. The references define the person — hair, face, colours, outfit — not the composition. The creature is ORIGINAL and invented for this clip.",
      description?.trim()
        ? `What happens: ${description.trim()}`
        : "What happens: the character calls out and throws an arm forward, an original round little creature appears in a puff of sparkle, bounces once, and the two of them land side by side facing the viewer.",
      "Craft: clean rounded friendly outlines, flat cel shading, a bright cheerful palette. The creature has a strong silhouette that would still read at coin size, ONE clear signature feature, and a limited high-identity colour set of its own so it looks like a designed character rather than a blob. Bouncy squash-and-stretch on its landing.",
      VERTICAL_FRAME,
      THREE_BEATS,
      "Camera: a small push in on the call, then hold square and still for the two-shot at the end.",
      "Sound: bright outdoor ambience, a light chime as the creature appears, one soft bouncy note on its landing. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),

  gadget: ({ themeHint, styleHint, description, familyHint }) =>
    [
      "Make a vertical hand-drawn comedy clip starring the character in the reference images. The references define who they are — hair, face, colours, outfit — not the composition.",
      description?.trim()
        ? `What happens: ${description.trim()}`
        : "What happens: in an ordinary suburban room the character proudly holds up an invented little gadget, it misfires with a harmless pop and a puff of smoke, and they turn to the viewer with a wide flat-mouthed reaction.",
      "Craft: retro gag-manga styling — a thick ink outline of EVEN weight all the way round, very rounded simple shapes, flat primary-colour fills with almost no shading, oversized round eyes with dot-and-line features, and a soft broadcast-era look with faint paper grain. Comic timing: hold, misfire, then a big held reaction — the reaction is the punchline and gets the most screen time.",
      VERTICAL_FRAME,
      THREE_BEATS,
      "Camera: locked off like a TV gag shot, with one quick snap-in on the reaction. No drifting.",
      "Sound: quiet room tone, a comic pop and a small hiss of smoke, then one bright sting on the reaction. No music bed, no speech.",
      houseRules(themeHint, styleHint, familyHint),
    ].join("\n\n"),
};

export function videoPromptBuilderFor(skillId: VideoSkillId): VideoPromptBuilder {
  return builders[skillId];
}
