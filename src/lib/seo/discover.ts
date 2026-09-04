/* Reconciling `seo_url` against the set of pages we consider indexable.
 *
 * The page list originates in ./pages.ts, the same function that generates
 * sitemap.xml, so "tracked by the SEO console" and "in the sitemap" cannot
 * disagree.
 *
 * It arrives here as an ARGUMENT rather than an import, because the two callers
 * reach it differently and only one of them can: the admin API runs inside Astro
 * and calls `listIndexablePages()` directly, while the cron is bundled by
 * wrangler and must read it over HTTP (`fetchPageInventory`). Both hand the same
 * shape to the same reconciliation below, which is what keeps the button and the
 * cron honest. See the header of ./inventory.ts for why the split is forced.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { seoUrl } from "../../db/schema/seo";
import { DB_BATCH, runBatched } from "./batch";
import type { IndexablePage } from "./inventory";

export interface DiscoverReport {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

export async function discoverUrls(db: Db, pages: IndexablePage[]): Promise<DiscoverReport> {
  const now = new Date();

  const existing = await db
    .select({
      id: seoUrl.id,
      path: seoUrl.path,
      title: seoUrl.title,
      contentLastmod: seoUrl.contentLastmod,
      removedAt: seoUrl.removedAt,
      source: seoUrl.source,
    })
    .from(seoUrl);
  const byPath = new Map(existing.map((row) => [row.path, row]));
  const livePaths = new Set(pages.map((p) => p.path));

  const inserts: (typeof seoUrl.$inferInsert)[] = [];
  const updates: { id: number; values: Partial<typeof seoUrl.$inferInsert> }[] = [];
  let updated = 0;

  for (const page of pages) {
    const current = byPath.get(page.path);
    const lastmod = page.lastmod ?? null;

    if (!current) {
      inserts.push({
        path: page.path,
        title: page.title,
        source: "sitemap",
        changefreq: page.changefreq,
        priority: page.priority,
        contentLastmod: lastmod,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      continue;
    }

    // `updated` counts real content movement, not "we looked at 145 rows
    // again", so the number the console shows means something.
    const changed =
      current.title !== page.title ||
      (current.contentLastmod?.getTime() ?? null) !== (lastmod?.getTime() ?? null) ||
      current.removedAt !== null;
    if (changed) updated += 1;

    updates.push({
      id: current.id,
      values: {
        title: page.title,
        changefreq: page.changefreq,
        priority: page.priority,
        contentLastmod: lastmod,
        lastSeenAt: now,
        // A path that came back is live again, with its submission history
        // intact — which is precisely why the row was marked, never deleted.
        removedAt: null,
      },
    });
  }

  // Gone from the list. Diffed in memory rather than written as a
  // `path NOT IN (…)`, which would bind one parameter per live URL and exceed
  // D1's per-statement limit (see ./batch.ts). Manual rows are exempt: an admin
  // added them deliberately and discovery does not own them.
  const removedIds = existing
    .filter((row) => row.source === "sitemap" && row.removedAt === null && !livePaths.has(row.path))
    .map((row) => row.id);

  for (let i = 0; i < inserts.length; i += DB_BATCH) {
    await db.insert(seoUrl).values(inserts.slice(i, i + DB_BATCH));
  }
  await runBatched(
    db,
    updates.map((u) => db.update(seoUrl).set(u.values).where(eq(seoUrl.id, u.id))),
  );
  await runBatched(
    db,
    removedIds.map((id) => db.update(seoUrl).set({ removedAt: now }).where(eq(seoUrl.id, id))),
  );

  return { added: inserts.length, updated, removed: removedIds.length, total: pages.length };
}
