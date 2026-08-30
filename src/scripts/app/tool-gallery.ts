/* Tool-page example gallery: open an example full size, or share it.
 *
 * Viewing delegates to the app's existing Lightbox rather than adding a second
 * viewer — see src/components/tool/ToolGallery.astro for why.
 *
 * Sharing prefers navigator.share because on a phone that is the OS share sheet,
 * which is where sharing actually happens. Desktop Chrome and Firefox mostly do
 * not implement it, so the fallback copies the link instead of leaving a dead
 * button. Both paths share the PAGE url, not the bare CDN image: a shared image
 * file is a dead end for the recipient and passes nothing to the page.
 */

import { openLightbox, initLightbox } from "./lightbox";
import { showToast } from "./toast";

function sharePageUrl(): string {
  /* The PAGE, deliberately — not the CDN image. A shared .jpg is a dead end for
     the recipient (no generator, no context) and passes nothing to the page.
     Query and hash are stripped so a link shared from a session that arrived via
     ?skill= or ?prompt= does not carry someone else's state to a stranger. */
  const page = new URL(window.location.href);
  page.hash = "";
  page.search = "";
  return page.toString();
}

async function share(title: string): Promise<void> {
  const url = sharePageUrl();
  const text = `${title} — made with Doodle AI`;

  /* Feature-detect share itself, not the user agent. Older WebKit exposes
     navigator.share but throws on some payload shapes, so the catch below is
     load-bearing rather than defensive noise. */
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      /* AbortError means the person dismissed the sheet on purpose — that is a
         completed interaction, not a failure, and must NOT fall through to
         copying a link they did not ask for. */
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied");
  } catch {
    /* clipboard can reject on a non-secure context or a denied permission.
       showToast takes text only — there is no error variant — so the message
       itself has to carry the failure. */
    showToast("Could not copy the link");
  }
}

function initToolGallery(): void {
  const gallery = document.querySelector<HTMLElement>("[data-tool-gallery]");
  if (!gallery || gallery.dataset.galleryInit === "true") return;
  gallery.dataset.galleryInit = "true";

  /* The full ordered list is serialized by the component so the lightbox can
     page through every example with the arrow keys, not just show the one that
     was clicked. */
  let images: string[] = [];
  try {
    images = JSON.parse(gallery.dataset.images ?? "[]") as string[];
  } catch {
    images = [];
  }
  const shareTitle = gallery.dataset.shareTitle ?? document.title;

  initLightbox();

  gallery.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const shareBtn = target.closest<HTMLElement>("[data-gallery-share]");
    if (shareBtn) {
      // Stop the click reaching the view button underneath it.
      event.preventDefault();
      event.stopPropagation();
      void share(shareTitle);
      return;
    }

    const openBtn = target.closest<HTMLElement>("[data-gallery-url]");
    if (openBtn) {
      const url = openBtn.dataset.galleryUrl;
      if (url) openLightbox(images.length > 0 ? images : [url], url);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initToolGallery);
} else {
  initToolGallery();
}
document.addEventListener("astro:page-load", initToolGallery);
