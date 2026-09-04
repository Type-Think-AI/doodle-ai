/* The read model behind /admin/seo.
 *
 * Whole-table reads reduced in JS rather than three joined queries. At ~145
 * URLs that is one cheap round trip each and it sidesteps D1's per-statement
 * parameter ceiling entirely (see ./batch.ts); a `WHERE url_id IN (…145 ids)`
 * would not survive contact with it. This is the trade that has to be revisited
 * first if the corpus ever reaches thousands of pages.
 */
import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { seoIndexState, seoSubmission, seoUrl } from "../../db/schema/seo";
import { selectPendingUrls } from "./submit";

export interface SeoTableRow {
  id: number;
  path: string;
  title: string | null;
  contentLastmod: Date | null;
  removedAt: Date | null;
  lastSubmittedAt: Date | null;
  lastSubmissionOk: boolean | null;
  lastSubmissionError: string | null;
  googleVerdict: string | null;
  bingVerdict: string | null;
}

export interface SeoTableSummary {
  total: number;
  live: number;
  removed: number;
  neverSubmitted: number;
  pending: number;
  lastSyncAt: Date | null;
}

/**
 * Rows for the table, plus the counters above it.
 *
 * The two index-verdict columns resolve to null for now: nothing writes
 * `seo_index_state` until the Search Console URL Inspection and Bing Webmaster
 * `GetUrlInfo` readers land. Null renders as "Not checked", which is the honest
 * state — it is genuinely different from "not indexed", and defaulting to the
 * latter would invent a verdict for every page on the site.
 */
export async function loadSeoTable(
  db: Db,
): Promise<{ rows: SeoTableRow[]; summary: SeoTableSummary }> {
  const [urls, submissions, states] = await Promise.all([
    db
      .select({
        id: seoUrl.id,
        path: seoUrl.path,
        title: seoUrl.title,
        contentLastmod: seoUrl.contentLastmod,
        removedAt: seoUrl.removedAt,
      })
      .from(seoUrl)
      .orderBy(seoUrl.path),
    db
      .select({
        urlId: seoSubmission.urlId,
        ok: seoSubmission.ok,
        error: seoSubmission.error,
        submittedAt: seoSubmission.submittedAt,
      })
      .from(seoSubmission)
      .where(eq(seoSubmission.engine, "indexnow"))
      .orderBy(desc(seoSubmission.submittedAt)),
    db
      .select({
        urlId: seoIndexState.urlId,
        engine: seoIndexState.engine,
        verdict: seoIndexState.verdict,
      })
      .from(seoIndexState),
  ]);

  // Newest-first ordering above means the first row seen per URL is the latest.
  const latest = new Map<number, (typeof submissions)[number]>();
  for (const row of submissions) {
    if (!latest.has(row.urlId)) latest.set(row.urlId, row);
  }
  const stateBy = new Map<string, (typeof states)[number]>();
  for (const row of states) stateBy.set(`${row.urlId}:${row.engine}`, row);

  const rows: SeoTableRow[] = urls.map((url) => {
    const submission = latest.get(url.id) ?? null;
    return {
      ...url,
      lastSubmittedAt: submission?.submittedAt ?? null,
      lastSubmissionOk: submission ? submission.ok : null,
      lastSubmissionError: submission?.error ?? null,
      googleVerdict: stateBy.get(`${url.id}:google`)?.verdict ?? null,
      bingVerdict: stateBy.get(`${url.id}:bing`)?.verdict ?? null,
    };
  });

  const live = rows.filter((r) => r.removedAt === null);
  return {
    rows,
    summary: {
      total: rows.length,
      live: live.length,
      removed: rows.length - live.length,
      neverSubmitted: live.filter((r) => r.lastSubmittedAt === null).length,
      // Computed with the same predicate the cron uses, so the "Pending push"
      // figure is literally the number of URLs the next tick will send — not an
      // independently-derived number that can disagree with the job.
      pending: (await selectPendingUrls(db)).length,
      lastSyncAt: submissions[0]?.submittedAt ?? null,
    },
  };
}
