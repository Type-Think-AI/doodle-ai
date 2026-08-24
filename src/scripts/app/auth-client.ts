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
 */
export async function getSession(): Promise<AuthUser | null> {
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
