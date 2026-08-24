import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { APIContext } from "astro";
import * as schema from "../../db/schema";
import { grant } from "../credits";
import { SIGNUP_GRANT_CREDITS } from "../credits/costs";
import { kvIncrement } from "../kv-counter";

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
      // Backs `rateLimit.storage: "secondary-storage"` below — every signup
      // rate-limit hit is one KV read-modify-write via the shared
      // kvIncrement() helper (see src/lib/kv-counter.ts for the concurrency
      // caveat).
      increment: async (key, ttl) => await kvIncrement(env.SESSIONS, `auth:${key}`, ttl),
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

    // Phase 4: per-IP signup rate limiting, to stop scripted bot signups
    // from farming the `signup_grant` credits in the databaseHook above —
    // free credits per account is exactly the kind of thing bots go after.
    //
    //  - `storage: "secondary-storage"` reuses the KV binding already wired
    //    up as `secondaryStorage` below, rather than adding a second KV
    //    namespace or routing counters through D1. D1 is fine for the credit
    //    ledger (low write volume, needs durability) but wrong for a rate
    //    limiter — every hit is a write, and KV is exactly the "many cheap
    //    counters, eventual consistency is fine" store this calls for.
    //  - `enabled: true` unconditionally: Better Auth's own default is
    //    "production only", gated on `NODE_ENV`, which Workers doesn't set
    //    the way that check expects — leaving the default would silently
    //    disable rate limiting in the deployed Worker, not just locally.
    //  - The global `window`/`max` covers every `/api/auth/*` route as a
    //    backstop; `customRules` below tightens specifically the two routes
    //    that actually create an account through Google sign-in:
    //    `/sign-in/social` (the client-initiated request that kicks off the
    //    OAuth redirect) and `/callback/:id` (where Better Auth creates the
    //    user row after Google's redirect back). 5-8 attempts/hour per IP is
    //    far above what a real person retrying a flaky OAuth flow needs, but
    //    low enough to blunt a script hammering either endpoint.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "secondary-storage",
      customRules: {
        "/sign-in/social": { window: 60 * 60, max: 5 },
        "/callback/:id": { window: 60 * 60, max: 8 },
      },
    },

    advanced: {
      // The Worker always serves over HTTPS in production; `astro dev` over
      // http://localhost is exempted by Better Auth's own dev handling.
      useSecureCookies: true,
      ipAddress: {
        // Better Auth's default IP source is `x-forwarded-for` alone, which
        // is spoofable and not what Cloudflare actually guarantees. Prefer
        // `cf-connecting-ip` — Cloudflare sets it at the edge and strips any
        // client-supplied value — and keep `x-forwarded-for` as a fallback
        // for local `astro dev` where no Cloudflare edge is in front of us.
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
