import type { APIContext } from "astro";
import { PicX, PicXError } from "picx-ai";

export const prerender = false;

/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with:
 *   - file: the image File
 *   - apiKey: the user's PicX API key
 *
 * Forwards to the PicX managed-assets API (POST /v1/assets)
 * and returns the CDN-backed public URL.
 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function POST(context: APIContext) {
  try {
    const formData = await context.request.formData();
    const file = formData.get("file");
    const apiKey = formData.get("apiKey");

    if (
      !file ||
      typeof file === "string" ||
      typeof (file as File).type !== "string" ||
      typeof (file as File).arrayBuffer !== "function" ||
      typeof apiKey !== "string" ||
      !apiKey.trim()
    ) {
      return json(
        { error: "An image file and PicX API key are required" },
        400
      );
    }

    const image = file as File;

    if (!image.type.startsWith("image/")) {
      return json({ error: "Only image files are accepted" }, 400);
    }

    if (image.size === 0) {
      return json({ error: "The selected image is empty" }, 400);
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return json({ error: "Images must be 20 MB or smaller" }, 400);
    }

    // Use the published PicX SDK so Doodle AI stays aligned with the public
    // managed-assets contract and its multipart handling.
    const asset = await new PicX(apiKey).assets.create({
      file: image,
      filename: image.name || "photo.jpg",
    });

    return json({ url: asset.url, id: asset.id });
  } catch (err) {
    if (err instanceof PicXError) {
      const status =
        err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
      return json({ error: err.message }, status);
    }

    const message = err instanceof Error ? err.message : "Upload failed";
    return json({ error: `Server error: ${message}` }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
