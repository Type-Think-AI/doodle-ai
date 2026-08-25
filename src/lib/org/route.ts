/* Route plumbing for the `/api/v1/orgs/[id]/*` family.
 *
 * `requireOrg` (src/lib/auth/guards.ts) resolves the org from an
 * `X-Doodle-Org` header, a `?orgId=` query param, or the session — it has no
 * notion of an Astro path param. These routes are addressed by path (`/orgs/
 * :id/members`), so they need to tell the guard which org they mean without
 * mutating the request or consuming its body (several of them read a JSON
 * body afterwards).
 *
 * `withOrgOverride` therefore hands the guard a *view* of the APIContext
 * whose `request` exposes the same url and headers plus the override. It is a
 * Proxy rather than a clone because Astro's APIContext has getters that must
 * keep running against the real object.
 */
import type { APIContext } from "astro";
import { requireOrg, type OrgContext } from "../auth/guards";
import type { roles } from "../auth/org-access";

type PermissionCheck = Parameters<(typeof roles)["owner"]["authorize"]>[0];

function withOrgOverride(context: APIContext, orgId: string): APIContext {
  const headers = new Headers(context.request.headers);
  headers.set("X-Doodle-Org", orgId);
  // Only `.url` and `.headers` are ever read off this by requireOrg (and by
  // createAuth's baseURL/getSession) — the body is deliberately not exposed,
  // so the real request's stream stays unread and the route can still parse
  // it after the guard returns.
  const request = { url: context.request.url, headers } as unknown as Request;
  return new Proxy(context, {
    get(target, prop) {
      if (prop === "request") return request;
      return Reflect.get(target, prop, target) as unknown;
    },
  });
}

/**
 * `requireOrg`, but pinned to an explicit org id (normally `context.params.id`).
 * Returns 403 when the caller isn't a member of that org, and 400 when the
 * route was reached with no id at all.
 */
export async function requireOrgById(
  context: APIContext,
  orgId: string | undefined,
  permission?: PermissionCheck,
): Promise<OrgContext | Response> {
  if (!orgId) {
    return new Response(JSON.stringify({ error: { code: "bad_request", message: "Missing team id." } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return await requireOrg(withOrgOverride(context, orgId), permission);
}

/** The request's origin, used to build absolute invite URLs. */
export function originOf(context: APIContext): string {
  return new URL(context.request.url).origin;
}
