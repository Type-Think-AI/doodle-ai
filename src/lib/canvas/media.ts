/* What "a thing that can go on the canvas" is — the one shape shared by the
 * chat bridge, the tldraw island, and anything else that hands media to the
 * board.
 *
 * WHY THIS EXISTS AT ALL. The canvas used to speak in bare `string[]` URLs,
 * which was fine while every result was a PNG. It stopped being fine the moment
 * animations shipped: a URL alone cannot tell you whether to build an image
 * shape or a video shape, and getting that wrong is not a subtle bug — an mp4 in
 * a tldraw image shape paints a broken-image icon, which reads to the user as
 * "my animation was lost".
 *
 * WHY KIND IS CARRIED, NOT SNIFFED. The obvious shortcut is to test the URL for
 * `.mp4`. That does not work here: PicX serves generated media through signed,
 * EXTENSIONLESS URLs, so extension-sniffing reports every clip as an image. The
 * kind is known for certain at the point the media is created (a `videos[]`
 * entry in the thread, or the stream's `video` event), so it is resolved there
 * and carried, never re-derived downstream.
 *
 * PURITY. Same rule as ops.ts in this directory: no DOM, no tldraw import, no
 * Node built-ins. This module is imported by browser code today, and keeping it
 * dependency-free means the Worker side can import it tomorrow without dragging
 * ~1MB of browser-only tldraw into the bundle.
 */

/** One piece of media destined for the board. */
export interface CanvasMediaItem {
  url: string;
  /** True for an animation (mp4). Resolved upstream — never sniffed from `url`. */
  isVideo: boolean;
  /**
   * A still to show before playback starts. Used by the chat card and the
   * lightbox; the tldraw canvas ignores it, because tldraw's video asset has no
   * poster field (verified against @tldraw/tlschema 5.3.2 TLVideoAsset).
   */
  posterUrl?: string;
}

/**
 * What the canvas accepts on its way in.
 *
 * A bare string still means "image", deliberately: `window.__doodleCanvasQueue`
 * is written by chat code that may be a CACHED OLDER BUNDLE while the freshly
 * deployed island drains it. Refusing strings would silently drop that whole
 * backlog — the exact class of bug that once made a thread with existing doodles
 * open to an empty canvas.
 */
export type CanvasMediaInput = string | CanvasMediaItem;

/** Widen one input to the full item shape. A bare string is an image. */
export function toCanvasMediaItem(input: CanvasMediaInput): CanvasMediaItem {
  return typeof input === "string" ? { url: input, isVideo: false } : input;
}

/**
 * Normalise a mixed list, dropping anything without a usable URL.
 *
 * Empty/absent URLs are filtered here rather than at each call site because a
 * queued clip legitimately has no URL until its webhook lands, and callers
 * should not each have to remember that.
 */
export function normalizeCanvasMedia(inputs: readonly CanvasMediaInput[]): CanvasMediaItem[] {
  const items: CanvasMediaItem[] = [];
  for (const input of inputs) {
    const item = toCanvasMediaItem(input);
    if (item.url) items.push(item);
  }
  return items;
}
