/* Typed browser client for the Better Auth handler mounted at /api/auth/*.

   Deliberately plain `fetch` rather than better-auth/client: the whole
   surface the web app needs is four calls against four documented routes,
   and the client SDK pulls a nanostores-backed reactive session layer into
   every page bundle for no benefit here. The bundle is already the tightest
   constraint on this project (see the vite.ssr.external note in
   astro.config.mjs), and the mobile client will talk to the same routes with
   bearer tokens rather than share this module. */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
}

/** Discriminated so callers must handle failure before reading `data`. */
export type AuthResult<T> = { ok: true; data: T } | { ok: false; message: string };

const BASE = "/api/auth";

/**
 * Better Auth returns its failures as `{ message?, code? }` with a non-2xx
 * status. `code` is the stable identifier, but it is SCREAMING_SNAKE and not
 * meant for display, so prefer `message` and fall back to something generic
 * rather than showing a raw code to the user.
 */
async function post<T>(path: string, body: unknown): Promise<AuthResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
  }

  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : "Something went wrong. Please try again.";
    return { ok: false, message };
  }

  return { ok: true, data: payload as T };
}

function toUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const u = value as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;
  return {
    id: u.id,
    email: u.email,
    name: typeof u.name === "string" ? u.name : "",
    image: typeof u.image === "string" ? u.image : null,
    emailVerified: u.emailVerified === true,
  };
}

export async function signOut(): Promise<AuthResult<null>> {
  const res = await post<unknown>("/sign-out", {});
  // A signed-out user must never be served the pre-sign-out session, so drop
  // the cache immediately regardless of whether the request itself succeeded.
  invalidateSession();
  return res.ok ? { ok: true, data: null } : res;
}

/**
 * Starts the Google OAuth round trip. Better Auth answers with the provider
 * URL rather than a 302 so that fetch-based clients aren't dragged through a
 * cross-origin redirect they can't follow — we navigate to it ourselves.
 */
export async function signInWithGoogle(callbackURL = "/"): Promise<AuthResult<null>> {
  const res = await post<{ url?: unknown }>("/sign-in/social", { provider: "google", callbackURL });
  if (!res.ok) return res;
  if (typeof res.data.url !== "string") {
    return { ok: false, message: "Google sign-in isn't available right now." };
  }
  window.location.href = res.data.url;
  return { ok: true, data: null };
}

/**
 * The current user, or null when signed out. Signed-out is the normal case
 * for this app until Phase 6, so it is not modelled as an error.
 *
 * Caching: a Lighthouse trace showed three callers (sidebar, auth-dialog,
 * api-client) each firing an identical /get-session request during page load,
 * serialising into the longest chain on the critical path. Two guards fix that
 * without changing the signature:
 *
 *   1. In-flight dedup — while one request is outstanding, concurrent callers
 *      await the SAME promise, so one page load makes one network request.
 *   2. Short TTL cache — a resolved result is reused for a few seconds so
 *      near-simultaneous (but not literally concurrent) callers also share it.
 *      A signed-in result is cached for SESSION_TTL_MS; a null/failure result
 *      is cached for only NULL_TTL_MS so an anonymous visitor who signs in is
 *      not stuck seeing signed-out state.
 *
 * invalidateSession() clears both and is called from signOut() above.
 */
const SESSION_TTL_MS = 30_000;
const NULL_TTL_MS = 2_000;

let inFlight: Promise<AuthUser | null> | null = null;
let cachedUser: AuthUser | null = null;
let cachedAt = 0; // epoch ms of the last resolved fetch; 0 = nothing cached
/* Bumped by invalidateSession(). A fetch that was already in flight when
   invalidation happened carries a stale generation and is therefore allowed to
   resolve its callers but NOT to write the cache — otherwise signing out while a
   getSession() was outstanding would repopulate the cache with the signed-in
   user a moment after sign-out. */
let generation = 0;

/** Drop any cached/in-flight session so the next getSession() refetches. */
export function invalidateSession(): void {
  generation += 1;
  inFlight = null;
  cachedUser = null;
  cachedAt = 0;
}

async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BASE}/get-session`, { credentials: "include" });
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    if (!payload || typeof payload !== "object") return null;
    return toUser((payload as { user?: unknown }).user);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthUser | null> {
  // Reuse a still-fresh cached result. A signed-in user gets the long TTL; a
  // null result gets a much shorter one so sign-in is reflected promptly.
  if (cachedAt !== 0) {
    const ttl = cachedUser ? SESSION_TTL_MS : NULL_TTL_MS;
    if (Date.now() - cachedAt < ttl) return cachedUser;
  }

  // Share a single outstanding request across concurrent callers.
  if (inFlight) return inFlight;

  const startedAt = generation;
  inFlight = fetchSession().then((user) => {
    // Only the newest request may populate the cache. If invalidateSession() ran
    // while this was in flight, hand the result to this caller but leave the
    // cache empty so the next call refetches.
    if (startedAt === generation) {
      cachedUser = user;
      cachedAt = Date.now();
      inFlight = null;
    }
    return user;
  });

  return inFlight;
}
