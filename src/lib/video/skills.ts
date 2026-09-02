/* Which video skills exist, and which PicX input route each one uses.
 *
 * Deliberately a SEPARATE registry from GENERATION_MODES in
 * src/lib/doodle-constants.ts. That list drives the per-IMAGE price table
 * (`Record<GenerationMode, number>` in src/lib/credits/costs.ts) and the image
 * tool's own enum, so adding a video id there would make a 5-second clip cost
 * one credit and be handed to the image endpoint. Video is priced per second and
 * runs on a different endpoint, so it gets its own list and its own cost
 * function (videoCreditCost in ./constants.ts).
 *
 * THE ONE DISTINCTION THAT MATTERS. H3 Max has two photo-driven routes and they
 * are not interchangeable:
 *
 *   mode 'image'      — this exact picture IS frame one. Use it to make the
 *                       doodle you just produced start moving. The result is
 *                       recognisably that drawing, animated.
 *   mode 'reference'  — this picture is what the CHARACTER looks like. The clip
 *                       is a new shot of them, not a continuation of that frame.
 *                       Likeness is preserved; composition is free.
 *
 * "Animate this doodle" is `image`. "Make a clip of this doodle character
 * waving" is `reference`. Sending a reference where a first frame was wanted
 * produces a perfectly good clip of the wrong thing, which is why this comment
 * is longer than the code under it.
 */
import type { VideoMode } from "./constants";
import { DEFAULT_VIDEO_SECONDS, MAX_VIDEO_SECONDS } from "./constants";

export const VIDEO_SKILL_IDS = [
  "motion", "reel", "spark", "starcast", "daydream", "dash", "intro",
  /* Vertical genre clips — 9:16, 15s. See the block comment on VIDEO_SKILLS. */
  "voyage", "stealth", "creature", "gadget",
] as const;
export type VideoSkillId = (typeof VIDEO_SKILL_IDS)[number];

export interface VideoSkillConfig {
  /** PicX `mode` this skill submits with. */
  mode: VideoMode;
  /** True when the skill cannot run without an image to work from. */
  requiresPhoto: boolean;
  /** Clip length when the user did not ask for one. */
  defaultSeconds: number;
  /** Sent as `aspect_ratio`; ignored by PicX in image mode (output follows the frame). */
  aspectRatio: string;
}

export const VIDEO_SKILLS: Record<VideoSkillId, VideoSkillConfig> = {
  /* Animate the exact doodle. The frame the user is looking at starts moving,
     which is the payoff people expect from "make this move". */
  motion: { mode: "image", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "1:1" },
  /* A new shot starring the doodle character. Landscape because this is the one
     people post — 16:9 reads as "a clip", 1:1 reads as "a moving avatar". */
  reel: { mode: "reference", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "16:9" },
  /* Anime-STYLE, not anime characters (see §2 of docs/doodle-to-video-plan.md).
     mode 'image' — the exact doodle IS frame one, then a shonen action beat
     erupts around it (speed lines, an impact frame, an energy aura). We are
     animating the drawing the user is looking at, not restaging it, so the
     payoff is "my doodle just powered up", which only works if that frame is
     preserved. Square because the source is a single doodle avatar. */
  spark: { mode: "image", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "1:1" },
  /* Anime-STYLE, not anime characters (see §2). mode 'reference' — the doodles
     fix who the character is, and the clip is a NEW magical-girl transformation
     shot of them (twirl, ribbon sweep, cel-shaded sparkle burst, hero pose).
     That sequence was never drawn, so it must be composed fresh from the
     likeness rather than grown from one frame — reference, not image.
     Landscape because a transformation reel is made to be posted. */
  starcast: { mode: "reference", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "16:9" },
  /* Anime slice-of-life STYLE, not anime characters (see §2 of
     docs/doodle-to-video-plan.md). mode 'image' — the exact doodle IS frame
     one, then it simply breathes: a near-still hold with one moving layer of
     light drifting across it (a blink, a soft glow, hair drift). We are
     animating the drawing the user is looking at, so the payoff is "my doodle
     is quietly alive", which only holds if that frame is preserved — image, not
     reference. Square because the source is a single doodle avatar. */
  daydream: { mode: "image", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "1:1" },
  /* Anime action STYLE, not anime characters (see §2). mode 'reference' — the
     doodles fix who the character is, and the clip is a NEW high-energy shot of
     them in motion (a dash, a leap, speed lines, smear frames, a held impact
     frame). That action was never drawn, so it must be composed fresh from the
     likeness rather than grown from one static frame — reference, not image.
     Landscape because an action shot is framed wide and made to be posted. */
  dash: { mode: "reference", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "16:9" },
  /* Anime opening STYLE, not anime characters or any real show's OP (see §2).
     mode 'reference' — the doodles fix who the character is, and the clip is a
     NEW title-sequence montage of them (a few kinetic cuts settling on a
     key-visual hero pose). A montage across multiple beats is composed, not a
     continuation of one frame — reference, not image. Landscape because a
     title sequence is a wide format made to be posted. */
  intro: { mode: "reference", requiresPhoto: true, defaultSeconds: DEFAULT_VIDEO_SECONDS, aspectRatio: "16:9" },

  /* ── Vertical genre clips ────────────────────────────────────────────────
     Four differences from every skill above, all deliberate:

     9:16, not 1:1 or 16:9 — these are made to be posted, and a phone feed is
     portrait. Square reads as a moving avatar, landscape gets letterboxed to a
     stripe in a vertical feed.

     mode 'reference', never 'image' — H3 Max IGNORES aspect_ratio in image
     mode because the output follows the supplied frame, so a portrait request
     from a square doodle would silently come back square. Reference mode keeps
     the character's likeness and lets the composition be built vertical.

     MAX_VIDEO_SECONDS, not DEFAULT — a genre beat (a run into a landing, a
     transformation, a gag with a punchline) cannot land in 5 seconds. This
     costs 15 credits a clip instead of 5, which is the trade the length buys.

     Each one carries its own art family in the prompt, so the look does not
     depend on the user having also picked the matching chip. */
  voyage: { mode: "reference", requiresPhoto: true, defaultSeconds: MAX_VIDEO_SECONDS, aspectRatio: "9:16" },
  stealth: { mode: "reference", requiresPhoto: true, defaultSeconds: MAX_VIDEO_SECONDS, aspectRatio: "9:16" },
  creature: { mode: "reference", requiresPhoto: true, defaultSeconds: MAX_VIDEO_SECONDS, aspectRatio: "9:16" },
  gadget: { mode: "reference", requiresPhoto: true, defaultSeconds: MAX_VIDEO_SECONDS, aspectRatio: "9:16" },
};

export function isVideoSkillId(value: unknown): value is VideoSkillId {
  return typeof value === "string" && (VIDEO_SKILL_IDS as readonly string[]).includes(value);
}

export function videoSkillConfig(skillId: VideoSkillId): VideoSkillConfig {
  return VIDEO_SKILLS[skillId];
}
