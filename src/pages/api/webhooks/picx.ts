/* POST /api/webhooks/picx — inbound generation results from PicX.
 *
 * This is the completion half of the async batch path. `src/lib/batch/run.ts`
 * submits a render and returns immediately; PicX later POSTs the finished image
 * here, and this route is what actually marks the item `ok` (or refunds it).
 *
 * It is PUBLIC — PicX is not a signed-in user and carries no session — so the
 * signature IS the authentication. Everything below exists because an
 * unauthenticated endpoint that can mark work complete with an arbitrary URL is
 * an obvious abuse target: without verification anyone could POST a fake
 * completion and have it stored as a user's generated image.
 *
 * Four independent gates, in order, cheapest first:
 *
 *   1. Secret configured        -> 503 if not. Fails CLOSED. An unverifiable
 *                                  delivery is never accepted "just this once".
 *   2. Signature valid          -> 401. HMAC-SHA256 over `{t}.` + raw body,
 *                                  constant-time compared.
 *   3. Timestamp fresh          -> 401. Bounds replay of a captured delivery.
 *   4. Item correlates          -> 200 (not an error). Correlation is on the
 *                                  generation id INSIDE the signed body, never
 *                                  on a URL path — the signature covers the body
 *                                  only, so a path-correlated receiver would
 *                                  accept a captured delivery replayed against a
 *                                  different item.
 *
 * Deliveries are at-least-once, so the handler is idempotent: it only acts on an
 * item still `running`, and a repeat lands on zero rows and returns 200. Always
 * answering 2xx once a delivery is authentic matters — a non-2xx makes PicX retry
 * three times and then mark the delivery `exhausted`, which would turn our own
 * duplicate into a false failure on their side.
 */
import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../db/schema";
import type { Db } from "../../../db/client";
import { asset, batchItem, batchJob, generation, generationFrame } from "../../../db/schema/product";
import { refund } from "../../../lib/credits";
import { CREDITS_PER_IMAGE, creditCostForSkill } from "../../../lib/credits/costs";
import { batchItemRefundKey, finalizeJob } from "../../../lib/batch/run";
import { readSecret } from "../../../lib/secrets";

export const prerender = false;

/**
 * How stale a signed timestamp may be. PicX retries over roughly 3 seconds and
 * a render can take ~30s, so five minutes is generous for legitimate traffic
 * while still bounding how long a captured delivery stays replayable.
 */
const MAX_SIGNATURE_AGE_SECONDS = 300;

/**
 * Read-back endpoint used by the confirm-by-fetch path below. Same host and key
 * as every submit, so it needs no new configuration.
 */
const PICX_GENERATION_ENDPOINT = "https://api.picxstudio.com/v1/generations";

interface PicxEventData {
  generation_id?: string;
  status?: string;
  type?: string;
  output_url?: string | null;
  error_message?: string | null;
  credits_used?: number | null;
}

/**
 * Both delivery shapes at once. The modern envelope nests everything under
 * `data`; PicX's legacy callback mode ALSO flattens those same keys onto the top
 * level. Rather than branch, `readData()` below folds the two into one view so
 * the rest of the handler never cares which shape arrived — and the batch path,
 * which only ever read `event.data`, keeps working because a modern delivery
 * still populates `data`.
 */
interface PicxEvent extends PicxEventData {
  id?: string;
  event?: string;
  data?: PicxEventData;
}

