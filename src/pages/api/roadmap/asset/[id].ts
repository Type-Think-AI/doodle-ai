/**
 * Binary assets for the roadmap board: /api/roadmap/asset/:id
 *
 *   PUT  — upload a pasted/dropped image or video (signed-in users only)
 *   GET  — serve it back, immutably cached
 *
 * This is the half of the feature that makes the board worth having over a
 * text-row feedback table: an artist can paste a screenshot of a doodle that
 * came out wrong, draw an arrow at the exact problem, and stick a note beside
 * it. None of that survives a `text` column.
 *
 * R2 rather than the Durable Object's SQLite: the DO's storage is the document
 * (shape records, which are small), and stuffing megabytes of PNG into it would
 * bill against a 5 GB SQLite allowance and bloat every room snapshot.
 */
import type { APIContext } from "astro";
import { optionalAuth } from "../../../../lib/auth/guards";

export const prerender = false;

/** Matches tldraw's generated asset ids; keeps the R2 keyspace predictable. */
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

/**
 * Only formats a browser will render inline. An allow-list, not a block-list:
 * this endpoint serves user-uploaded bytes from our own origin, so letting
 * through text/html or image/svg+xml would be a stored-XSS vector on a public,
 * signed-in-user-facing page.
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

/** 25 MB. A screenshot is well under this; an unbounded PUT is a free disk. */
const MAX_BYTES = 25 * 1024 * 1024;

function key(id: string): string {
  return `roadmap/${id}`;
}

export async function PUT(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.ROADMAP_ASSETS) return new Response("Asset storage unavailable", { status: 503 });

  // Uploads are writes, so they need an account — same reasoning as the
  // 'suggest' tier in src/roadmap/access.ts. Anonymous upload on a public
  // board is an open file host.
  const user = await optionalAuth(context);
  if (!user) return new Response("Sign in to upload", { status: 401 });

  const id = context.params.id ?? "";
  if (!ID_PATTERN.test(id)) return new Response("Bad asset id", { status: 400 });

  const contentType = context.request.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.has(contentType)) {
    return new Response(`Unsupported content type: ${contentType || "none"}`, { status: 415 });
  }

  // Reject on the declared length before reading the body where possible, so an
  // oversized upload costs us a header rather than 25 MB of transfer.
  const declared = Number(context.request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return new Response("Asset too large", { status: 413 });
  }

  const body = await context.request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Asset too large", { status: 413 });

  // Never overwrite an existing key: asset ids come from the client, and letting
  // a PUT replace someone else's uploaded image would be a quiet defacement of
  // any board that references it.
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

  // Content type is echoed from what PUT validated against ALLOWED_TYPES, and
  // nosniff stops a browser from reinterpreting the bytes as something else.
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
