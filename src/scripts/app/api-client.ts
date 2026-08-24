/* The bridge between the three localStorage stores and /api/v1.
 *
 * The stores keep their synchronous exported signatures — the sidebar and the
 * page controllers call them mid-render — so the server cannot sit directly
 * behind a read. Instead localStorage becomes a *mirror* of the server when
 * signed in:
 *
 *   read   -> localStorage, always, synchronously
 *   write  -> localStorage immediately (optimistic), then POST/PATCH/DELETE
 *             in the background through a serial queue
 *   load   -> `whenSynced()` pulls the server's copy into the mirror once per
 *             page, and resolves; callers that want fresh cross-device data
 *             await it before their first paint
 *
 * The mirror lives under per-user keys (`doodleai-u:<id>:<base>`) rather than
 * the plain ones. That keeps two things true at once: a second account
 * signing in on the same browser never sees the first account's threads, and
 * the signed-out user's own local data survives a sign-in/sign-out round trip
 * untouched — which is what makes the /api/v1/import offer safe to decline.
 */

import { getSession } from "./auth-client";

/** Caches the signed-in user id so a synchronous read knows which keys to use. */
const AUTH_UID_KEY = "doodleai-auth-uid";
/** Set once the import offer has been answered, so it is asked exactly once. */
const IMPORT_DONE_PREFIX = "doodleai-imported:";

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota) — this write stays in-memory */
  }
}

function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}

let cachedUid: string | null | undefined;

/**
 * The signed-in user id, or null — synchronously, from cache.
 *
 * On the very first page load after signing in this is still null, because
 * the cache is only written once `/api/v1/me` answers. Those callers read
 * their local data first and get the server's once `whenSynced()` resolves.
 */
export function currentUserId(): string | null {
  if (cachedUid === undefined) cachedUid = readLocal(AUTH_UID_KEY);
  return cachedUid;
}

export function isSignedIn(): boolean {
  return currentUserId() !== null;
}

function setUid(uid: string | null): void {
  cachedUid = uid;
  if (uid) writeLocal(AUTH_UID_KEY, uid);
  else removeLocal(AUTH_UID_KEY);
}

/** The localStorage key a store should use right now: per-user when signed in. */
export function scopedKey(base: string): string {
  const uid = currentUserId();
  return uid ? `doodleai-u:${uid}:${base}` : base;
}

export function readJsonLocal<T>(key: string, fallback: T): T {
  const raw = readLocal(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonLocal(key: string, value: unknown): void {
  writeLocal(key, JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* Fetch                                                               */
/* ------------------------------------------------------------------ */

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Call /api/v1, returning the parsed body or null.
 *
 * Never throws: a store's job is to keep the local mirror correct whatever
 * the network did. A 401 means the session went away underneath us, so the
 * uid cache is cleared and subsequent reads fall back to the signed-out keys.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 401) {
      setUid(null);
      return null;
    }
    const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;
    if (!res.ok) {
      if (body?.error?.code) console.warn(`[doodleai] ${path}: ${body.error.code}`);
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

/**
 * A serial queue for background writes.
 *
 * Two reasons it is serial rather than fire-and-forget: appends to the same
 * thread must reach the server in the order the user made them, and a thread
 * must exist server-side before its first message is posted to it.
 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueue(task: () => Promise<unknown>): void {
  tail = tail.then(task).catch(() => undefined);
}

/** Await every queued write — used before an import so nothing races it. */
export function drained(): Promise<unknown> {
  return tail;
}

/* ------------------------------------------------------------------ */
/* Hydration                                                           */
/* ------------------------------------------------------------------ */

type Hydrator = (uid: string) => Promise<void>;

const hydrators: Hydrator[] = [];

/**
 * Register a store's "pull the server copy into the mirror" step.
 *
 * Each store calls this at module load. They run in parallel once the session
 * is known, so a page importing all three pays one round trip's latency, not
 * three.
 */
export function registerHydrator(hydrate: Hydrator): void {
  hydrators.push(hydrate);
}

/** Fired after hydration so anything already painted can repaint. */
export const SYNCED_EVENT = "doodleai:synced";

let syncPromise: Promise<void> | null = null;

async function runSync(): Promise<void> {
  // getSession() rather than /api/v1/me: same answer, and it keeps the app
  // with a single client-side notion of "who is signed in".
  const uid = (await getSession())?.id ?? null;
  setUid(uid);
  if (!uid) return;

  await maybeOfferImport(uid);
  await Promise.all(hydrators.map((hydrate) => hydrate(uid)));

  try {
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT));
  } catch {
    /* no window (SSR-evaluated module) — nothing to repaint */
  }
}

/**
 * Resolve once the session is known and, if signed in, the mirror is fresh.
 *
 * Idempotent and shared: every store and page controller can await it and
 * only one `/api/v1/me` round trip happens per page.
 */
export function whenSynced(): Promise<void> {
  if (!syncPromise) syncPromise = runSync();
  return syncPromise;
}

// Start the round trip as soon as any store is imported, so a page that only
// awaits `whenSynced()` at first paint is waiting on something already in
// flight. Safe to fire here: module-graph evaluation is synchronous, so every
// `registerHydrator` call has run by the time runSync()'s first await yields.
if (typeof window !== "undefined") void whenSynced();

/* ------------------------------------------------------------------ */
/* One-time import                                                     */
/* ------------------------------------------------------------------ */

/** Filled in by the stores, which are the only things that know their shapes. */
type LocalBlobCollector = () => unknown;

const collectors: Record<string, LocalBlobCollector> = {};

export function registerImportSource(field: string, collect: LocalBlobCollector): void {
  collectors[field] = collect;
}

function hasLocalWork(blob: Record<string, unknown>): boolean {
  return Object.values(blob).some((value) => Array.isArray(value) && value.length > 0);
}

/**
 * Offer to carry pre-sign-in localStorage work onto the account, once.
 *
 * This is the step docs/roadmap.md flags as having no second chance, so the
 * answer — yes *or* no — is recorded per user before anything is written, and
 * the local blobs are never deleted afterwards. Declining, or a failed
 * import, leaves the signed-out data exactly where it was.
 */
async function maybeOfferImport(uid: string): Promise<void> {
  const marker = IMPORT_DONE_PREFIX + uid;
  if (readLocal(marker)) return;

  const blob: Record<string, unknown> = {};
  for (const [field, collect] of Object.entries(collectors)) blob[field] = collect();
  if (!hasLocalWork(blob)) {
    writeLocal(marker, "empty");
    return;
  }

  const accepted = window.confirm(
    "We found chats, doodles or characters saved on this device. Add them to your account?",
  );
  if (!accepted) {
    writeLocal(marker, "declined");
    return;
  }

  const result = await apiFetch<{ imported?: unknown }>("/api/v1/import", {
    method: "POST",
    body: JSON.stringify(blob),
  });
  // Only mark it done on success — a failed import must be re-offered on the
  // next load rather than silently swallowing the user's only copy.
  if (result) writeLocal(marker, "done");
}
