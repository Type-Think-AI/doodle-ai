/* Submit one video render to PicX and return the moment it is accepted.
 *
 * This is the video analogue of `submitPicxAsync` in src/lib/batch/prompt.ts,
 * and it exists for the same reason: PicX's video endpoint ALWAYS answers 202
 * and never hands back a finished asset — a clip takes tens of seconds to
 * minutes to render (see VIDEO_ESTIMATED_SECONDS), far past anything worth
 * blocking a Worker isolate on. So we submit, record PicX's generation id, and
 * let the webhook (src/pages/api/webhooks/picx.ts) complete the row when the
 * result is delivered. Submitting takes milliseconds; the render happens on
 * PicX's side and lands as an independent inbound request.
 *
 * Every model id, mode, duration bound, resolution and reference cap comes from
 * src/lib/video/constants.ts — nothing is re-declared here, for the same reason
 * that file gives: a second copy of any of those numbers is a mischarge or a
 * provider 422 waiting to happen.
 *
 * Never throws. A failure is DATA (`{ ok: false, error }`), exactly like
 * `callPicx`/`submitPicxAsync`: the caller writes the error onto the generation
 * row and refunds, rather than catching an exception that would abort whatever
 * else is running. Distinct error codes are returned so the caller can tell a
 * caller mistake (missing image, no references) from an upstream rejection (a
 * non-202, or a 202 with no id) — the latter is the "deployment predates async
 * video / PicX changed its contract" case and must not be mistaken for a queued
 * job, because treating a non-accept as pending would strand the clip until the
 * sweep refunded it.
 */
import {
  clampVideoSeconds,
  MAX_VIDEO_REFERENCES,
  VIDEO_HAS_AUDIO,
  VIDEO_MODEL,
  type VideoMode,
  type VideoResolution,
} from "./constants";

export interface SubmitVideoInput {
  prompt: string;
  mode: VideoMode;
  /** Required when mode === "image": the exact frame-one picture to animate. */
  imageUrl?: string | null;
  /** Required (>=1) when mode === "reference": the character(s) to keep across the clip. */
  referenceUrls?: string[] | null;
  seconds: number;
  resolution: VideoResolution;
  aspectRatio?: string;
}

export type SubmitVideoResult =
  | { ok: true; picxGenerationId: string }
  | { ok: false; error: string };

const VIDEO_ENDPOINT = "https://api.picxstudio.com/v1/videos/generate";

/**
 * Submit a clip and return as soon as PicX accepts it (202), without waiting for
 * the render. On success the returned `picxGenerationId` is the ONLY correlation
 * key the webhook will trust — it must be persisted on the `generation` row
 * before a delivery can arrive (a delivery cannot precede its own submit).
 */
export async function submitVideo(
  platformKey: string,
  input: SubmitVideoInput,
  callbackUrl: string,
): Promise<SubmitVideoResult> {
  // Caller-mistake gates first — distinct codes so the row records *why*, and so
  // we never spend a round-trip on a request PicX would reject as a 400 anyway.
  if (input.mode === "image" && !input.imageUrl) {
    return { ok: false, error: "video_image_required" };
  }

  // Cap references at the schema ceiling rather than letting PicX 422 the request.
  // References beyond MAX_VIDEO_REFERENCES are dropped, keeping the first N in
  // prompt order (they are cited as "Image 1", "Image 2", … — order is meaning).
  const referenceUrls = (input.referenceUrls ?? []).filter((u): u is string => Boolean(u)).slice(
    0,
    MAX_VIDEO_REFERENCES,
  );
  if (input.mode === "reference" && referenceUrls.length === 0) {
    return { ok: false, error: "video_reference_required" };
  }

  // Duration is clamped, never trusted from the caller — same rule as
  // videoCreditCost(): the number that priced the clip and the number sent to
  // PicX must be derived identically, or a clip is charged for a length it was
  // not rendered at.
  const duration = clampVideoSeconds(input.seconds);

  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    model: VIDEO_MODEL,
    mode: input.mode,
    duration,
    resolution: input.resolution,
    sound: VIDEO_HAS_AUDIO,
    callback_url: callbackUrl,
  };
  if (input.aspectRatio) payload.aspect_ratio = input.aspectRatio;
  if (input.mode === "image") payload.image_url = input.imageUrl;
  if (input.mode === "reference") payload.reference_urls = referenceUrls;

  try {
    const res = await fetch(VIDEO_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      detail?: string;
      message?: string;
    };

    if (!res.ok) {
      // 400 unpriced resolution, 402 insufficient platform credits, 403 missing
      // videos:generate scope — all upstream rejections, surfaced verbatim so
      // the failing row is diagnosable rather than collapsed to a generic code.
      return { ok: false, error: data.detail || data.message || `PicX API error: ${res.status}` };
    }
    if (res.status !== 202 || !data.id) {
      // A 2xx that is not 202, or a 202 with no id, means PicX did not hand us a
      // job to correlate on. Distinct code: this is the "contract drifted"
      // signal, not a queued clip — mistaking it for pending would strand the
      // generation until the sweep refunded it.
      return {
        ok: false,
        error: "video_async_unsupported",
      };
    }
    return { ok: true, picxGenerationId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Submit failed" };
  }
}
