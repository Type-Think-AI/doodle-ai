/* Small shared helpers used across the app-shell page controllers. */

/**
 * Sets an <img>'s src defensively: if the image fails to load, the element
 * is hidden instead of showing the browser's raw broken-image icon + alt
 * text (which isn't sized/clipped by our CSS and spills out of small
 * thumbnails — e.g. the composer's 26px attach-preview circle).
 */
export function setImageSrc(img: HTMLImageElement, url: string): void {
  img.hidden = false;
  // Decode off the main thread so image loads don't block interaction/paint.
  img.decoding = "async";
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = url;
}

/**
 * Reloads the page if it's being restored from the browser's back/forward
 * cache (bfcache). A bfcache restore repaints the exact DOM the user left
 * behind — including in-progress composer state like an attach preview
 * that hadn't finished loading, or a skill chip mid-transition — without
 * re-running this module's init code to reconcile it. A full reload is the
 * simplest way to guarantee the page always reflects real, current state
 * (localStorage) rather than a stale snapshot.
 */
export function guardBfcacheRestore(): void {
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
  });
}