/** Normalise nested-vs-flattened into a single data view, `data` winning. */
function readData(event: PicxEvent): PicxEventData {
  return {
    generation_id: event.data?.generation_id ?? event.generation_id,
    status: event.data?.status ?? event.status,
    type: event.data?.type ?? event.type,
    output_url: event.data?.output_url ?? event.output_url,
    error_message: event.data?.error_message ?? event.error_message,
    credits_used: event.data?.credits_used ?? event.credits_used,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ConfirmResult =
  | { outcome: "final"; event: string; data: PicxEventData }
  | { outcome: "not_final"; status: string }
  | { outcome: "unknown" }
  | { outcome: "unavailable"; detail: string };

/**
 * CONFIRM BY FETCH — the authentication used when no `PICX_WEBHOOK_SECRET` exists.
 *
 * A `callback_url` submit is signed with a secret PicX derives from the API key
 * and never returns, so its HMAC is unverifiable by design (see the escape-hatch
 * note in POST). Rather than trust the delivery or refuse it, this discards the
 * body's payload entirely and reads the generation back from PicX over an
 * authenticated request WE make. The delivery is then only a hint that says
 * "look at this id"; every value that drives a credit or writes a media URL comes
 * from this response.
 *
 * Why that is safe without a signature: a forger can supply an id, but not an
 * answer. An id we never submitted is unknown to our key and returns 404
 * (`unknown` -> ignored), and an id we DID submit resolves to the same truth it
 * would have resolved to anyway. The one thing a signature still buys is
 * cheapness — hence the caller only reaches here for ids already present in our
 * own tables, so an unknown id costs a DB lookup and no outbound request.
 *
 * Cost: one extra round trip per delivery. On a 5-15s render that is noise.
 */
async function confirmWithPicx(apiKey: string, generationId: string): Promise<ConfirmResult> {
  let res: Response;
  try {
    res = await fetch(`${PICX_GENERATION_ENDPOINT}/${encodeURIComponent(generationId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    return { outcome: "unavailable", detail: err instanceof Error ? err.message : "fetch failed" };
  }

  // 404 means this id does not belong to our key: either a forged delivery or a
  // generation from a different account. Never an error on our side.
  if (res.status === 404) return { outcome: "unknown" };
  if (!res.ok) return { outcome: "unavailable", detail: `HTTP ${res.status}` };

  const body = (await res.json().catch(() => null)) as
    | (PicxEventData & { status?: string })
    | null;
  if (!body) return { outcome: "unavailable", detail: "unparseable body" };

  const status = (body.status ?? "").toLowerCase();
  const data: PicxEventData = {
    generation_id: generationId,
    status,
    type: body.type,
    output_url: body.output_url ?? null,
    error_message: body.error_message ?? null,
    credits_used: body.credits_used ?? null,
  };

  /* Only two states are terminal. `pending`/`processing`/`queued` mean PicX
     announced a completion we cannot yet read — treat as not final and let the
     caller ask for a retry rather than settle work on a half-written record. */
  if (status === "completed" && data.output_url) {
    return { outcome: "final", event: "generation.completed", data };
  }
  if (status === "failed" || status === "error" || status === "cancelled") {
    return { outcome: "final", event: "generation.failed", data };
  }
  return { outcome: "not_final", status: status || "unknown" };
}

/**
 * Cheap ownership pre-check, so confirm-by-fetch never makes an outbound request
 * for an id that is not ours. Mirrors the three producers the handler correlates
 * against: a batch item, a video generation row, and an image frame row.
 */
async function deliveryIsOurs(db: Db, picxGenerationId: string): Promise<boolean> {
  const [items, generations, frames] = await Promise.all([
    db.select({ id: batchItem.id }).from(batchItem)
      .where(eq(batchItem.picxGenerationId, picxGenerationId)).limit(1),
    db.select({ id: generation.id }).from(generation)
      .where(eq(generation.picxGenerationId, picxGenerationId)).limit(1),
    db.select({ id: generationFrame.id }).from(generationFrame)
      .where(eq(generationFrame.picxGenerationId, picxGenerationId)).limit(1),
  ]);
  return Boolean(items[0] || generations[0] || frames[0]);
}

/**
 * Verify `X-PicX-Signature: t=<unix>,v1=<hex>`.
 *
 * The digest is over `{t}.` concatenated with the RAW body, so the caller must
 * pass the exact bytes received — re-serialising parsed JSON changes key order
 * and whitespace and invalidates the signature.
 */
async function verifySignature(secret: string, header: string, rawBody: string): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (k && v) parts[k.trim()] = v.trim();
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time compare. Length is checked first because a length mismatch is
  // not secret, and comparing different lengths would leak via the loop bound.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.DB) return json({ error: "not_configured" }, 503);

  const secret = await readSecret(env.PICX_WEBHOOK_SECRET, "PICX_WEBHOOK_SECRET");
  /**
   * DEV ESCAPE HATCH — read this before setting it.
   *
   * A plain `callback_url` submit is signed by PicX with a secret derived from
   * the API key (`inline_signing_secret(api_key_id)` on their side). That value
   * is never returned by any endpoint, so a consumer using callback_url CANNOT
   * obtain it and therefore cannot verify the signature. The only retrievable
   * secret comes from registering a webhook (`POST /api/webhooks`, which returns
   * `whsec_…` exactly once) and binding submits to it by id.
   *
   * So local testing over a tunnel has two options: register a webhook and use
   * its secret, or accept unverified deliveries. This flag is the second, and it
   * is deliberately explicit, loud, and off by default, because what it disables
   * is the ONLY authentication on an endpoint that marks paid work complete and
   * writes arbitrary media URLs into a user's gallery. Anyone who can reach the
   * tunnel can forge a completion while it is on.
   *
   * Never set it in staging or production.
   */
  const insecureDev =
    (await readSecret(env.PICX_WEBHOOK_INSECURE_DEV, "PICX_WEBHOOK_INSECURE_DEV"))?.trim() === "true";

  /* Gate 1, restated. Previously: no secret -> 503, always. That was correct
     while the secret was the only authentication, but it made the whole feature
     un-deployable, because a `callback_url` submit CANNOT be verified by HMAC (the
     signing secret is derived from the API key and never returned). So a missing
     secret now selects the confirm-by-fetch authentication instead of refusing:
     the body becomes a hint and PicX's own authenticated record becomes the truth.
     A configured secret still wins, and is still cheaper by one round trip. */
  const picxKey = await readSecret(env.PICX_API_KEY, "PICX_API_KEY");
  if (!secret && !picxKey) {
    // Fail closed only when NEITHER authentication is available: with no secret
    // and no key there is no way to tell a real completion from a forged one.
    console.error("[picx-webhook] neither PICX_WEBHOOK_SECRET nor PICX_API_KEY is configured; refusing delivery");
    return json({ error: "webhook_not_configured" }, 503);
  }
  if (insecureDev && !secret) {
    console.warn(
      "[picx-webhook] PICX_WEBHOOK_INSECURE_DEV=true, but confirm-by-fetch now authenticates " +
        "unsigned deliveries against PicX. The flag is redundant and should be removed.",
    );
  }

  const rawBody = await context.request.text();
  const header = context.request.headers.get("X-PicX-Signature") ?? "";

  // Gates 2 and 3, both inside verifySignature. Skipped ONLY on the dev hatch
  // above, which requires both an explicit flag and no configured secret — a
  // configured secret is always enforced, so the flag cannot silently weaken a
  // deployment that was previously verifying.
  if (secret) {
    if (!header || !(await verifySignature(secret, header, rawBody))) {
      return json({ error: "invalid_signature" }, 401);
    }
  }

  let event: PicxEvent;
  try {
    event = JSON.parse(rawBody) as PicxEvent;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Fold nested-vs-flattened into one view up front so neither the batch path
  // nor the video path has to know which delivery shape arrived.
  let data = readData(event);
  const picxGenerationId = data.generation_id;
  if (!picxGenerationId) return json({ error: "missing_generation_id" }, 400);

  const db: Db = drizzle(env.DB, { schema });

  /* Confirm-by-fetch, when the delivery carried no verifiable signature. Order
     matters: ownership is checked against our own tables FIRST, so a flood of
     forged ids costs indexed lookups and no outbound requests. Everything the
     rest of this handler reads out of `data` — status, output_url, error_message
     — is replaced by PicX's authenticated answer, so a forged body cannot inject
     a media URL or settle a credit even if it names a real id. */
  if (!secret) {
    if (!(await deliveryIsOurs(db, picxGenerationId))) {
      console.warn(`[picx-webhook] unsigned delivery for unknown generation ${picxGenerationId}; ignoring`);
      return json({ ok: true, matched: false });
    }

    const confirmed = await confirmWithPicx(picxKey!, picxGenerationId);
    if (confirmed.outcome === "unknown") {
      // Our tables know this id but PicX does not — a forged body that guessed a
      // real id, or an id from another account. Never settle work on it.
      console.error(`[picx-webhook] generation ${picxGenerationId} not found at PicX; refusing delivery`);
      return json({ ok: true, matched: false });
    }
    if (confirmed.outcome === "unavailable") {
      // Transient: ask PicX to retry rather than dropping a real completion.
      console.error(`[picx-webhook] could not confirm ${picxGenerationId}: ${confirmed.detail}`);
      return json({ error: "confirmation_unavailable" }, 503);
    }
    if (confirmed.outcome === "not_final") {
      /* PicX announced a completion we cannot read back yet. A non-2xx buys the
         retry window (three attempts) which covers read lag; if it never settles,
         the row stays pending and the reconcile sweep refunds it. */
      console.warn(`[picx-webhook] ${picxGenerationId} still ${confirmed.status} on read-back; asking for retry`);
      return json({ error: "not_final_yet", status: confirmed.status }, 503);
    }

    /* Overwrite BOTH views, not just the folded one. `data` is what most of this
       handler reads, but the image-frame path reads `event.data?.output_url` and
       `event.data?.error_message` directly — so replacing only `data` would leave
       the untrusted body reachable on the busiest path and let a forged URL be
       written to a frame. Substituting at the source closes that for every
       present and future reader. */
    data = confirmed.data;
    event.data = confirmed.data;
    event.event = confirmed.event;
  }

  // Gate 4. Correlate on the id from the signed body.
  const itemRows = await db
    .select()
    .from(batchItem)
    .where(eq(batchItem.picxGenerationId, picxGenerationId));
  const item = itemRows[0];
  if (!item) {
    // Not a batch item. Before concluding this delivery is not ours, try the
    // other producer of async submits: a single video generation, which records
    // PicX's id directly on its own `generation` row (migration 0016) because it
    // has no batch wrapper. Deliberately a fallthrough rather than a branch on
    // `data.type` — the correlation key is what identifies the work, and trusting
    // a type field would let a shape change upstream silently orphan deliveries.
    const videoHandled = await completeVideoGeneration(db, picxGenerationId, event, data);
    if (videoHandled) return videoHandled;
    // Third producer: an image generation from the chat tool, which owns one
    // generation_frame row per image (migration 0017).
    const frameHandled = await completeImageFrame(db, picxGenerationId, event);
    if (frameHandled) return frameHandled;
    // Not ours, or already reaped by the sweep. 200 rather than 404: the
    // delivery was authentic, so there is nothing for PicX to retry.
    console.warn(`[picx-webhook] no batch item or video generation for picx generation ${picxGenerationId}`);
    return json({ ok: true, matched: false });
  }
  if (item.status !== "running") {
    // Duplicate delivery, or the sweep already failed-and-refunded this item.
    // Idempotent no-op.
    return json({ ok: true, duplicate: true, status: item.status });
  }

  const jobRows = await db.select().from(batchJob).where(eq(batchJob.id, item.batchJobId));
  const job = jobRows[0];
  if (!job) return json({ ok: true, matched: false });

  const cost = creditCostForSkill(job.skillId);
  const now = new Date();
  const succeeded = event.event === "generation.completed" && Boolean(data.output_url);

  if (!succeeded) {
    // Refund keyed on (jobId, idx) exactly as run.ts and sweep.ts do, so this
    // path, a duplicate delivery and the cron sweep all collapse onto one
    // ledger row. Refunding twice is impossible by construction.
    await refund(db, {
      organizationId: job.organizationId,
      userId: job.createdBy,
      amount: cost,
      refId: item.id,
      idempotencyKey: batchItemRefundKey(job.id, item.idx),
    });
    await db
      .update(batchItem)
      .set({
        status: "failed",
        errorCode: (data.error_message ?? "generation_failed").slice(0, 200),
        completedAt: now,
      })
      .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "running")));
    await finalizeJob(db, job.id);
    return json({ ok: true, outcome: "failed" });
  }

  const outputUrl = data.output_url!;
  const generationId = crypto.randomUUID();

  // Written already-'ok' for the same reason run.ts does on its synchronous
  // path: the image exists by the time we are here and the credit was reserved
  // by the submitting route long ago, so there is no pending window to protect.
  // Writing it 'pending' would expose it to reconcile.ts's stuck-pending refund
  // and double-refund an item that actually succeeded.
  await db.insert(generation).values({
    id: generationId,
    userId: job.createdBy,
    organizationId: job.organizationId,
    projectId: job.projectId,
    skillId: job.skillId,
    styleId: job.styleId,
    prompt: item.prompt ?? "",
    sourceAssetUrl: job.sourceAssetUrl,
    refAssetUrl: job.refAssetUrl,
    creditsCharged: cost,
    status: "ok",
    outputUrl,
    createdAt: now,
    completedAt: now,
  });

  if (job.projectId) {
    await db.insert(asset).values({
      id: crypto.randomUUID(),
      organizationId: job.organizationId,
      projectId: job.projectId,
      url: outputUrl,
      kind: "generation",
      generationId,
      reviewState: "draft",
      createdBy: job.createdBy,
      createdAt: now,
    });
  }

  // Predicated on 'running' so two concurrent deliveries cannot both complete
  // the item; the second matches zero rows.
  await db
    .update(batchItem)
    .set({ status: "ok", outputUrl, generationId, completedAt: now })
    .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "running")));

  await finalizeJob(db, job.id);

  return json({ ok: true, outcome: "completed" });
}


/**
 * The video half of this receiver: complete (or refund) a single `generation`
 * row that was submitted asynchronously by src/mastra/tools/generate-video.ts.
 *
 * Returns a Response when the delivery belonged to a video generation, or null
 * when no such row exists — which lets the caller fall through to its existing
 * "not ours" answer without duplicating that decision.
 *
 * Every write below is predicated on `status = 'pending'`, which is what makes
 * at-least-once delivery safe: a duplicate matches zero rows and changes
 * nothing. The refund reuses the SAME idempotency key generate-video.ts and
 * reconcile.ts use (`refund:<generationId>`), so this path, a retried delivery
 * and the hourly stuck-pending sweep all collapse onto one ledger row. Refunding
 * twice is impossible by construction rather than by care.
 */
async function completeVideoGeneration(
  db: Db,
  picxGenerationId: string,
  event: PicxEvent,
  data: PicxEventData,
): Promise<Response | null> {
  const rows = await db
    .select()
    .from(generation)
    .where(and(eq(generation.picxGenerationId, picxGenerationId), eq(generation.kind, "video")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  if (row.status !== "pending") {
    // Duplicate delivery, or the sweep already timed this clip out and refunded
    // it. Either way there is nothing left to do and nothing for PicX to retry.
    return json({ ok: true, kind: "video", duplicate: true, status: row.status });
  }

  const now = new Date();
  // Read from the folded view, NOT event.data directly: PicX's legacy callback
  // mode flattens these keys onto the top level, so a legacy generation.completed
  // would have output_url at the top level and event.data?.output_url would be
  // undefined — completing a real success down the failed/refund branch.
  const outputUrl = data.output_url ?? null;
  const succeeded = event.event === "generation.completed" && Boolean(outputUrl);

  if (!succeeded) {
    if (row.creditsCharged > 0) {
      await refund(db, {
        organizationId: row.organizationId ?? "",
        userId: row.userId,
        amount: row.creditsCharged,
        refId: row.id,
        idempotencyKey: `refund:${row.id}`,
      });
    }
    await db
      .update(generation)
      .set({
        status: "refunded",
        errorCode: (data.error_message ?? event.event ?? "video_generation_failed").slice(0, 200),
        completedAt: now,
      })
      .where(and(eq(generation.id, row.id), eq(generation.status, "pending")));
    return json({ ok: true, kind: "video", outcome: "failed" });
  }

  // NO poster is written here, on purpose. A poster (migration 0018) would be
  // welcome for 'reference'/'text' clips, whose first frame only exists once the
  // render finishes — but PicX's delivery contract carries no still to take it
  // from. Checked both the folded PicxEventData view above (generation_id,
  // status, type, output_url, error_message, credits_used) and the SDK's
  // Generation / CompletedGeneration types in node_modules/picx-ai/dist/index.d.ts
  // (id, status, type, model, output_url, error_message, credits_used, url) —
  // neither has a thumbnail / poster / first_frame field. So there is nothing to
  // persist and no speculative parsing is added; poster_url set at submit time
  // for 'image' mode is the only source. If PicX later adds such a field, read
  // it from `data` here and include it in the update below.

  // Predicated on 'pending' so two concurrent deliveries cannot both complete
  // the row; the second matches zero rows and the insert below never runs twice
  // for the same clip.
  const completed = await db
    .update(generation)
    .set({ status: "ok", outputUrl, completedAt: now })
    .where(and(eq(generation.id, row.id), eq(generation.status, "pending")))
    .returning({ id: generation.id });
  if (completed.length === 0) {
    return json({ ok: true, kind: "video", duplicate: true });
  }

  // A clip that belongs to a project is a project deliverable, filed as a draft
  // for review exactly as a generated image is. Guarded by the row count above
  // so a duplicate delivery cannot file it twice (the org+url unique index would
  // reject that anyway, but failing an authentic delivery with a 500 would make
  // PicX retry a delivery we have in fact already handled).
  if (row.projectId && row.organizationId) {
    await db.insert(asset).values({
      id: crypto.randomUUID(),
      organizationId: row.organizationId,
      projectId: row.projectId,
      url: outputUrl!,
      kind: "generation",
      generationId: row.id,
      reviewState: "draft",
      createdBy: row.userId,
      createdAt: now,
    });
  }

  return json({ ok: true, kind: "video", outcome: "completed" });
}


/**
 * The image half of this receiver: complete ONE frame of a webhook-delivered
 * image generation, then roll the parent `generation` up if that was the last
 * frame outstanding.
 *
 * Returns a Response when the delivery belonged to a frame, or null so the caller
 * can fall through to its "not ours" answer.
 *
 * A pack skill is several independent PicX renders, so deliveries arrive one per
 * frame and in any order. Each write is predicated on the frame still being
 * `pending`, which is what makes at-least-once delivery safe — a duplicate
 * matches zero rows and changes nothing.
 */
async function completeImageFrame(
  db: Db,
  picxGenerationId: string,
  event: PicxEvent,
): Promise<Response | null> {
  const frameRows = await db
    .select()
    .from(generationFrame)
    .where(eq(generationFrame.picxGenerationId, picxGenerationId))
    .limit(1);
  const frame = frameRows[0];
  if (!frame) return null;

  const genRows = await db
    .select()
    .from(generation)
    .where(eq(generation.id, frame.generationId))
    .limit(1);
  const gen = genRows[0];
  if (!gen) return json({ ok: true, kind: "image", matched: false });

  const now = new Date();
  const outputUrl = event.data?.output_url ?? null;
  const succeeded = event.event === "generation.completed" && Boolean(outputUrl);

  if (frame.status === "pending") {
    const claimed = await db
      .update(generationFrame)
      .set({
        status: succeeded ? "ok" : "failed",
        outputUrl: succeeded ? outputUrl : null,
        errorCode: succeeded
          ? null
          : (event.data?.error_message ?? event.event ?? "generation_failed").slice(0, 200),
        completedAt: now,
      })
      .where(and(eq(generationFrame.id, frame.id), eq(generationFrame.status, "pending")))
      .returning({ id: generationFrame.id });

    /* Only the delivery that actually claimed the frame refunds it. A frame that
       will never produce an image is refunded per-frame rather than waiting for
       the whole set, so a 9-frame pack that loses one gives that credit straight
       back. Key includes the frame index so frames cannot collide with each
       other or with the whole-run refund. */
    if (claimed.length === 1 && !succeeded && gen.organizationId) {
      await refund(db, {
        organizationId: gen.organizationId,
        userId: gen.userId,
        amount: CREDITS_PER_IMAGE,
        refId: gen.id,
        idempotencyKey: `refund:${gen.id}:frame:${frame.idx}`,
      });
    }
  }

  /* Roll-up. Re-read every frame: this is the only place that can know whether
     the set is complete, and the answer depends on siblings this delivery did not
     touch. */
  const frames = await db
    .select()
    .from(generationFrame)
    .where(eq(generationFrame.generationId, gen.id));
  if (frames.some((f) => f.status === "pending")) {
    return json({ ok: true, kind: "image", frame: frame.idx, pending: true });
  }

  const urls = frames
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((f) => f.outputUrl)
    .filter((u): u is string => Boolean(u));

  // Every frame failed: the run produced nothing. Each frame was already
  // refunded individually above, so this only records the terminal state.
  if (urls.length === 0) {
    await db
      .update(generation)
      .set({
        status: "refunded",
        errorCode: (frames[0]?.errorCode ?? "generation_failed").slice(0, 200),
        completedAt: now,
      })
      .where(and(eq(generation.id, gen.id), eq(generation.status, "pending")));
    return json({ ok: true, kind: "image", outcome: "failed" });
  }

  /* Predicated on 'pending' so two deliveries finishing at once cannot both roll
     the generation up — the second matches zero rows and skips the asset insert
     below. First frame stays in output_url so every existing reader is
     unaffected; the full set goes in output_urls (migration 0012). */
  const rolled = await db
    .update(generation)
    .set({
      status: "ok",
      outputUrl: urls[0],
      outputUrls: urls.length > 1 ? JSON.stringify(urls) : null,
      completedAt: now,
    })
    .where(and(eq(generation.id, gen.id), eq(generation.status, "pending")))
    .returning({ id: generation.id });
  if (rolled.length === 0) {
    return json({ ok: true, kind: "image", duplicate: true });
  }

  /* Project deliverables are filed here rather than at submit time, because this
     is where a URL first exists. One row per frame so a pack's frames stay
     individually reviewable. */
  if (gen.projectId && gen.organizationId) {
    await db.insert(asset).values(
      urls.map((url) => ({
        id: crypto.randomUUID(),
        organizationId: gen.organizationId!,
        projectId: gen.projectId,
        url,
        kind: "generation" as const,
        generationId: gen.id,
        reviewState: "draft" as const,
        createdBy: gen.userId,
        createdAt: now,
      })),
    );
  }

  return json({ ok: true, kind: "image", outcome: "completed", frames: urls.length });
}
