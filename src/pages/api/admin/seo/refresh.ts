import type { APIContext } from "astro";
import { getDb } from "../../../../db/client";
import { recordAudit, clientIp } from "../../../../lib/admin/audit";
import { requireAdmin } from "../../../../lib/auth/admin-guard";
import { apiJson } from "../../../../lib/auth/guards";
import { runtimeEnvFrom } from "../../../../lib/seo/config";
import { refreshBingIndex } from "../../../../lib/seo/refresh";

export const prerender = false;

/**
 * POST /api/admin/seo/refresh — read Bing's index status for every tracked URL.
 *
 * `requireAdmin` rather than `requireAdminRead`: it writes verdicts and spends a
 * third-party API budget, so it is a mutating action even though nothing about a
 * user changes.
 *
 * 200 even when the read failed. The request itself succeeded and the report
 * carries the outcome, which lets the UI say which half broke instead of showing
 * a generic HTTP error over a page that cannot explain itself.
 */
export async function POST(context: APIContext): Promise<Response> {
  const admin = await requireAdmin(context);
  if (admin instanceof Response) return admin;

  const db = getDb(context);
  const report = await refreshBingIndex(db, {
    env: runtimeEnvFrom(context),
    // The origin actually being served, so a staging admin cannot read (or
    // write) verdicts against the production property.
    origin: context.url.origin,
  });

  await recordAudit(db, {
    actorUserId: admin.user.id,
    action: "seo.bing.refresh",
    targetType: "seo",
    targetId: `bing_${Date.now()}`,
    detail: {
      matched: report.matched,
      missing: report.missing,
      absenceRecorded: report.absenceRecorded,
      written: report.written,
      calls: report.calls,
      ok: report.ok,
      ...(report.skipped ? { skipped: report.skipped } : {}),
      ...(report.error ? { error: report.error } : {}),
    },
    ipAddress: clientIp(context),
  });

  return apiJson(report);
}
