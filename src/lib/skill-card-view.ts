/* Everything a skill tile needs to know, derived once from a Skill.
 *
 * Split out of SkillCard.astro, which had grown past the 300-line component
 * limit with more derivation logic than markup. None of the decisions below are
 * presentational — they are about which URL to request at which size, which
 * shape to reserve, and which of two data manifests actually has an entry for
 * this skill — so they read better as a function with a return type than as a
 * hundred lines of frontmatter, and they can be exercised without rendering.
 *
 * The two `import.meta.glob` calls are relative to THIS file, not to the
 * component. That is the one thing to keep in mind when moving this module.
 */
import { buildSkillThumbnail, type Skill } from "./skills";
import { cdnImageSrcset, resizedCdnImage } from "./cdn-image";
import { imageCountForSkill } from "./credits/costs";

/* Card widths: 226px in the 4-up desktop grid (1000px container), ~30vw at the
   3-up breakpoint, ~45vw at the 2-up phone breakpoint. `sizes` has to describe
   that or the browser picks the largest candidate and the srcset buys nothing. */
export const THUMB_SIZES = "(max-width: 720px) 45vw, (max-width: 980px) 30vw, 226px";

/* Declared intrinsic width. The CSS renders at width:100%/height:auto, so this
   and the derived height do exactly one job: tell the browser the correct shape
   to reserve before the image arrives. A square 440x440 against a 3:2 image is
   what makes a masonry column jump as tiles load. */
export const THUMB_W = 440;

/**
 * A cover cut out of a real clip, with the frame's exact pixel size.
 *
 * src/data/skill-video-covers.json is written by
 * scripts/extract-clip-first-frames.ts. That recorded size is the authority for
 * the reserved box, because `skill.aspectRatio` is only as precise as the three
 * values the loader allows (1:1, 3:2, 9:16) — a 16:9 clip has to declare itself
 * 3:2, the nearest of the three. Reserving 440x293 for a frame that arrives
 * 440x254 costs a 39px reflow per tile, which is the exact jump the width/height
 * attributes exist to prevent.
 */
interface SkillCoverRecord {
  skillId?: string;
  width?: number;
  height?: number;
}

/**
 * One finished animation on file for a skill.
 *
 * Only the fields a tile needs are typed. The file's real shape is richer, but
 * it is a script's contract and restating all of it here would be a second copy
 * of the truth to drift.
 */
interface ShowcaseClipEntry {
  skillId?: string;
  cdnUrl?: string;
  sourceImageUrl?: string;
}

/* Both manifests are produced by scripts and may be absent in a fresh checkout,
   so they are read through import.meta.glob rather than a static import: a glob
   that matches nothing resolves to `{}` and the page still builds, whereas a
   missing static import is a hard build error. Eager and module-scoped, so this
   is one build-time read shared by every card on the page. */
const coverFiles = import.meta.glob<{ default: { covers?: SkillCoverRecord[] } }>(
  "../data/skill-video-covers.json",
  { eager: true },
);
const clipFiles = import.meta.glob<{ default: { clips?: ShowcaseClipEntry[] } }>(
  "../data/showcase-clips.json",
  { eager: true },
);

const ALL_COVERS: SkillCoverRecord[] = Object.values(coverFiles)[0]?.default?.covers ?? [];
const ALL_CLIPS: ShowcaseClipEntry[] = Object.values(clipFiles)[0]?.default?.clips ?? [];

export interface SkillCardView {
  /** True for a `kind: video` skill — the UI calls these animations, never clips. */
  isMoving: boolean;
  /** How many pictures one run returns. 1 unless it is a runnable pack skill. */
  imageCount: number;
  /** The synthetic SVG cover, used only when the skill has no real thumbnail. */
  fallbackSvg: string;
  /** Resized cover URL, or undefined when there is no real cover. */
  src: string | undefined;
  srcset: string | null;
  thumbWidth: number;
  thumbHeight: number;
  /** The finished animation for this skill, when one exists on file. */
  clip: ShowcaseClipEntry | undefined;
  /** Still painted under the moving layer. */
  posterUrl: string | undefined;
  altText: string;
  playLabel: string;
  movesLabel: string;
}

export function buildSkillCardView(skill: Skill): SkillCardView {
  const isMoving = skill.kind === "video";

  /* Pack skills return several separate images from one run. Surfacing the count
     matters because it is what differentiates this catalogue — and because it is
     also what the run costs (1 credit per image), so a user should see "9" before
     clicking, not after being charged. Roadmap skills have no price to look up,
     hence the runnable guard.

     An animation skill is excluded entirely: imageCountForSkill() is defined over
     the image modes and throws for one by design (the guard that stops an
     animation being charged as a single image), and "9" would be meaningless for
     one anyway. */
  const imageCount = skill.runnable && !isMoving ? imageCountForSkill(skill.id) : 1;

  const srcset = skill.thumbnailUrl ? cdnImageSrcset(skill.thumbnailUrl) : null;
  /* A resized variant, so a browser that ignores srcset still never downloads
     the 1024px original. */
  const src = skill.thumbnailUrl ? resizedCdnImage(skill.thumbnailUrl, 440) : undefined;

  const coverRecord = ALL_COVERS.find(
    (entry) => entry.skillId === skill.id && Number(entry.width) > 0 && Number(entry.height) > 0,
  );
  const thumbHeight = coverRecord
    ? Math.round((THUMB_W * coverRecord.height!) / coverRecord.width!)
    : skill.aspectRatio === "3:2"
      ? 293
      : skill.aspectRatio === "9:16"
        ? 782
        : 440;

  const clip = isMoving
    ? ALL_CLIPS.find(
        (entry) => entry.skillId === skill.id && typeof entry.cdnUrl === "string" && entry.cdnUrl.length > 0,
      )
    : undefined;

  /* Poster is the same resized still the <img> already shows, so the two share
     one cache entry and the moving layer never flashes an unpainted black box.
     Falls back to the animation's own source doodle when the skill has no cover
     yet. */
  const posterUrl = src ?? (clip?.sourceImageUrl ? resizedCdnImage(clip.sourceImageUrl, 440) : undefined);

  return {
    isMoving,
    imageCount,
    fallbackSvg: buildSkillThumbnail(skill),
    src,
    srcset,
    thumbWidth: THUMB_W,
    thumbHeight,
    clip,
    posterUrl,
    /* Alt text describes what the picture IS, in the user's words. On an
       animation skill the cover is one frame of something that moves, and saying
       so is the difference between "this makes a picture" and "this makes a
       moving doodle". */
    altText: isMoving ? `A frame from the ${skill.name} animation` : `${skill.name} example`,
    /* The two accessible names the marker carries: a real button when there is
       something to play, a plain marker when there is not (or under reduced
       motion, which the controller enforces at runtime). Both are authored here
       so the controller swaps between them rather than inventing copy in JS.
       Consumer words: it comes to life, it does not "play a video clip". */
    playLabel: `Play the ${skill.name} animation`,
    movesLabel: "Comes to life as an animation",
  };
}
