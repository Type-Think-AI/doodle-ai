/* Single source of truth for Doodle AI's video generation.
 *
 * Everything about video — the model, the modes, the resolutions, the duration
 * bounds and the price — is declared HERE and imported everywhere else, for the
 * same reason src/lib/credits/costs.ts exists for images: a second copy of any
 * of these numbers is a mischarge or a 422 waiting to happen.
 *
 * WHY H3 MAX. The clips come from MiniMax H3 Max (`minimax/h3-max`) through
 * PicX's public API. It is a post-trained H3 variant tuned for prompt adherence
 * with audio always on, 5-15s clips, and three input routes that map exactly
 * onto what Doodle AI already has on screen:
 *
 *   text-to-video       -> mode "text"       (no photo, prompt only)
 *   image-to-video      -> mode "image"      (animate ONE exact frame)
 *   reference-to-video  -> mode "reference"  (keep THIS character across a clip)
 *
 * The image/reference distinction is the one that matters and the one that is
 * easy to get wrong: `image` means "this exact picture is frame one", `reference`
 * means "this is what the character looks like, now make a new clip of them".
 * Animating a doodle we just produced is `image`. Making a new scene starring
 * that doodle character is `reference`.
 *
 * RESOLUTION, AND WHY 480p IS THE ONLY TIER HERE.
 * H3 Max renders 480P and 768P natively. PicX prices both (30 and 52 credits per
 * second). But the public API's request schema pins `resolution` to
 * ^(480p|720p|1080p)$ — so 768p is rejected at parse time (422) and 720p is
 * rejected as unpriced for this model (400, "Resolution '720p' is not available").
 * 480p is therefore the only tier reachable from here today. `768p` is listed
 * below as a known rate so that adding it to that regex upstream is a one-line
 * change on both sides, not a re-derivation — but it is NOT selectable until then.
 */

/** PicX model id. The user-facing name is "MiniMax H3 Max"; there is no "S3". */
export const VIDEO_MODEL = "minimax/h3-max";

/** How a clip sources its visual input — PicX's `mode` field, verbatim. */
export const VIDEO_MODES = ["text", "image", "reference"] as const;
export type VideoMode = (typeof VIDEO_MODES)[number];

