import type { APIContext } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "../../../db/client";
import { character, message, moodboardItem, thread } from "../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../lib/auth/guards";
import { newId, optStr, readJson, str, strArray, toDate } from "../../../lib/api/body";

export const prerender = false;

/** Matches TITLE_MAX_LEN in src/scripts/app/chat-store.ts. */
const TITLE_MAX_LEN = 48;

/* Caps. These are not a security boundary so much as a blast radius: a
   corrupted localStorage blob should be rejected, not written row by row
   until D1 complains halfway through. */
const MAX_THREADS = 1000;
const MAX_MESSAGES_PER_THREAD = 2000;
const MAX_MOODBOARD = 2000;
const MAX_CHARACTERS = 500;

/* SQLite caps bound parameters per statement, so multi-row inserts are
   chunked rather than sent as one enormous VALUES list. */
const CHUNK = 10;

interface ImportCounts {
  threads: number;
  messages: number;
  moodboard: number;
  characters: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, max);
}

async function insertChunked<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

/**
 * Ids that already exist anywhere, not just for this caller.
 *
 * Local ids are client-generated and land in a table whose primary key is
 * global, so an id could in principle already belong to someone else. Rather
 * than fail — or worse, let an insert attach to another user's row — the
 * importer mints a fresh id for those. Reading ids alone leaks nothing about
 * the other user, and never returns a row we would then act on.
 */
async function existingIds(db: Db, table: typeof thread | typeof character, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.id, ids.slice(i, i + 50)));
    for (const row of rows) found.add(row.id);
  }
  return found;
}

/**
 * POST /api/v1/import — one-time localStorage → server migration.
 *
 * Idempotent by construction, because the roadmap gives this exactly one
 * chance to be right: a thread the caller already owns is skipped entirely
 * (its messages came across with it the first time), moodboard items
 * de-duplicate on url, and characters de-duplicate on id. Re-POSTing the same
 * blob therefore imports nothing the second time rather than doubling it.
 *
 * Nothing here trusts a client-supplied `userId` — ownership on every row is
 * the authenticated caller, full stop.
 *
 * B2B note: always imports into the caller's *personal* org, never whatever
 * team happens to be active — pre-signup local doodles belong to the user
 * who made them, not to a team they later joined (see api-client.ts's
 * import call site, which is explicit about this). The personal org's
 * deterministic id (`org_<userId>`) is guaranteed to exist by this point:
 * the signup hook and requireOrg()'s self-heal both create it before a
 * user can ever reach this route.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const user = org.user;
  const organizationId = `org_${user.id}`;

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const db = getDb(context);
  const now = Date.now();
  const counts: ImportCounts = { threads: 0, messages: 0, moodboard: 0, characters: 0 };

  /* ---- Threads + their messages ---- */
  const incomingThreads = records(body.threads, MAX_THREADS);
  const threadIds = incomingThreads.map((t) => optStr(t.id)).filter((id): id is string => id !== null);

  // Which of these ids are already ours: those are prior imports, skip them.
  const mine = new Set<string>();
  for (let i = 0; i < threadIds.length; i += 50) {
    const rows = await db
      .select({ id: thread.id })
      .from(thread)
      .where(and(eq(thread.userId, user.id), inArray(thread.id, threadIds.slice(i, i + 50))));
    for (const row of rows) mine.add(row.id);
  }
  const takenIds = await existingIds(db, thread, threadIds);

  const threadRows: (typeof thread.$inferInsert)[] = [];
  const messageRows: (typeof message.$inferInsert)[] = [];

  for (const incoming of incomingThreads) {
    const localId = optStr(incoming.id);
    if (localId && mine.has(localId)) continue;
    // Collides with someone else's thread (or has no id at all) — mint one.
    const id = localId && !takenIds.has(localId) ? localId : newId();

    const updatedAt = toDate(incoming.updatedAt, now);
    threadRows.push({
      id,
      userId: user.id,
      organizationId,
      title: (optStr(incoming.title) ?? "New chat").slice(0, TITLE_MAX_LEN),
      skillId: optStr(incoming.skillId),
      createdAt: toDate(incoming.createdAt, updatedAt.getTime()),
      updatedAt,
    });

    for (const msg of records(incoming.messages, MAX_MESSAGES_PER_THREAD)) {
      const content = typeof msg.content === "string" ? msg.content : "";
      messageRows.push({
        // ChatMessage has no id in localStorage, so every message gets a new
        // one. Skipping already-imported threads is what keeps this idempotent.
        id: newId(),
        threadId: id,
        role: msg.role === "assistant" ? "assistant" : "user",
        content,
        imageUrl: optStr(msg.imageUrl),
        refImageUrl: optStr(msg.refImageUrl),
        images: strArray(msg.images),
        createdAt: toDate(msg.createdAt, now),
      });
    }
  }

  await insertChunked(threadRows, (batch) => db.insert(thread).values(batch).onConflictDoNothing());
  await insertChunked(messageRows, (batch) => db.insert(message).values(batch).onConflictDoNothing());
  counts.threads = threadRows.length;
  counts.messages = messageRows.length;

  /* ---- Moodboard ---- */
  const incomingItems = records(body.moodboard, MAX_MOODBOARD);
  const urls = incomingItems.map((i) => str(i.url)).filter((u): u is string => u !== null);
  const savedUrls = new Set<string>();
  for (let i = 0; i < urls.length; i += 50) {
    const rows = await db
      .select({ url: moodboardItem.url })
      .from(moodboardItem)
      .where(and(eq(moodboardItem.userId, user.id), inArray(moodboardItem.url, urls.slice(i, i + 50))));
    for (const row of rows) savedUrls.add(row.url);
  }

  const itemRows: (typeof moodboardItem.$inferInsert)[] = [];
  for (const incoming of incomingItems) {
    const url = str(incoming.url);
    if (!url || savedUrls.has(url)) continue;
    savedUrls.add(url); // the local blob can contain duplicates of its own
    itemRows.push({
      id: newId(),
      userId: user.id,
      organizationId,
      url,
      generationId: null,
      createdAt: toDate(incoming.createdAt, now),
    });
  }
  await insertChunked(itemRows, (batch) => db.insert(moodboardItem).values(batch).onConflictDoNothing());
  counts.moodboard = itemRows.length;

  /* ---- Characters ---- */
  const incomingCharacters = records(body.characters, MAX_CHARACTERS);
  const characterIds = incomingCharacters.map((c) => optStr(c.id)).filter((id): id is string => id !== null);
  const takenCharacterIds = await existingIds(db, character, characterIds);

  const characterRows: (typeof character.$inferInsert)[] = [];
  for (const incoming of incomingCharacters) {
    const imageUrl = str(incoming.imageUrl);
    if (!imageUrl) continue;
    const localId = optStr(incoming.id);
    // An id already ours means this character came across in an earlier run.
    if (localId && takenCharacterIds.has(localId)) {
      const owned = await db
        .select({ id: character.id })
        .from(character)
        .where(and(eq(character.id, localId), eq(character.userId, user.id)))
        .limit(1);
      if (owned.length > 0) continue;
    }
    characterRows.push({
      id: localId && !takenCharacterIds.has(localId) ? localId : newId(),
      userId: user.id,
      organizationId,
      name: optStr(incoming.name) ?? "Unnamed",
      imageUrl,
      createdAt: toDate(incoming.createdAt, now),
    });
  }
  await insertChunked(characterRows, (batch) => db.insert(character).values(batch).onConflictDoNothing());
  counts.characters = characterRows.length;

  return apiJson({ imported: counts });
}
