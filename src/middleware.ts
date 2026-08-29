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
 * WHY PAGES REDIRECT HOME BUT THE API 403s
 *
 * A visitor without admin access who lands on an /admin page is sent to the
 * homepage (302). They are almost always a real signed-in user who simply
 * lacks the platform role, and a 404 or 500 reads as "the app is broken" —
 * a redirect home is the least confusing outcome. The API is the opposite
 * case: its callers are our own signed-in client code, which needs to tell
 * "you aren't allowed" apart from "that endpoint is gone" to show the right
 * message, so it gets a real 401/403 from `requirePlatformRole`.
 *
 * WHY ROLE RESOLUTION IS WRAPPED IN try/catch
 *
 * `resolvePlatformRole` touches D1 and Better Auth; either can throw for
 * reasons unrelated to the caller (transient DB error, schema drift, missing
 * binding). Unhandled, that throw is a raw HTTP 500 — the "This page isn't
 * working" screen. Instead we log the real cause and treat the failure as
 * "not authorised": pages redirect home, the API returns a clean 503.
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

  // Resolving the role touches D1 and Better Auth. Either can throw for
  // reasons that have nothing to do with the caller — a transient D1 error,
  // a schema drift (e.g. `platform_role` not yet migrated in an environment),
  // a missing binding. An unhandled throw here becomes a raw HTTP 500, which
  // is exactly the "This page isn't working / HTTP ERROR 500" screen users
  // hit on production /admin. Treat any such failure as "not authorised":
  // page routes fall through to the homepage, the API returns a clean 503,
  // and the real cause is logged for debugging rather than shown to visitors.
  let resolved: Awaited<ReturnType<typeof resolvePlatformRole>>;
  try {
    resolved = await resolvePlatformRole(context);
  } catch (err) {
    console.error(
      `[admin-middleware] Failed to resolve platform role for ${context.request.method} ${pathname}:`,
      err,
    );
    if (isAdminApi) {
      return json(
        {
          error: {
            code: "admin_unavailable",
            message: "Admin access could not be verified. Try again shortly.",
          },
        },
        503,
      );
    }
    // Page route: send the visitor home instead of a 500. No stack, no
    // confirmation that /admin exists — just a normal redirect.
    return context.redirect("/", 302);
  }

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
    // A visitor without admin access is sent to the homepage rather than
    // shown a 404 or a 500. This is a deliberate product choice: the person
    // hitting /admin is almost always a real signed-in user who simply lacks
    // the role, and a bare 404 reads as "the app is broken". A 302 home is
    // the least confusing outcome. (Reconnaissance value is minimal — the
    // /admin path is already public knowledge.)
    return context.redirect("/", 302);
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
