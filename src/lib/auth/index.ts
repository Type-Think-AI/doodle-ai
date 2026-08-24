import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { APIContext } from "astro";
import * as schema from "../../db/schema";
import { grant } from "../credits";
import { SIGNUP_GRANT_CREDITS } from "../credits/costs";

/**
 * Better Auth, configured for Cloudflare Workers.
 *
 * Built per-request rather than as a module singleton: the D1 and KV bindings
 * only exist on `context.locals.runtime.env`, so there is nothing to bind to
 * at module-evaluation time. Construction is cheap (no connections are
 * opened — D1 and KV are both binding calls), so this is not a hot path
 * concern.
 *
 * Two deliberate choices worth knowing about, both from docs/tech-stack.md:
 *
 *  - The `bearer` plugin is enabled from day one, not deferred until the
 *    mobile app exists. Cookies serve the web app; bearer tokens serve
 *    Expo. Adding it later would mean a second auth path to test against
 *    already-live sessions.
 *
 *  - `secondaryStorage` (KV) is enabled and cookie caching is NOT. Better
 *    Auth #4203 (reopened Jan 2026) fails to fall back to secondary storage
 *    once a cookie cache entry expires, so enabling both produces sessions
 *    that silently stop resolving. Pick one; KV is the one that survives a
 *    Worker cold start.
 */
export function createAuth(context: APIContext) {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.DB || !env?.SESSIONS) {
    throw new Error(
      "Auth requires the `DB` and `SESSIONS` bindings. Check wrangler.json, and that " +
        "astro.config.mjs has platformProxy enabled for `astro dev`.",
    );
  }

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not set. See .dev.vars.example.");
  }

  const googleId = env.GOOGLE_CLIENT_ID;
  const googleSecret = env.GOOGLE_CLIENT_SECRET;
  if (!googleId || !googleSecret) {
    throw new Error(
      "Google OAuth isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
        "(see .dev.vars.example) — Google is the only sign-in method.",
    );
  }
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    secret,
    baseURL: env.BETTER_AUTH_URL || new URL(context.request.url).origin,

    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),

    // The Phase 4 starter grant. Keyed on the user id so a hook that somehow
    // fires twice for the same account (retried request, dedupe race) is
    // still safe — grant()'s idempotency check makes the second call a no-op
    // rather than a double grant.
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            await grant(db, {
              userId: createdUser.id,
              amount: SIGNUP_GRANT_CREDITS,
              reason: "signup_grant",
              idempotencyKey: `signup:${createdUser.id}`,
            });
          },
        },
      },
    },

    // KV-backed session lookups, so an authenticated request costs a KV read
    // rather than a D1 round trip. See the note above about cookieCache.
    secondaryStorage: {
      get: async (key) => await env.SESSIONS.get(`auth:${key}`),
      // Workers KV has no atomic get-then-delete primitive, so this is a
      // plain read followed by a delete rather than a single atomic op. That
      // is a real gap versus the interface's contract, but the only caller
      // in Better Auth 1.7.1 is one-time-token consumption (email
      // verification / magic links), which we do not use in Phase 2 — so
      // the race window (two concurrent reads before either delete lands)
      // is currently unreachable, not just unlikely.
      getAndDelete: async (key) => {
        const value = await env.SESSIONS.get(`auth:${key}`);
        await env.SESSIONS.delete(`auth:${key}`);
        return value;
      },
      // Same caveat: KV has no atomic increment, so this is read-modify-write
      // and can under-count two concurrent increments. Only used by
      // secondary-storage-backed rate limiting, which is not enabled here.
      increment: async (key, ttl) => {
        const current = await env.SESSIONS.get(`auth:${key}`);
        const next = (current ? Number.parseInt(current, 10) : 0) + 1;
        await env.SESSIONS.put(`auth:${key}`, String(next), { expirationTtl: ttl });
        return next;
      },
      set: async (key, value, ttl) =>
        await env.SESSIONS.put(`auth:${key}`, value, ttl ? { expirationTtl: ttl } : undefined),
      delete: async (key) => await env.SESSIONS.delete(`auth:${key}`),
    },

    // Google is the only sign-in method — no email/password, so there's no
    // password storage, no reset-flow, and no email provider to stand up.
    socialProviders: { google: { clientId: googleId, clientSecret: googleSecret } },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    },

    plugins: [bearer()],

    advanced: {
      // The Worker always serves over HTTPS in production; `astro dev` over
      // http://localhost is exempted by Better Auth's own dev handling.
      useSecureCookies: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