/** Tiers this app may request. See the header for why 768p is absent. */
export const VIDEO_RESOLUTIONS = ["480p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "480p";

/** H3 Max accepts 5-15s as an integer. Anything else is a provider 422. */
export const MIN_VIDEO_SECONDS = 5;
export const MAX_VIDEO_SECONDS = 15;
export const DEFAULT_VIDEO_SECONDS = 5;

/**
 * Reference-IMAGE cap. Three different ceilings apply and the smallest binds:
 * fal allows 12 files combined across images+videos+audio, PicX's public schema
 * caps `reference_urls` at 10, and MiniMax — the model vendor — documents
 * "Reference entry / Images: <= 9" (platform.minimax.io/docs/guides/video-generation,
 * read 2026-09-02). We only ever send images, so 9 is the real ceiling; sending
 * a 10th would satisfy both our own schema and PicX and still be rejected (or
 * silently truncated) upstream, after the clip was charged.
 * References are cited in prompt order as "Image 1", "Image 2", …
 */
export const MAX_VIDEO_REFERENCES = 9;

/**
 * Documented bounds on a reference image, from the same MiniMax page: every
 * side in [256, 5760] px, file <= 30 MB, format one of JPG/JPEG/PNG/WEBP/HEIC/HEIF.
 * WebP IS supported — a webp reference is not a format error. These are here so
 * a reference can be rejected BEFORE credits are charged rather than 422'd
 * upstream afterwards (picx-studio has already shipped that bug once: a 250x312
 * reference returned `image_too_small` on a paid request).
 */
export const MIN_REFERENCE_IMAGE_PX = 256;
export const MAX_REFERENCE_IMAGE_PX = 5760;
export const MAX_REFERENCE_IMAGE_BYTES = 30 * 1024 * 1024;
export const REFERENCE_IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * Internal credits per second of finished video, per tier.
 *
 * Anchored to the image rate rather than invented: one doodle image costs the
 * platform ~53 PicX credits and the user 1 internal credit, and a second of
 * 480p H3 Max costs the platform 30 PicX credits. 1 credit per second therefore
 * charges a 5s clip at 5 credits for ~2.8 credits of cost — the same shape of
 * margin images carry, with room for the reference-token surcharge fal adds on
 * heavy reference inputs (which PicX does not itemise back to us).
 *
 * 768p is priced here for the day the upstream regex admits it: it costs 52
 * PicX credits per second, so it is 2 internal credits per second.
 */
export const VIDEO_CREDITS_PER_SECOND: Record<VideoResolution | "768p", number> = {
  "480p": 1,
  "768p": 2,
};

/** Audio is always on for H3 Max — measured against fal, not assumed. */
export const VIDEO_HAS_AUDIO = true;

/**
 * Rendering budget used by the UI's honest wait state.
 *
 * MEASURED, not estimated. Four independent live renders of 5s 480p clips
 * through minimax/h3-max on 2026-09-01, timed off PicX's own
 * created_at/completed_at: 4.5s, 4.6s, 5.3s, 7.6s. The previous value of 75s
 * came from a pre-launch guess and made the wait state promise a minute of
 * waiting for something that arrives in well under ten seconds — which reads as
 * a stall, not as patience.
 *
 * 20s keeps headroom over the slowest measured render (7.6s) for a longer clip
 * or a loaded queue, while staying in the same order of magnitude as reality. We
 * have NO 15s-clip samples yet, so if 15s renders turn out materially slower this
 * should become a per-duration function rather than one constant.
 *
 * Note this is only the UI's expectation. The refund sweep uses
 * VIDEO_TIMEOUT_MINUTES below, which stays at 30 and is what keeps a still-
 * rendering clip from being refunded out from under the user.
 */
export const VIDEO_ESTIMATED_SECONDS = 20;
export const VIDEO_TIMEOUT_MINUTES = 30;

/**
 * When the wait stops being normal, and when it stops being reassuring.
 *
 * WHY THESE EXIST. The estimate above is measured off renders that land in
 * 4.5-7.6s, so "usually under 20s" is true almost always. But the upstream
 * render can stall — observed 2026-09-02: a 5s clip sat at `processing` on the
 * provider for over seven minutes, and an image sat at `pending` for
 * thirty-seven. Through all of that the card kept saying "usually under 20s",
 * which is the one thing it must not do: past the estimate that sentence is no
 * longer information, it is a claim the product is contradicting on screen.
 *
 * So the copy escalates instead of repeating. These are the boundaries.
 * `SLOW` is 2x the estimate — comfortably past the real distribution, so it does
 * not fire on a merely unlucky render. `STALLED` is the point where we stop
 * saying "nearly there" and tell the user the truth: it may take a while, and
 * they do not have to sit here, because delivery is a webhook writing our own
 * row and the thread re-attaches to it on load.
 */
export const VIDEO_SLOW_AFTER_SECONDS = VIDEO_ESTIMATED_SECONDS * 2;
export const VIDEO_STALLED_AFTER_SECONDS = 180;

export function isVideoMode(value: unknown): value is VideoMode {
  return typeof value === "string" && (VIDEO_MODES as readonly string[]).includes(value);
}

/** Clamp a requested duration into what the model actually accepts. */
export function clampVideoSeconds(seconds: number | undefined): number {
  if (!Number.isFinite(seconds)) return DEFAULT_VIDEO_SECONDS;
  return Math.min(MAX_VIDEO_SECONDS, Math.max(MIN_VIDEO_SECONDS, Math.round(seconds as number)));
}

/**
 * Credits for one clip. Derived from the clamped duration, never from a
 * client-supplied number — same rule as creditCostForSkill().
 */
export function videoCreditCost(
  seconds: number,
  resolution: VideoResolution = DEFAULT_VIDEO_RESOLUTION,
): number {
  const rate = VIDEO_CREDITS_PER_SECOND[resolution] ?? VIDEO_CREDITS_PER_SECOND["480p"];
  return clampVideoSeconds(seconds) * rate;
}
