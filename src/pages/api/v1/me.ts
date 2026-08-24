import type { APIContext } from "astro";
import { apiJson, requireAuth } from "../../../lib/auth/guards";

export const prerender = false;

/**
 * GET /api/v1/me — the caller's profile.
 *
 * Phase 4 adds `credits` and `subscription` to this response; it is the
 * single place both clients read the authoritative credit balance from, so
 * neither ever computes one locally (docs/mobile-strategy.md).
 *
 * Works with either a session cookie or an `Authorization: Bearer` token.
 */
export async function GET(context: APIContext): Promise<Response> {
  const result = await requireAuth(context);
  if (result instanceof Response) return result;

  return apiJson({
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      image: result.image ?? null,
      emailVerified: result.emailVerified,
    },
  });
}
