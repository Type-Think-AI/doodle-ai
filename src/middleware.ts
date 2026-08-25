/* The single gate in front of every admin surface.
 *
 * WHY THIS FILE EXISTS
 *
 * Before it, `/admin` was public. The seven route files under
 * src/pages/admin/ had no `prerender = false`, so `astro build` baked them
 * into `dist/` as static HTML and Cloudflare's asset handler served them to
 * anyone who typed the URL — no session, no role, no server code running at
 * all. Adding `prerender = false` is half the fix (it makes the pages
 * server-rendered so a guard *can* run); this middleware is the other half
 * (it actually runs one).
 *
 * WHY A PREFIX GUARD RATHER THAN PER-ROUTE CHECKS
 *
 * Per-route guards protect the routes someone remembered to guard. A new
 * admin endpoint added in six months is unprotected by default, and the
 * failure is silent — the endpoint works, it just works for everyone. Here
 * the default is inverted: anything under /admin or /api/admin is denied
 * unless the caller's platform role clears the bar, so forgetting to add a
 * guard is not a way to leak data.
 *
 * WHY PAGES 404 BUT THE API 403s
 *
 * A 403 on /admin confirms to an anonymous visitor that an admin console
 * exists at that exact path, which is free reconnaissance. Pages therefore
 * render the ordinary 404 — indistinguishable from a URL that was never a
 * route. The API is the opposite case: its callers are our own signed-in
 * client code, which needs to tell "you aren't allowed" apart from "that
 * endpoint is gone" to show the right message, so it gets a real 401/403
 * from `requirePlatformRole`.
 */
import { defineMiddleware } from "astro:middleware";
import { resolvePlatformRole } from "./lib/auth/admin-guard";
import { canViewAdmin } from "./lib/auth/admin-guard";

/** Mutating verbs require 'admin'; reads are satisfied by 'support'. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) return next();

  const resolved = await resolvePlatformRole(context);

  if (isAdminApi) {
    if (!resolved) {
      return json({ error: { code: "unauthenticated", message: "You need to be signed in to do that." } }, 401);
    }
    const needsAdmin = !READ_METHODS.has(context.request.method);
    const allowed = needsAdmin ? resolved.platformRole === "admin" : canViewAdmin(resolved.platformRole);
    if (!allowed) {
      return json(
        {
          error: {
            code: "forbidden",
            message: needsAdmin
              ? "This action requires platform admin access."
              : "This page requires platform admin access.",
            details: { required: needsAdmin ? "admin" : "support" },
          },
        },
        403,
      );
    }
    // Handed to the route so it doesn't re-query the role it was just
    // checked against. Routes still call requireAdmin() for their own
    // stricter checks — this is a convenience, never the authority.
    context.locals.admin = resolved;
    return next();
  }

  // Page routes.
  if (!resolved || !canViewAdmin(resolved.platformRole)) {
    // `next()` on the 404 route rather than a bare 404 Response, so the
    // visitor gets the real styled 404 page and /admin is indistinguishable
    // from a path that was never routed.
    return context.rewrite("/404");
  }

  context.locals.admin = resolved;
  return next();
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
