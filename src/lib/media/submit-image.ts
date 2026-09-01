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
