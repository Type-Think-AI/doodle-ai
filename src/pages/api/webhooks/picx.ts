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
import { asset, batchItem, batchJob, generation } from "../../../db/schema/product";
import { refund } from "../../../lib/credits";
import { creditCostForSkill } from "../../../lib/credits/costs";
import { batchItemRefundKey, finalizeJob } from "../../../lib/batch/run";
import { readSecret } from "../../../lib/secrets";

export const prerender = false;

/**
 * How stale a signed timestamp may be. PicX retries over roughly 3 seconds and
 * a render can take ~30s, so five minutes is generous for legitimate traffic
 * while still bounding how long a captured delivery stays replayable.
 */
const MAX_SIGNATURE_AGE_SECONDS = 300;

interface PicxEvent {
  id?: string;
  event?: string;
  data?: {
    generation_id?: string;
    status?: string;
    type?: string;
    output_url?: string | null;
    error_message?: string | null;
    credits_used?: number | null;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  if (!secret) {
    // Gate 1. Fail closed: accepting unverified completions would let anyone
    // write arbitrary image URLs into a user's gallery and settle their credits.
    console.error("[picx-webhook] PICX_WEBHOOK_SECRET is not configured; refusing delivery");
    return json({ error: "webhook_not_configured" }, 503);
  }

  const rawBody = await context.request.text();
  const header = context.request.headers.get("X-PicX-Signature") ?? "";

  // Gates 2 and 3, both inside verifySignature.
  if (!header || !(await verifySignature(secret, header, rawBody))) {
    return json({ error: "invalid_signature" }, 401);
  }

  let event: PicxEvent;
  try {
    event = JSON.parse(rawBody) as PicxEvent;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const picxGenerationId = event.data?.generation_id;
  if (!picxGenerationId) return json({ error: "missing_generation_id" }, 400);

  const db: Db = drizzle(env.DB, { schema });

  // Gate 4. Correlate on the id from the signed body.
  const itemRows = await db
    .select()
    .from(batchItem)
    .where(eq(batchItem.picxGenerationId, picxGenerationId));
  const item = itemRows[0];
  if (!item) {
    // Not ours, or already reaped by the sweep. 200 rather than 404: the
    // delivery was authentic, so there is nothing for PicX to retry.
    console.warn(`[picx-webhook] no batch item for picx generation ${picxGenerationId}`);
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
  const succeeded = event.event === "generation.completed" && Boolean(event.data?.output_url);

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
        errorCode: (event.data?.error_message ?? "generation_failed").slice(0, 200),
        completedAt: now,
      })
      .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "running")));
    await finalizeJob(db, job.id);
    return json({ ok: true, outcome: "failed" });
  }

  const outputUrl = event.data!.output_url!;
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
