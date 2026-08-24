import type { APIContext } from "astro";
import { PicX, PicXError } from "picx-ai";
import { requireAuth } from "../../lib/auth/guards";

export const prerender = false;

/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with a single `file` field. Uploads are only
 * available to signed-in users and always use the server-owned PicX key.
 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export async function POST(context: APIContext) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;

  const picxKey = (context.locals as { runtime?: { env?: Env } })?.runtime?.env?.PICX_API_KEY;
  if (!picxKey?.trim()) {
    return json({ error: "Image uploads are not configured right now" }, 503);
  }

  try {
    const formData = await context.request.formData();
    const file = formData.get("file");

    if (
      !file ||
      typeof file === "string" ||
      typeof (file as File).type !== "string" ||
      typeof (file as File).arrayBuffer !== "function"
    ) {
      return json({ error: "An image file is required" }, 400);
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

    const asset = await new PicX(picxKey).assets.create({
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

    console.error("POST /api/upload failed:", err);
    return json({ error: "Upload failed. Please try again." }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
