import type { APIContext } from "astro";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** Cookie carrying the D1 session bookmark between requests. See `withDbSession`. */
const BOOKMARK_COOKIE = "d1_bookmark";
/** Bookmarks are only useful for as long as the replica lag they describe. */
const BOOKMARK_MAX_AGE_SECONDS = 60 * 10;

function d1(context: APIContext): D1Database {
  const db = (context.locals as { runtime?: { env?: Env } })?.runtime?.env?.DB;
  if (!db) {
    // Every caller is an API route that cannot do anything useful without a
    // database, so failing loudly here beats a confusing null-deref deeper in.
    throw new Error(
      "D1 binding `DB` is unavailable. Check wrangler.json's d1_databases entry, " +
        "and that astro.config.mjs has platformProxy enabled for `astro dev`.",
    );
  }
  return db;
}

/**
 * A Drizzle client bound straight to the primary database.
 *
 * Use this for writes, and for reads that must see this request's own writes
 * without any session plumbing. Prefer `withDbSession` for read-heavy routes.
 */
export function getDb(context: APIContext): Db {
  return drizzle(d1(context), { schema });
}

/**
 * A Drizzle client backed by a D1 *session*, which is what makes global read
 * replication actually do anything.
 *
 * D1 can place read replicas around the world, but queries only reach them
 * when issued through the Sessions API — otherwise every read goes to the
 * primary regardless of how many replicas exist. Sessions also guarantee
 * sequential consistency: a read issued after a write in the same session is
 * guaranteed to observe that write, rather than hitting a stale replica.
 *
 * Consistency is carried across requests by a bookmark cookie. A returning
 * request resumes from its previous bookmark, so a user never sees their own
 * data go backwards. With no cookie we anchor at 'first-unconstrained', which
 * lets the first query land on any replica — the right default for reads.
 *
 * The caller must invoke the returned `commit` with the outgoing response so
 * the updated bookmark is persisted:
 *
 *   const { db, commit } = withDbSession(context);
 *   const rows = await db.select().from(thread);
 *   return commit(Response.json(rows));
 *
 * Forgetting `commit` is not a correctness bug for writes (those always go to
 * the primary); it just means the next request re-anchors and may briefly read
 * a stale replica.
 */
export function withDbSession(
  context: APIContext,
  constraint: "first-primary" | "first-unconstrained" = "first-unconstrained",
): { db: Db; commit: (response: Response) => Response } {
  const previousBookmark = context.cookies.get(BOOKMARK_COOKIE)?.value;
  const session = d1(context).withSession(previousBookmark || constraint);

  // D1DatabaseSession exposes exactly the `prepare` and `batch` surface the
  // Drizzle D1 driver uses; it only omits the deprecated `dump` and the
  // `exec` escape hatch, neither of which Drizzle calls. The cast is what
  // lets a session stand in for a database here.
  const db = drizzle(session as unknown as D1Database, { schema });

  const commit = (response: Response): Response => {
    const bookmark = session.getBookmark();
    if (bookmark) {
      context.cookies.set(BOOKMARK_COOKIE, bookmark, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: BOOKMARK_MAX_AGE_SECONDS,
      });
    }
    return response;
  };

  return { db, commit };
}

export { schema };
