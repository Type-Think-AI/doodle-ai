/* Hearing an animation on the canvas.
 *
 * THE PROBLEM. tldraw 5.3.2 renders every video shape with `muted` as a LITERAL
 * JSX attribute (verified in node_modules/tldraw/src/lib/shapes/video/
 * VideoShapeUtil.tsx), and the shape's own props expose `autoplay`, `time` and
 * `playing` but nothing for volume. So there is no prop, no style and no editor
 * API that can unmute a clip on the board — and MiniMax H3 Max always renders
 * audio, so the sound is there and simply unreachable.
 *
 * WHY THE DOM, NOT A FORK. The alternative is forking VideoShapeUtil.component
 * — about ninety lines of vendor JSX that we would then own across every tldraw
 * upgrade, for one button. This module instead reaches the rendered <video> and
 * flips `muted`/`paused` directly. That is deliberately the humbler failure
 * mode: it touches no shape record and no document store, so if a tldraw upgrade
 * renames a class the worst outcome is a button that does nothing, never a
 * corrupted board or a lost doodle.
 *
 * WHY IMPERATIVE MUTATION STICKS. React writes `muted` when the element mounts
 * and then diffs against its own previous prop value; a literal never changes, so
 * it is never re-written. The element only remounts when `key={url}` changes,
 * i.e. when the clip itself is swapped. So an unmute survives ordinary
 * re-renders, selection changes and camera moves.
 *
 * WHY UNMUTING IS EXCLUSIVE. tldraw autoplays every video shape on loop by
 * default, so a board holding four animations is four soundtracks playing at
 * once. Unmuting one therefore mutes the others: at most one clip is ever
 * audible, which is the only version of this that is usable with a full board.
 *
 * PURITY. No tldraw import, no framework import — just an element and a shape
 * id. That keeps it out of the ~1MB canvas island's dependency graph and makes
 * every function here directly exercisable against a plain DOM fixture.
 */

/** tldraw's class on every rendered video shape. */
const VIDEO_CLASS = "tl-video";

/**
 * The per-shape class tldraw derives from a shape id.
 *
 * `shape:abc123` becomes `tl-video-shape-abc123` — it splits on the colon and
 * keeps the local half. Mirrored here rather than imported because it is
 * assembled inline inside the vendor's render function and is not exported.
 */
function perShapeClass(shapeId: string): string {
  const local = shapeId.split(":")[1] ?? shapeId;
  return `tl-video-shape-${local}`;
}

/**
 * Find the rendered <video> for a shape.
 *
 * Two strategies, because the per-shape class is an internal detail that a minor
 * tldraw release could rename without ceremony. `expectedSrc` gives a second
 * route home: the asset URL is ours, so matching it against each video's
 * resolved `currentSrc` identifies the right element without depending on any
 * tldraw naming at all. Class first (exact and cheap), src second (durable).
 */
export function findShapeVideo(
  container: HTMLElement | null | undefined,
  shapeId: string,
  expectedSrc?: string,
): HTMLVideoElement | null {
  if (!container) return null;

  const byClass = container.querySelector<HTMLVideoElement>(`.${perShapeClass(shapeId)}`);
  if (byClass) return byClass;

  if (!expectedSrc) return null;
  const all = container.querySelectorAll<HTMLVideoElement>(`.${VIDEO_CLASS}`);
  for (const video of all) {
    // currentSrc is the resolved absolute URL, so compare by suffix rather than
    // equality — the asset may have been given a relative or differently
    // normalised URL than the one the browser ended up fetching.
    const resolved = video.currentSrc || video.src || "";
    if (resolved && (resolved === expectedSrc || resolved.endsWith(expectedSrc))) return video;
  }
  return null;
}

/** Every rendered clip on the board. */
export function findAllVideos(container: HTMLElement | null | undefined): HTMLVideoElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLVideoElement>(`.${VIDEO_CLASS}`));
}

/** Whether this shape is the one currently making sound. */
export function isShapeAudible(
  container: HTMLElement | null | undefined,
  shapeId: string,
  expectedSrc?: string,
): boolean {
  const video = findShapeVideo(container, shapeId, expectedSrc);
  return !!video && !video.muted;
}

/** Silence the whole board. */
export function muteAllVideos(container: HTMLElement | null | undefined): void {
  for (const video of findAllVideos(container)) video.muted = true;
}

/**
 * Make exactly one clip audible, silencing every other.
 *
 * Also starts the clip if it is sitting paused: a user who asks for sound and
 * gets a muted-looking still frame has been told "no" by a button that said
 * yes. `play()` is a promise that rejects under autoplay policy, and that
 * rejection is swallowed on purpose — the audio is already unmuted by then, and
 * a rejected play is not something the user can act on.
 *
 * Returns whether the target was actually found, so the caller can avoid
 * flipping its icon to "on" for a clip it never reached.
 */
export function setExclusiveAudio(
  container: HTMLElement | null | undefined,
  shapeId: string,
  expectedSrc?: string,
): boolean {
  const target = findShapeVideo(container, shapeId, expectedSrc);
  if (!target) return false;

  for (const video of findAllVideos(container)) {
    if (video !== target) video.muted = true;
  }

  target.muted = false;
  if (target.paused) void target.play().catch(() => {});
  return true;
}

/**
 * Toggle this clip's sound, keeping the board to one soundtrack.
 *
 * Returns the state actually reached, so the button renders what happened rather
 * than what was requested — if the element could not be found, the caller is
 * told it is still silent instead of showing a lie.
 */
export function toggleExclusiveAudio(
  container: HTMLElement | null | undefined,
  shapeId: string,
  expectedSrc?: string,
): boolean {
  if (isShapeAudible(container, shapeId, expectedSrc)) {
    const video = findShapeVideo(container, shapeId, expectedSrc);
    if (video) video.muted = true;
    return false;
  }
  return setExclusiveAudio(container, shapeId, expectedSrc);
}
