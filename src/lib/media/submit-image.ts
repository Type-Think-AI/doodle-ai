/* Submit one image render to PicX and return as soon as it is accepted.
 *
 * This is the ONLY way images are generated in this app. There is no synchronous
 * variant and no polling: every render is submitted with a `callback_url`, PicX
 * answers 202 with a generation id, and the finished image arrives as an inbound
 * POST to src/pages/api/webhooks/picx.ts.
 *
 * The previous synchronous path (one blocking fetch per image, held open for the
 * whole render) was removed 2026-09-01. One delivery mechanism, one code path.
 *
 * Never throws — a failed submit is data the caller records on the row and
 * refunds against, not an exception that aborts sibling frames.
 */

const ENDPOINT_GENERATE = "https://api.picxstudio.com/v1/images/generate";
const ENDPOINT_EDIT = "https://api.picxstudio.com/v1/images/edit";

export interface ImageSubmitInput {
  prompt: string;
  aspectRatio: "1:1" | "3:2";
  /** The subject photo. Present means this is an edit, absent means generate. */
  imageUrl?: string | null;
  /** Optional extra style/composition reference, sent alongside the subject. */
  refImageUrl?: string | null;
  size?: string;
}

export type ImageSubmitResult =
  | { ok: true; picxGenerationId: string }
  | { ok: false; error: string };

/**
 * `callbackUrl` must be a PUBLIC https URL — PicX's SSRF guard refuses a host it
 * cannot resolve, so localhost needs a tunnel (see PICX_CALLBACK_ORIGIN in
 * src/env.d.ts).
 */
/**
 * How many times to re-check an input image before giving up, and how long to
 * wait between tries. Three tries inside ~2.1s.
 */
const REACHABILITY_TRIES = 3;
const REACHABILITY_BACKOFF_MS = [700, 1400];

/**
 * Confirm an input image is actually downloadable before we ask anyone to render
 * from it.
 *
 * WHY THIS EXISTS — a real failure, 2026-09-02. A generation died with fal's
 * `422 input.image_urls: Failed to download the file`, on a URL that was one of
 * OUR OWN managed uploads (cdn.picxstudio.com/uploads/api/…). The object was
 * written at 02:38:42 UTC and the render was submitted ~20 seconds later; the
 * same URL served a valid 903,206-byte PNG when checked afterwards. So the asset
 * was never broken — the upstream fetch simply arrived before that object was
 * consistently readable at the edge.
 *
 * The cost of that race is paid entirely by the user: the submit succeeds, PicX
 * accepts it, and the failure happens two hops away where our only signal is a
 * webhook that may never come. Two seconds of checking here converts it into a
 * short wait, and in the genuinely-broken case into an honest error BEFORE the
 * credit is spent rather than a generation that hangs.
 *
 * A Range request, not HEAD: HEAD is answered from metadata and can succeed
 * while the body is not yet servable — during the incident a HEAD reported a
 * content-length that disagreed with what GET delivered. Asking for one byte
 * proves the body is actually being served.
 */
async function firstUnreachableImage(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    let reachable = false;
    for (let attempt = 0; attempt < REACHABILITY_TRIES; attempt++) {
      if (attempt > 0) {
        const wait = REACHABILITY_BACKOFF_MS[attempt - 1] ?? 1400;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      try {
        const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
        /* 206 for an honoured range, 200 when the origin ignores Range. Either
           proves a body is being served. */
        const servedBody = res.ok || res.status === 206;
        /* And it has to be a PICTURE. The CDN answers a missing object with a
           27KB HTML error page, so a status-only check would pass an edge that
           returned that page with a 200 — the exact "plausible but wrong" case
           this guard exists to catch. */
        const type = res.headers.get("content-type") ?? "";
        if (servedBody && !type.startsWith("text/")) {
          reachable = true;
          break;
        }
      } catch {
        /* Network error — treat as unreachable and retry. */
      }
    }
    if (!reachable) return url;
  }
  return null;
}

export async function submitImage(
  platformKey: string,
  input: ImageSubmitInput,
  callbackUrl: string,
): Promise<ImageSubmitResult> {
  const prompt = input.prompt?.trim();
  if (!prompt) return { ok: false, error: "missing_prompt" };

  const usePhoto = Boolean(input.imageUrl);
  const url = usePhoto ? ENDPOINT_EDIT : ENDPOINT_GENERATE;
  const size = input.size ?? "1K";

  const payload: Record<string, unknown> = usePhoto
    ? {
        model: "openai/gpt-image-2",
        instruction: prompt,
        image_urls: [input.imageUrl, input.refImageUrl].filter((u): u is string => Boolean(u)),
        size,
        aspect_ratio: input.aspectRatio,
        callback_url: callbackUrl,
      }
    : {
        prompt,
        size,
        aspect_ratio: input.aspectRatio,
        callback_url: callbackUrl,
      };

  /* Checked BEFORE the submit, so an unreadable photo costs nothing and reports
     itself, instead of becoming a queued generation that fails two hops away. */
  if (usePhoto) {
    const inputImages = (payload.image_urls as string[]) ?? [];
    const unreachable = await firstUnreachableImage(inputImages);
    if (unreachable) {
      console.error(`[submit-image] input image not downloadable after retries: ${unreachable}`);
      return { ok: false, error: "input_image_unreachable" };
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${platformKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      detail?: string;
      message?: string;
    };

    if (!res.ok) {
      if (res.status === 402) return { ok: false, error: "picx_platform_credits_exhausted" };
      if (res.status === 403) return { ok: false, error: "picx_key_missing_scope" };
      return { ok: false, error: data.detail || data.message || `picx_error_${res.status}` };
    }
    if (!data.id) {
      /* A 200 carrying a finished `url` means this deployment of the API ignored
         callback_url and rendered synchronously. Reported as a failure rather
         than silently accepted: this app has no synchronous path left to fall
         back to, and treating a finished image as queued would strand the row. */
      return {
        ok: false,
        error: data.url ? "picx_ignored_callback_url" : "picx_accepted_without_generation_id",
      };
    }
    return { ok: true, picxGenerationId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "submit_failed" };
  }
}
