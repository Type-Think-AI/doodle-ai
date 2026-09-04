/* Writing Bing's index verdicts into `seo_index_state`.
 *
 * The read half of /admin/seo. Submission (./submit.ts) tells engines a URL
 * exists; this asks Bing what it actually did with it. They are separate tables
 * and separate jobs precisely because they answer separate questions — a 200
 * from IndexNow is not evidence of indexing.
 *
 * Shared by the manual "Check Bing" button and the daily cron, same as
 * `syncIndexNow`, so the two cannot drift.
 */
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { seoIndexState, seoUrl } from "../../db/schema/seo";
import type { SecretLike } from "../secrets";
import { DB_BATCH, runBatched } from "./batch";
import { verdictFor } from "./bing";
import { sweepBingIndex } from "./bing-sweep";
import { readBingApiKey } from "./config";
import { SITE_ORIGIN } from "./inventory";

export interface RefreshReport {
  /** Tracked URLs Bing returned data for. */
  matched: number;
  /** Tracked URLs Bing did not return. Only ever marked when `complete`. */
  missing: number;
  /** True when absence was trustworthy enough to record as "not indexed". */
  absenceRecorded: boolean;
  /** Rows written to seo_index_state. */
  written: number;
  /** Bing API calls spent. */
  calls: number;
  ok: boolean;
  error?: string;
  /** Set when the job could not run at all. */
  skipped?: string;
}

export async function refreshBingIndex(
  db: Db,
  options: { env: Record<string, SecretLike> | undefined; origin?: string },
): Promise<RefreshReport> {
  const empty: RefreshReport = {
    matched: 0,
    missing: 0,
    absenceRecorded: false,
    written: 0,
    calls: 0,
    ok: false,
  };

  const credential = await readBingApiKey(options.env);
  if ("unavailable" in credential) {
    return { ...empty, skipped: credential.unavailable };
  }

  // The property must be the one verified in Bing Webmaster Tools. Production is
  // the only place that is true, so a local origin is refused rather than
  // spending a call to earn a 400.
  const origin = options.origin ?? SITE_ORIGIN;
  if (!origin.startsWith("https://")) {
    return {
      ...empty,
      skipped: `${origin} is not a verified Bing property, so there is nothing to read here. Index status is only available for the deployed origin.`,
    };
  }

  const tracked = await db
    .select({ id: seoUrl.id, path: seoUrl.path })
    .from(seoUrl)
    .where(isNull(seoUrl.removedAt));
  if (tracked.length === 0) {
    return { ...empty, ok: true, skipped: "Nothing is tracked yet — run a sync first." };
  }

  const sweep = await sweepBingIndex({ apiKey: credential.key, siteUrl: origin });
  if (sweep.error) {
    return { ...empty, calls: sweep.calls, error: sweep.error };
  }

  const checkedAt = new Date();
  const writes: { urlId: number; values: typeof seoIndexState.$inferInsert }[] = [];
  let matched = 0;
  let missing = 0;

  for (const row of tracked) {
    const info = sweep.byPath.get(row.path);
    if (info) {
      matched += 1;
      writes.push({
        urlId: row.id,
        values: {
          urlId: row.id,
          engine: "bing",
          verdict: verdictFor(info),
          // Bing's own wording, kept verbatim beside our normalisation so a
          // surprising pill can be traced without re-querying.
          coverageState: `IsPage=${info.isPage} HttpStatus=${info.httpStatus} DocumentSize=${info.documentSize} AnchorCount=${info.anchorCount}`,
          lastCrawledAt: info.lastCrawledAt,
          robotsState: null,
          canonical: null,
          checkedAt,
          raw: JSON.stringify(info),
        },
      });
      continue;
    }

    missing += 1;
    // Absence is only a verdict when the sweep was trustworthy. On a partial
    // sweep these rows are left exactly as they were, so the table keeps saying
    // "not checked" rather than turning red because we ran out of call budget.
    if (sweep.complete) {
      writes.push({
        urlId: row.id,
        values: {
          urlId: row.id,
          engine: "bing",
          verdict: "not_indexed",
          coverageState: "Absent from a complete Bing index sweep",
          lastCrawledAt: null,
          robotsState: null,
          canonical: null,
          checkedAt,
          raw: null,
        },
      });
    }
  }

  await runBatched(
    db,
    writes.map((w) =>
      db
        .insert(seoIndexState)
        .values(w.values)
        .onConflictDoUpdate({
          target: [seoIndexState.urlId, seoIndexState.engine],
          set: {
            verdict: w.values.verdict,
            coverageState: w.values.coverageState,
            lastCrawledAt: w.values.lastCrawledAt,
            canonical: w.values.canonical,
            checkedAt: w.values.checkedAt,
            raw: w.values.raw,
          },
        }),
    ),
  );

  return {
    matched,
    missing,
    absenceRecorded: sweep.complete,
    written: writes.length,
    calls: sweep.calls,
    ok: true,
  };
}

export { DB_BATCH, eq };
