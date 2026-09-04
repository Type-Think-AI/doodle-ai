import type { APIContext } from "astro";
import { getDb } from "../../../../db/client";
import { recordAudit, clientIp } from "../../../../lib/admin/audit";
import { requireAdmin } from "../../../../lib/auth/admin-guard";
import { apiError, apiJson } from "../../../../lib/auth/guards";
import { readJson } from "../../../../lib/api/body";
import { runtimeEnvFrom } from "../../../../lib/seo/config";
import { syncIndexNow } from "../../../../lib/seo/submit";
import { listIndexablePages } from "../../../../lib/seo/pages";

export const prerender = false;

/**
 * POST /api/admin/seo/sync — discover pages, then push pending URLs to IndexNow.
 *
 * `requireAdmin`, not `requireAdminRead`: this reaches a third-party endpoint
 * under our host's identity and consumes a shared rate-limit budget, so it is a
 * mutating action even though nothing about a user changes.
 *
 * Body: { force?: boolean }. `force` resubmits every live URL rather than only
 * changed ones — the initial seed, or recovery. Audited separately from a normal
 * sync, because a forced run is the one that can plausibly earn a 429 and
 * whoever triggered it should be on the record.
 */
export async function POST(context: APIContext): Promise<Response> {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  // An empty body is the common case (the Sync button sends nothing), so a
  // failed parse is only an error when there was something to parse.
  const body = context.request.headers.get("Content-Length")
    ? await readJson(context.request)
    : {};
  if (body === null) return apiError("invalid_request", "Expected a JSON object.", 400);
  if ("force" in body && typeof body.force !== "boolean") {
    return apiError("invalid_request", "`force` must be a boolean.", 400);
  }
  const force = body.force === true;

  const db = getDb(context);
  const report = await syncIndexNow(db, {
    env: runtimeEnvFrom(context),
    // Submit the URLs of the origin actually being served, so a staging admin
    // can never push dev.doodleai.art paths into production's index — or, worse,
    // production URLs while testing against staging.
    origin: context.url.origin,
    trigger: "manual",
    force,
    // Direct call, not an HTTP round trip to /api/seo/pages.json: this route
    // already runs inside Astro, so `astro:content` resolves and a subrequest
    // would buy nothing. The cron cannot do this — see src/lib/seo/inventory.ts.
    loadPages: listIndexablePages,
  });

  await recordAudit(db, {
    actorUserId: admin.user.id,
    action: force ? "seo.indexnow.sync.force" : "seo.indexnow.sync",
    targetType: "seo",
    targetId: report.batchId,
    detail: {
      submitted: report.submitted,
      discovered: report.discovered,
      ok: report.ok,
      statusCode: report.statusCode,
      ...(report.skipped ? { skipped: report.skipped } : {}),
    },
    ipAddress: clientIp(context),
  });

  // 200 even when the push failed: the request itself succeeded, and the report
  // carries the outcome. The UI reads `ok`/`skipped` and says what happened
  // rather than showing a generic HTTP error that hides which half broke.
  return apiJson(report);
}
