/**
 * Binary assets for board canvases: /api/boards/asset/:id
 *
 *   PUT  — upload a pasted/dropped image (signed-in users only)
 *   GET  — serve it back, immutably cached
 *
 * Reuses the ROADMAP_ASSETS R2 bucket with a `boards/` key prefix. Rationale:
 * generated doodles are permanent PicX CDN URLs and need NO R2 write at all —
 * only user-uploaded reference images (pasted screenshots, drag-and-drop files)
 * need the asset route. The volume is low and the access pattern is identical
 * to the roadmap's uploads, so a separate bucket would just be another thing to
 * configure/monitor with no isolation benefit (both are user-uploaded, both are
 * immutable, both are serve-forever).
 *
 * If isolation is later desired, swapping to a BOARD_ASSETS binding is a
 * one-line env change — the key function already namespaces under `boards/`.
 */
import type { APIContext } from "astro";
import { optionalAuth } from "../../../../lib/auth/guards";

export const prerender = false;

/** Matches tldraw's generated asset ids. */
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

/**
 * Only formats a browser will render inline. An allow-list, not a block-list:
 * this endpoint serves user-uploaded bytes from our own origin, so letting
 * through text/html or image/svg+xml would be stored-XSS.
 */
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
]);

/** 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Namespaced under `boards/` in the shared ROADMAP_ASSETS bucket. */
function key(id: string): string {
  return `boards/${id}`;
}

export async function PUT(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.ROADMAP_ASSETS) return new Response("Asset storage unavailable", { status: 503 });

  const user = await optionalAuth(context);
  if (!user) return new Response("Sign in to upload", { status: 401 });

  const id = context.params.id ?? "";
  if (!ID_PATTERN.test(id)) return new Response("Bad asset id", { status: 400 });

  const contentType = context.request.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.has(contentType)) {
    return new Response(`Unsupported content type: ${contentType || "none"}`, { status: 415 });
  }

  const declared = Number(context.request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return new Response("Asset too large", { status: 413 });
  }

  const body = await context.request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Asset too large", { status: 413 });

  // Never overwrite: asset ids come from the client, and letting a PUT replace
  // someone else's uploaded image would be quiet defacement.
  const existing = await env.ROADMAP_ASSETS.head(key(id));
  if (existing) return new Response(null, { status: 204 });

  await env.ROADMAP_ASSETS.put(key(id), body, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uploadedBy: user.id },
  });

  return new Response(null, { status: 201 });
}

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.ROADMAP_ASSETS) return new Response("Asset storage unavailable", { status: 503 });

  const id = context.params.id ?? "";
  if (!ID_PATTERN.test(id)) return new Response("Bad asset id", { status: 400 });

  const object = await env.ROADMAP_ASSETS.get(key(id));
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
