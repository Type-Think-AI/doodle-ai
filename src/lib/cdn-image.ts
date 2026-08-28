/* PicX CDN image transforms.
 *
 * Every image this app displays that it did not build itself comes from
 * cdn.picxstudio.com at its generated size — 1024x1024 — regardless of how small
 * the box on the page is. A Lighthouse run on 2026-08-28 measured the cost:
 * 13,794 KiB of a 16,923 KiB page was full-size PicX imagery, and LCP was 36.2 s.
 *
 * Cloudflare Image Resizing is enabled on that zone, so the fix is a URL prefix
 * rather than an asset pipeline. Measured against one real 1024px thumbnail:
 *
 *   untouched original                 1,667,776 bytes  (WebP)
 *   width=240,format=auto,quality=82      20,182 bytes  (AVIF)
 *   width=440,format=auto,quality=82      51,058 bytes  (AVIF)
 *   width=640,format=auto,quality=82      94,703 bytes  (AVIF)
 *
 * `format=auto` earns most of that: it negotiates AVIF/WebP from the request's
 * Accept header, so no format is hardcoded and older browsers still get
 * something they can decode.
 *
 * NOT for Open Graph / social card images — those must stay full-size absolute
 * originals, because scrapers want >=1200px and do not send an Accept header we
 * can negotiate against. See OG_IMAGE in src/consts.ts.
 */

const CDN_HOST = "cdn.picxstudio.com";
const DEFAULT_QUALITY = 82;

/** Widths used in srcsets. 240 covers a 2-up phone grid, 640 a 4-up desktop grid at 3x DPR. */
export const CDN_IMAGE_WIDTHS = [240, 440, 640] as const;

function isTransformable(url: string): boolean {
  /* Skip anything not on the PicX CDN (local assets, data URIs) and anything that
     already carries a transform, so calling these twice is safe. */
  return url.includes(CDN_HOST) && !url.includes("/cdn-cgi/image/");
}

/**
 * Rewrite a PicX CDN image URL to request a resized, format-negotiated variant.
 * Returns the input untouched when it is not a transformable PicX CDN URL.
 */
export function resizedCdnImage(url: string, width: number, quality = DEFAULT_QUALITY): string {
  if (!isTransformable(url)) return url;

  try {
    const parsed = new URL(url);
    const options = `width=${width},format=auto,quality=${quality}`;
    return `${parsed.origin}/cdn-cgi/image/${options}${parsed.pathname}${parsed.search}`;
  } catch {
    /* Not a parseable absolute URL — leave it alone rather than emit a broken one. */
    return url;
  }
}

/**
 * A `srcset` across CDN_IMAGE_WIDTHS, or null when the URL is not transformable
 * (in which case omit the attribute entirely rather than emitting an empty one).
 */
export function cdnImageSrcset(url: string): string | null {
  if (!isTransformable(url)) return null;
  return CDN_IMAGE_WIDTHS.map((w) => `${resizedCdnImage(url, w)} ${w}w`).join(", ");
}
