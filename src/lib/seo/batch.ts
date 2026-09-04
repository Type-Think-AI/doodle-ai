/* D1's per-statement parameter ceiling, and the two ways this feature works
 * around it.
 *
 * D1 allows at most 100 bound parameters per statement. With ~145 tracked URLs
 * the obvious query shapes exceed that silently — `WHERE path IN (…all of
 * them)` binds one parameter per URL, and a 145-row multi-value INSERT binds
 * one per column per row. So every write here is chunked, and the reads either
 * diff in memory or pull the whole (small) table and reduce it in JS.
 *
 * If the corpus reaches thousands of pages that trade flips and the reads in
 * ./table.ts need real pagination. 50 is half the ceiling, which leaves room
 * for the widest row this feature writes (seoSubmission, 8 columns).
 */
import type { Db } from "../../db/client";

export const DB_BATCH = 50;

/**
 * Send prepared statements through D1's batch API in chunks — one round trip
 * per chunk instead of one per statement, which matters when an hourly cron
 * would otherwise issue ~145 sequential awaits for no reason.
 */
export async function runBatched(db: Db, statements: unknown[]): Promise<void> {
  for (let i = 0; i < statements.length; i += DB_BATCH) {
    const chunk = statements.slice(i, i + DB_BATCH);
    if (chunk.length === 0) continue;
    // `batch` is typed as a non-empty tuple; the length check above is exactly
    // the guarantee this cast asserts, and there is no other way to hand it a
    // list built at runtime.
    await db.batch(chunk as unknown as [Parameters<Db["batch"]>[0][number]]);
  }
}
