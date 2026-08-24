import type { APIContext } from "astro";
import { createAuth } from "./index";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
}

/**
 * Resolve the caller, or null if unauthenticated.
 *
 * Better Auth's `getSession` reads the session cookie *and* the
 * `Authorization: Bearer` header (via the bearer plugin), so web and mobile
 * clients both land here with no branching at the call site. That is the
 * whole reason the plugin is enabled in Phase 2 — see docs/mobile-strategy.md.
 */
export async function optionalAuth(context: APIContext): Promise<AuthedUser | null> {
  try {
    const auth = createAuth(context);
    const session = await auth.api.getSession({ headers: context.request.headers });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      emailVerified: session.user.emailVerified,
    };
  } catch {
    // A malformed or expired credential is not an error worth surfacing —
    // it is simply an unauthenticated request. Genuine misconfiguration
    // (missing bindings/secret) throws from createAuth on every request and
    // will be obvious immediately.
    return null;
  }
}

/**
 * Resolve the caller, or return a 401 to send straight back.
 *
 *   const result = await requireAuth(context);
 *   if (result instanceof Response) return result;
 *   const user = result;
 */
export async function requireAuth(context: APIContext): Promise<AuthedUser | Response> {
  const user = await optionalAuth(context);
  if (user) return user;
  return apiError("unauthenticated", "You need to be signed in to do that.", 401);
}

/**
 * The uniform error envelope from docs/architecture.md § "API surface".
 * Both the web and the future mobile client map on `code`, never on the
 * human-readable `message`.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: { code, message, ...(details ? { details } : {}) } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
