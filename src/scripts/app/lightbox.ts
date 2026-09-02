/* Generic full-screen viewer controller for Lightbox.astro. Each page that
   includes <Lightbox /> calls initLightbox() once, then openLightbox(items,
   startUrl) whenever a tile/result is clicked.

   The markup is a div overlay rather than a native <dialog>, so everything a
   modal dialog gets for free has to be supplied: the Tab trap, Escape, the body
   scroll lock, and focus restoration. That is what createOverlayModal() in
   dialog-a11y.ts does — the overlay claims `aria-modal="true"`, and before this
   was wired that claim was a lie, since Tab walked straight out of the viewer
   into the page behind it.

   The viewer shows both stills and short animations. An item is either a bare
   image URL (the original, still-supported input) or a descriptor carrying its
   kind, so a caller with an animation can say so. An <img> is never pointed at
   an animation — it paints a broken-image icon — so the controller swaps
   between the <img> and a <video> element by item kind. */

import { setImageSrc } from "./dom-utils";
import { createOverlayModal, type OverlayModal } from "./dialog-a11y";

/** A single viewable item. A bare string is treated as a still image, which is
 *  what every existing call site passes. */
export interface LightboxItem {
  url: string;
  isVideo: boolean;
  /** Optional still shown before an animation is played / while it buffers. */
  posterUrl?: string;
}

export type LightboxInput = string | LightboxItem;

/** Internal, always-normalised shape. */
interface NormalItem {
  url: string;
  isVideo: boolean;
  posterUrl?: string;
}

function normalise(entry: LightboxInput): NormalItem {
  if (typeof entry === "string") return { url: entry, isVideo: false };
  return { url: entry.url, isVideo: entry.isVideo, posterUrl: entry.posterUrl };
}

const reduceMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let items: NormalItem[] = [];
let index = 0;
let ready = false;

let backdrop: HTMLElement | null = null;
let img: HTMLImageElement | null = null;
let video: HTMLVideoElement | null = null;
let closeBtn: HTMLElement | null = null;
let prevBtn: HTMLButtonElement | null = null;
let nextBtn: HTMLButtonElement | null = null;
let counter: HTMLElement | null = null;
let overlay: OverlayModal | null = null;

function isOpen(): boolean {
  return backdrop?.classList.contains("open") ?? false;
}

function updateNav(): void {
  const multiple = items.length > 1;
  if (prevBtn) prevBtn.hidden = !multiple;
  if (nextBtn) nextBtn.hidden = !multiple;
  if (counter) {
    counter.hidden = !multiple;
    if (multiple) counter.textContent = `${index + 1} / ${items.length}`;
  }
}

/** Stop and fully unload the <video> so no audio survives a switch or close. */
function stopVideo(): void {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.removeAttribute("poster");
  // Force the media element to abandon the old resource — without a reload it
  // holds the decoded buffer (and can keep emitting audio) until GC.
  video.load();
}

function showAt(i: number): void {
  if (items.length === 0 || !img || !video) return;
  index = (i + items.length) % items.length;
  const item = items[index]!;

  if (item.isVideo) {
    // Never leave the still <img> pointed anywhere while an animation is up.
    img.hidden = true;
    img.removeAttribute("src");

    if (item.posterUrl) video.setAttribute("poster", item.posterUrl);
    else video.removeAttribute("poster");
    video.hidden = false;
    video.src = item.url;
    video.load();
    // Opening the viewer is a deliberate action, so sound is acceptable — but
    // only start playback when the user hasn't asked to reduce motion. The
    // native controls are always the fallback, so a rejected play() is a no-op.
    if (!reduceMotion()) {
      const played = video.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
    }
  } else {
    stopVideo();
    video.hidden = true;
    setImageSrc(img, item.url);
  }

  updateNav();
}

export function openLightbox(list: readonly LightboxInput[], startUrl: string): void {
  if (!ready) initLightbox();
  if (!backdrop || !img || !video) return;
  items = list.map(normalise);
  const start = items.findIndex((item) => item.url === startUrl);
  backdrop.classList.add("open");
  showAt(start === -1 ? 0 : start);
  // Focus lands on the viewer itself, not on Close: the media is the content,
  // and this way the dialog's accessible name is announced, the arrow keys work
  // immediately, and Tab still reaches Close / Prev / Next in order. The scroll
  // lock and the opener to restore focus to are recorded here too.
  overlay?.activate();
}

function closeLightbox(): void {
  if (!backdrop || !img) return;
  backdrop.classList.remove("open");
  img.removeAttribute("src");
  // Pause AND clear the animation's source — otherwise its audio keeps playing
  // behind the closed overlay.
  stopVideo();
  overlay?.release();
}

export function initLightbox(): void {
  if (ready) return;
  backdrop = document.getElementById("lightboxBackdrop");
  img = document.getElementById("lightboxImg") as HTMLImageElement | null;
  video = document.getElementById("lightboxVideo") as HTMLVideoElement | null;
  closeBtn = document.getElementById("lightboxClose");
  prevBtn = document.getElementById("lightboxPrev") as HTMLButtonElement | null;
  nextBtn = document.getElementById("lightboxNext") as HTMLButtonElement | null;
  counter = document.getElementById("lightboxCounter");
  if (!backdrop || !img || !video) return;

  closeBtn?.addEventListener("click", closeLightbox);
  prevBtn?.addEventListener("click", () => showAt(index - 1));
  nextBtn?.addEventListener("click", () => showAt(index + 1));

  // A focused <video> with native controls treats ArrowLeft/ArrowRight as
  // seek. That would both scrub the clip and stop item navigation from firing.
  // Intercept the arrows in the capture phase on the backdrop, before the
  // video's default handler runs, so navigation always wins and the user can
  // never get seek-trapped on a clip. (createOverlayModal's own onKeyDown below
  // is a document-level bubble listener that fires too late for this.)
  backdrop.addEventListener(
    "keydown",
    (event) => {
      if (!isOpen()) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showAt(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showAt(index + 1);
      }
    },
    true,
  );

  overlay = createOverlayModal({
    container: backdrop,
    isOpen,
    requestClose: closeLightbox,
    scrollLockClass: "lightbox-lock",
    initialFocus: () => backdrop,
    // Arrow navigation is handled by the capture-phase listener above so it
    // wins over the video's native seek; nothing else to do here.
  });

  ready = true;
}
