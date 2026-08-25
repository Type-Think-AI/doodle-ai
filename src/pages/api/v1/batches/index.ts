/* POST|GET /api/v1/batches
 *
 * The HTTP entrypoint for the batch/variant runner in src/lib/batch/ — that
 * module has no caller anywhere else in the codebase, so this route is what
 * actually makes "generate 8 variants" reachable. See the plan's §5 for why
 * `ctx.waitUntil()` fan-out (not a queue, not a Workflow) is the right
 * primitive here.
 */
import type { APIContext } from "astro";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { batchItem, batchJob } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { intParam, newId, optStr, readJson } from "../../../../lib/api/body";
import { creditCostForSkill } from "../../../../lib/credits/costs";
import { spend } from "../../../../lib/credits";
import { isGenerationMode } from "../../../../lib/batch/prompt";
import { runBatch } from "../../../../lib/batch/run";
import type { BatchDto, BatchItemDto } from "../../../../lib/api/dto";

export const prerender = false;

const MAX_VARIANTS = 12;
const MIN_VARIANTS = 2;
const DESCRIPTION_MAX_LEN = 500;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

function toBatchDto(
  job: typeof batchJob.$inferSelect,
  items: { idx: number; status?: string; outputUrl?: string | null; errorCode?: string | null }[],
): BatchDto {
  const itemDtos: BatchItemDto[] = items
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((it) => ({
      idx: it.idx,
      status: (it.status ?? "queued") as BatchItemDto["status"],
      outputUrl: it.outputUrl ?? null,
      errorCode: it.errorCode ?? null,
    }));
  return {
    id: job.id,
    status: job.status as BatchDto["status"],
    skillId: job.skillId,
    variantCount: job.variantCount,
    creditsReserved: job.creditsReserved,
    items: itemDtos,
    createdAt: job.createdAt.getTime(),
    completedAt: job.completedAt?.getTime() ?? null,
  };
}

/** GET /api/v1/batches?limit=&projectId= — most recent batches for the team. */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { batch: ["create"] });
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);

  const db = getDb(context);
  const jobs = await db
    .select()
    .from(batchJob)
    .where(eq(batchJob.organizationId, org.orgId))
    .orderBy(desc(batchJob.createdAt))
    .limit(limit);

  const dtos = await Promise.all(
    jobs.map(async (job) => {
      const items = await db.select().from(batchItem).where(eq(batchItem.batchJobId, job.id));
      return toBatchDto(job, items);
    }),
  );

  return apiJson({ batches: dtos });
}

/**
 * POST /api/v1/batches — `{ skillId, variantCount, styleId?, description?,
 * sourceAssetUrl?, refAssetUrl?, projectId? }`.
 *
 * Credits for the whole run are reserved up front with a single `spend()`
 * keyed `batch:<jobId>` — an all-or-nothing reservation, matching the plan's
 * §5. Returns 202 immediately; poll `GET /api/v1/batches/:id` for progress.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { batch: ["create"] });
  if (org instanceof Response) return org;

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const skillId = optStr(body.skillId);
  if (!skillId || !isGenerationMode(skillId)) return apiError("bad_request", "Unknown `skillId`.", 400);

  const variantCount = typeof body.variantCount === "number" ? Math.floor(body.variantCount) : NaN;
  if (!Number.isFinite(variantCount) || variantCount < MIN_VARIANTS || variantCount > MAX_VARIANTS) {
    return apiError("bad_request", `\`variantCount\` must be between ${MIN_VARIANTS} and ${MAX_VARIANTS}.`, 400);
  }

  const styleId = optStr(body.styleId);
  const description = optStr(body.description)?.slice(0, DESCRIPTION_MAX_LEN) ?? null;
  const sourceAssetUrl = optStr(body.sourceAssetUrl);
  const refAssetUrl = optStr(body.refAssetUrl);
  const projectId = optStr(body.projectId);

  const perItemCost = creditCostForSkill(skillId);
  const creditsReserved = perItemCost * variantCount;

  const jobId = newId();
  const db = getDb(context);

  const reservation = await spend(db, {
    organizationId: org.orgId,
    userId: org.user.id,
    amount: creditsReserved,
    reason: "generation",
    refId: jobId,
    idempotencyKey: `batch:${jobId}`,
  });
  if (!reservation.ok) {
    return apiError(
      "insufficient_credits",
      `This batch needs ${creditsReserved} credits — the team only has ${reservation.balance}.`,
      402,
      { balance: reservation.balance, required: reservation.required },
    );
  }

  const now = new Date();
  const job = {
    id: jobId,
    organizationId: org.orgId,
    projectId: projectId ?? null,
    createdBy: org.user.id,
    skillId,
    styleId,
    description,
    sourceAssetUrl,
    refAssetUrl,
    variantCount,
    status: "queued",
    creditsReserved,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  } satisfies typeof batchJob.$inferInsert;

  const items = Array.from({ length: variantCount }, (_, idx) => ({
    id: newId(),
    batchJobId: jobId,
    idx,
    status: "queued" as const,
    createdAt: now,
  }));

  await db.batch([
    db.insert(batchJob).values(job),
    db.insert(batchItem).values(items),
  ]);

  const ctx = (context.locals as { runtime?: { env?: Env; ctx?: ExecutionContext } })?.runtime;
  if (ctx?.env && ctx.ctx) {
    ctx.ctx.waitUntil(runBatch(ctx.env, jobId));
  }
  // No `else`: if the runtime's ExecutionContext is somehow unavailable (it
  // always is on Cloudflare, astro dev included via the platform proxy),
  // the job simply stays 'queued' until the next hourly sweep's stale-job
  // pass notices it — see src/lib/batch/sweep.ts. Credits are already
  // reserved either way, so nothing is lost, only delayed.

  return apiJson({ batch: toBatchDto(job, items) }, 202);
}
