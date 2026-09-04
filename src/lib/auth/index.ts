import { betterAuth } from "better-auth";
import { bearer, organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { asc, eq } from "drizzle-orm";
import type { APIContext } from "astro";
import * as schema from "../../db/schema";
import { grant } from "../credits";
import { SIGNUP_GRANT_CREDITS } from "../credits/costs";
import { kvIncrement } from "../kv-counter";
import { readSecrets } from "../secrets";
import { ac, roles } from "./org-access";

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
 *
 * Async because the three secrets it needs may be Secrets Store bindings
 * rather than plain strings (see src/lib/secrets.ts) — those are read with
 * `await binding.get()`. readSecrets() resolves all three concurrently, so
 * this costs one round trip, not three.
 */
export async function createAuth(context: APIContext) {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.DB || !env?.SESSIONS) {
    throw new Error(
      "Auth requires the `DB` and `SESSIONS` bindings. Check wrangler.json, and that " +
        "astro.config.mjs has platformProxy enabled for `astro dev`.",
    );
  }

  const {
    BETTER_AUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: googleId,
    GOOGLE_CLIENT_SECRET: googleSecret,
  } = await readSecrets({
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  });

  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Locally, see .dev.vars.example; on a deployed " +
        "Worker it comes from either `wrangler secret put` or a Secrets Store binding " +
        "(see docs/secrets.md).",
    );
  }

  if (!googleId || !googleSecret) {
    throw new Error(
      "Google OAuth isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET " +
        "(see .dev.vars.example, or docs/secrets.md for the deployed Worker) — Google " +
        "is the only sign-in method.",
    );
  }
  /**
   * Is this a developer's own machine?
   *
   * Checked against every loopback form, not just the literal string "localhost".
   * The previous `hostname === "localhost"` missed `127.0.0.1` and `[::1]`, so
   * opening the app on http://127.0.0.1:8787 silently fell through to the
   * PRODUCTION rate limits (5 sign-ins/hour) and answered
   * `POST /api/auth/sign-in/social` with "Too many requests" after a handful of
   * attempts — while the config looked like it had local dev covered.
   */
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
  const requestUrl = new URL(context.request.url);

  /**
   * The browser's real origin, e.g. "http://localhost:8787".
   *
   * THIS is the reliable local-dev signal, not the request URL's hostname.
   * `pnpm dev` runs `wrangler dev --remote`, which executes the Worker on
   * Cloudflare's EDGE and proxies your localhost request to it — so inside the
   * Worker `new URL(context.request.url).hostname` is NOT "localhost". Every
   * hostname-based check therefore evaluated false during local development,
   * which is what produced both long-running bugs:
   *
   *   - `trustedOrigins` collapsed to `[]` → nothing trusted → Better Auth
   *     answered "Invalid origin: http://localhost:8787" on every sign-in.
   *   - the rate limiter stayed ON and keyed counters to the developer's PUBLIC
   *     IP (auth:152.59.46.226|/sign-in/social), which was the visible proof
   *     that the request had gone through the edge rather than loopback.
   *
   * The Origin header is set by the browser and travels intact through the edge,
   * so it reports loopback correctly in every runtime.
   */
  const requestOrigin = context.request.headers.get("origin") ?? "";
  const isLoopbackOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(
    requestOrigin,
  );
  const isLoopbackHostname =
    localHostnames.has(requestUrl.hostname) || requestUrl.hostname.endsWith(".localhost");

  /**
   * Where this server thinks it lives — the ONLY local-dev signal that is
   * identical on every request of an OAuth flow.
   *
   * The two per-request signals above are both unusable on the Google callback,
   * which is the single request where getting this wrong breaks sign-in:
   *
   *   - `isLoopbackHostname` is false under `pnpm dev` (= `wrangler dev
   *     --remote`), because the Worker executes on Cloudflare's edge and
   *     `context.request.url` carries the edge host, not localhost.
   *   - `isLoopbackOrigin` is false too, because `/api/auth/callback/google` is
   *     reached by a top-level CROSS-SITE GET redirect from accounts.google.com,
   *     and browsers do not send an `Origin` header on those. It is only sent on
   *     the `POST /api/auth/sign-in/social` fetch that STARTS the flow.
   *
   * So every setting keyed to `isLocalDevelopment` silently flipped to
   * production behaviour half-way through the flow, which is what produced the
   * `state_mismatch` loop:
   *
   *   1. sign-in POST  → Origin present → local  → state cookie written as
   *      `better-auth.state` (not `Secure`, correct for http://localhost).
   *   2. Google callback → Origin ABSENT → "production" → `useSecureCookies`
   *      true → Better Auth looks for `__Secure-better-auth.state`, which the
   *      browser never had, and `skipStateCookieCheck` false → the signed-cookie
   *      re-check runs and throws `state_security_mismatch`, which Better Auth
   *      rewrites to `state_mismatch` (better-auth/dist/oauth2/state.mjs).
   *
   * Proven against the running dev server: replaying the callback with the same
   * signed value under the `__Secure-` name reached `error=invalid_code` (i.e.
   * straight through the state check to Google's token exchange), while the
   * plain name alone returned `error=state_mismatch` — with the `verification`
   * row present and unexpired in D1 both times, ruling out the DB lookup.
   *
   * `BETTER_AUTH_URL` is pinned to http://localhost:8787 in `.dev.vars` and, by
   * policy, is never set in staging or production (there is no `vars` block in
   * wrangler.json, and .dev.vars.example says so) — so a loopback baseURL means
   * a developer's machine, on the callback as much as on the sign-in request.
   *
   * The Origin header is deliberately NOT part of this decision any more. It is
   * client-supplied, so the old code let anyone disable production behaviour on
   * the deployed Worker just by sending `Origin: http://localhost:8787` —
   * including `rateLimit.enabled`, the guard that exists to stop bots farming
   * the `signup_grant` credits below.
   */
  const resolvedBaseURL = env.BETTER_AUTH_URL || requestUrl.origin;
  const isLoopbackBaseURL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(
    resolvedBaseURL,
  );
  const isLocalDevelopment = isLoopbackBaseURL || isLoopbackHostname;
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    secret,
    baseURL: resolvedBaseURL,

    /**
     * Origins Better Auth will accept. It rejects anything not listed with a bare
     * "Invalid origin", which is what blocked local sign-in.
     *
     * ALWAYS starts with the app's own origin. The previous version passed `[]`
     * for the non-local branch, which does NOT mean "use the default" — it
     * OVERRIDES the default `[baseURL]` with an empty allowlist, so once the
     * local check misfired (see the Origin-header note above) every single origin
     * was untrusted, including the correct one.
     *
     * When the caller's Origin header is loopback we additionally trust that
     * exact origin plus the ports this project actually serves:
     *   - 8787        → `wrangler dev` (`pnpm dev`) — the ONLY port where voice
     *                   mode works (Durable Object + AI bindings live in the
     *                   Worker runtime, not in `astro dev`)
     *   - 4321 / 4322 → `astro dev` (`pnpm dev:local`)
     *
     * A deployed browser sends its real https origin, so the loopback branch
     * never activates in production; and an attacker forging
     * `Origin: http://localhost` would only be trusting their own machine, where
     * no victim cookie exists.
     */
    trustedOrigins: [
      resolvedBaseURL,
      // The caller's own loopback origin, but only once the SERVER has been
      // established as local by `resolvedBaseURL` above. Gating it that way
      // matters: keyed off the Origin header alone, a request to the deployed
      // Worker carrying `Origin: http://localhost:8787` added localhost to
      // production's allowlist and then passed its own CSRF check.
      ...(isLocalDevelopment && isLoopbackOrigin ? [requestOrigin] : []),
      ...(isLocalDevelopment
        ? [
            "http://localhost:8787",
            "http://127.0.0.1:8787",
            "http://localhost:4321",
            "http://localhost:4322",
          ]
        : []),
    ],

    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),

    // The Phase 4 starter grant, now paid into the user's personal
    // organization rather than a user-keyed balance (B2B phase: credits are
    // always org-owned, see src/lib/credits/index.ts). Every user gets
    // exactly one personal org, created here with a deterministic id
    // (`org_<userId>` / `mem_<userId>`) so this hook and the one-time
    // backfill migration (migrations/0006_backfill_personal_orgs.sql) can
    // never disagree about what that org's id is — whichever runs first
    // wins, the other is a no-op via onConflictDoNothing.
    //
    // Keyed on the user id throughout, so a hook that somehow fires twice
    // for the same account (retried request, dedupe race) is still safe:
    // grant()'s idempotency check makes the second call a no-op rather than
    // a double grant, and the inserts below are onConflictDoNothing.
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            const orgId = `org_${createdUser.id}`;
            const now = new Date();
            // Sequential rather than db.batch(): D1's batch API opens its
            // own implicit transaction, and the `member` table has a FK to
            // `user(id)`. Better Auth has already inserted the user row, but
            // that insert may not have committed yet — it's inside Better
            // Auth's own write sequence. A separate batch transaction cannot
            // see the uncommitted user row, so the FK check on `user_id`
            // fails with SQLITE_CONSTRAINT. Sequential awaits inherit the
            // existing connection context where the user row IS visible.
            await db
              .insert(schema.organization)
              .values({
                id: orgId,
                name: `${createdUser.name || createdUser.email}'s Team`,
                slug: `u-${createdUser.id}`,
                logo: createdUser.image ?? null,
                createdAt: now,
                isPersonal: true,
              })
              .onConflictDoNothing();
            await db
              .insert(schema.member)
              .values({
                id: `mem_${createdUser.id}`,
                organizationId: orgId,
                userId: createdUser.id,
                role: "owner",
                createdAt: now,
              })
              .onConflictDoNothing();
            await grant(db, {
              organizationId: orgId,
              userId: createdUser.id,
              amount: SIGNUP_GRANT_CREDITS,
              reason: "signup_grant",
              idempotencyKey: `signup:${createdUser.id}`,
            });
          },
        },
      },
      session: {
        create: {
          // Resolves `session.activeOrganizationId` once, at sign-in, and
          // persists it on the session row — which lands in both D1 (via
          // the adapter) and KV (via `secondaryStorage` below). That is
          // what makes the active org available from a plain `getSession()`
          // call with zero extra per-request cost, even with cookieCache
          // disabled (see the note on `secondaryStorage` below for why that
          // matters). Falls back to the user's oldest membership; the
          // signup hook above guarantees at least one exists by the time
          // any session can be created for that user, except in the
          // deploy-gap window documented in migrations/0006 — requireOrg()
          // (src/lib/auth/guards.ts) self-heals that case.
          before: async (newSession) => {
            const rows = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, newSession.userId))
              .orderBy(asc(schema.member.createdAt))
              .limit(1);
            if (!rows[0]) return;
            return { data: { ...newSession, activeOrganizationId: rows[0].organizationId } };
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

    /**
     * Persist the OAuth `verification` record to D1, not only to KV.
     *
     * The default state strategy is "database", but once `secondaryStorage`
     * (KV) is configured Better Auth writes the verification record ONLY to
     * secondary storage and skips the database entirely (documented at
     * better-auth.com/docs/reference/errors/state_mismatch). The record is
     * what the Google callback looks up to prove the `state` parameter belongs
     * to the browser that started the flow. Writing it to D1 as well gives the
     * callback a durable, co-located record — verified present in D1 during a
     * real sign-in probe (the `state` from `/sign-in/social` was found in the
     * `verification` table with its callbackURL + codeVerifier intact).
     */
    verification: { storeInDatabase: true },

    account: {
      /**
       * Skip the redundant signed-state-COOKIE check on localhost.
       *
       * Better Auth's database state strategy verifies the callback TWICE
       * (better-auth/dist/state.mjs → parseGenericState):
       *   1. the `state` query param must match the `oauthState` stored in the
       *      D1 verification record — the real CSRF guard, and
       *   2. a SEPARATE signed cookie (`better-auth.state`, signed with
       *      BETTER_AUTH_SECRET) must ALSO round-trip and re-verify.
       *
       * Check (2) is what fails here: `pnpm dev` runs `wrangler dev --remote`,
       * so every request executes on Cloudflare's edge and BETTER_AUTH_SECRET
       * resolves from the Secrets Store binding per-invocation. The Google
       * callback is a top-level CROSS-SITE redirect, and the signed-cookie
       * re-verification across that hop throws `state_security_mismatch`, which
       * Better Auth rewrites to the `state_mismatch` you kept hitting — proven
       * by reproducing the exact 302 → /api/auth/error?error=state_mismatch
       * against the running server WITH the correct state + cookie present.
       *
       * Skipping check (2) does NOT weaken CSRF protection: check (1) — the
       * `oauthState` match against the server-side D1 record, which an attacker
       * cannot forge — still runs and still fails closed. Localhost only; a
       * deployed browser is same-site https on the callback and keeps the
       * stricter cookie check.
       */
      skipStateCookieCheck: isLocalDevelopment,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    },

    plugins: [
      bearer(),
      // The B2B team layer. Vocabulary warning: the plugin's own word
      // "team" means a sub-group *inside* an organization (`team` /
      // `team_member` tables) — a feature we deliberately never enable
      // (`teams` is omitted below). In this product, "team" IS the
      // organization. See src/lib/auth/org-access.ts for the full note.
      organization({
        ac,
        roles,
        // Every user's first org (their personal one) is created by the
        // signup hook above, not through this flag — this only gates
        // *additional* "Create team" calls from the UI.
        organizationLimit: 5,
        // Producer/artist/reviewer/client roles all need a seat, plus the
        // owner — 25 covers every ICP tier in marketing/b2b.md with room
        // to raise it later without a migration.
        membershipLimit: 25,
        creatorRole: "owner",
        invitationExpiresIn: 60 * 60 * 24 * 14, // 14 days
        cancelPendingInvitationsOnReInvite: true,
        // No `sendInvitationEmail` — there is no email provider in this
        // stack (see docs/tech-stack.md's deferred Email decision) and this
        // product is invite-link-only by design. `POST /api/v1/orgs/:id/
        // invites` returns a copyable link instead; see src/pages/api/v1/
        // orgs/[id]/invites.ts.
        schema: {
          organization: {
            additionalFields: {
              isPersonal: { type: "boolean", defaultValue: false, input: false },
            },
          },
        },
      }),
    ],

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
    //    user row after Google's redirect back). Localhost uses a temporary
    //    60-attempt/hour allowance for manual QA; deployed environments retain
    //    the stricter 5/8-attempt production limits.
    /**
     * OFF on localhost, unchanged in production.
     *
     * The previous "generous" local allowance (60 sign-ins/hour) still ran out
     * during a long manual QA session and then answered
     * `POST /api/auth/sign-in/social` with 429 for the rest of the hour — with no
     * way to clear it except deleting keys out of the miniflare KV sqlite. A rate
     * limit on a single developer's own machine protects nothing; it only blocks
     * the person testing. Deployed environments keep the strict 5/8-per-hour
     * account-creation limits, which is where abuse actually happens.
     */
    rateLimit: {
      enabled: !isLocalDevelopment,
      window: 60,
      max: 100,
      storage: "secondary-storage",
      customRules: {
        "/sign-in/social": { window: 60 * 60, max: 5 },
        "/callback/:id": { window: 60 * 60, max: 8 },
      },
    },

    advanced: {
      /**
       * HTTPS in production, plain HTTP on localhost.
       *
       * This used to be unconditionally `true` with a note that Better Auth
       * exempts localhost. It does not exempt `wrangler dev`: on
       * http://localhost:8787 the browser silently DROPS a `Secure` cookie, so
       * sign-in appeared to succeed and then every authenticated request behaved
       * as anonymous (403 on POST /api/voice/token). Gating on the hostname keeps
       * production strict while making the voice-capable local server usable.
       */
      useSecureCookies: !isLocalDevelopment,
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

export type Auth = Awaited<ReturnType<typeof createAuth>>;
