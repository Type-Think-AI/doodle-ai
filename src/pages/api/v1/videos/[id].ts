/* GET /api/v1/videos/:id — what the browser polls while a clip renders.
 *
 * This is deliberately a read of OUR OWN row, not a proxy for PicX's
 * `poll_url`. The upstream result arrives once, by webhook
 * (src/pages/api/webhooks/picx.ts), and lands on the `generation` row; this
 * route is a single indexed D1 lookup on the primary key. So a browser sitting
 * on a 45-second render costs us ~10 local reads and ZERO upstream calls, and
 * the platform API key never leaves the server.
 *
 * Scoped to the caller's org, so a job id is not a capability: guessing one
 * belonging to another team returns the same 404 as one that does not exist.
 */
import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { generation, generationFrame } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { VIDEO_ESTIMATED_SECONDS } from "../../../../lib/video/constants";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { generation: ["create"] });
  if (org instanceof Response) return org;

  const id = context.params.id;
  if (!id) return apiError("not_found", "That clip doesn't exist.", 404);

  const db = getDb(context);
  const rows = await db
    .select()
    .from(generation)
    /* Both kinds. Images are webhook-delivered too, so this is the single
       row-watching endpoint for any queued generation — the kind filter that
       used to be here would have 404'd every image job. */
    .where(and(eq(generation.id, id), eq(generation.organizationId, org.orgId)))
    .limit(1);
  const row = rows[0];
  if (!row) return apiError("not_found", "That generation doesn't exist.", 404);

  /* Frame URLs in order, for a pack that is still filling in. Read only for
     images — a video has no frame rows. */
  const frames =
    row.kind === "image"
      ? await db
          .select({
            idx: generationFrame.idx,
            status: generationFrame.status,
            outputUrl: generationFrame.outputUrl,
          })
          .from(generationFrame)
          .where(eq(generationFrame.generationId, row.id))
      : [];

  return apiJson({
    video: {
      id: row.id,
      /* 'pending' | 'ok' | 'failed' | 'refunded'. 'refunded' is the honest
         terminal state for a failure: the credits are already back, and the
         client says so rather than implying the user paid for nothing. */
      status: row.status,
      outputUrl: row.outputUrl,
      errorCode: row.errorCode,
      /* Always 'video' here (the query pins kind='video'), but returned
         explicitly because it is part of this endpoint's contract — the poller
         should not have to infer it from the route it hit. */
      kind: row.kind,
      skillId: row.skillId,
      videoMode: row.videoMode,
      /* First-frame still (migration 0018). Non-null only for a clip submitted
         in 'image' mode, where the seed image IS frame one; 'reference'/'text'
         clips and every image row carry null. The poller passes it to the
         <video>'s poster so a completed clip has a still before its bytes load. */
      posterUrl: row.posterUrl,
      durationSeconds: row.durationSeconds,
      resolution: row.resolution,
      creditsCharged: row.creditsCharged,
      estimatedSeconds: VIDEO_ESTIMATED_SECONDS,
      createdAt: row.createdAt.getTime(),
      completedAt: row.completedAt?.getTime() ?? null,
      /* Every image this run has produced so far, in frame order. Lets the client
         reveal a pack progressively instead of waiting for all nine. */
      outputUrls: frames
        .slice()
        .sort((a, b) => a.idx - b.idx)
        .map((f) => f.outputUrl)
        .filter((u): u is string => Boolean(u)),
      framesTotal: frames.length,
      framesPending: frames.filter((f) => f.status === "pending").length,
    },
  });
}
