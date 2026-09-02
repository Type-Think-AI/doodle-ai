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


/**
 * Sets an element's `background-image` from a URL that came from the server or
 * from another user (an avatar, typically), without assembling the CSS value
 * out of the raw string.
 *
 * Two reasons this exists rather than `el.style.backgroundImage =
 * `url("${value}")`` at each call site:
 *
 *   1. Correctness. A URL containing a double quote, a backslash or a newline
 *      produces a value the CSS parser rejects, and a rejected value makes the
 *      assignment a silent no-op — the avatar just doesn't appear, with no
 *      error anywhere. Round-tripping through `URL` percent-encodes those
 *      characters so a legitimate-but-awkward URL still renders.
 *   2. Reviewability. It keeps user-derived strings out of a CSS context, so
 *      the remaining call sites read as data rather than as assembled markup.
 *
 * Only `http:`, `https:`, `blob:` and `data:image/*` URLs are accepted;
 * anything else clears the background instead of being passed through.
 */
export function setBackgroundImageUrl(el: HTMLElement, url: string | null | undefined): void {
  const safe = url ? safeImageUrl(url) : null;
  el.style.backgroundImage = safe ? `url("${safe}")` : "";
}

/** Returns a URL that is safe to embed in a CSS `url("…")` token, or null. */
function safeImageUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return null;
  }

  const allowed =
    parsed.protocol === "http:" ||
    parsed.protocol === "https:" ||
    parsed.protocol === "blob:" ||
    (parsed.protocol === "data:" && parsed.pathname.startsWith("image/"));
  if (!allowed) return null;

  // `data:` URLs keep an opaque path, so the URL serialiser leaves quotes and
  // backslashes in place. Reject rather than guess at escaping them.
  return /["\\\r\n]/.test(parsed.href) ? null : parsed.href;
}
