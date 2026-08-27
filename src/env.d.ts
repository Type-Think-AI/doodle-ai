type Runtime = import("@astrojs/cloudflare").Runtime<Env>;
type SecretLike = import("./lib/secrets").SecretLike;
type AdminContext = import("./lib/auth/admin-guard").AdminContext;

/**
 * Client-visible env. PUBLIC_-prefixed vars are inlined into the browser
 * bundle by Vite, which is exactly what the tldraw license key requires —
 * tldraw validates it in the browser, so it cannot be a server secret.
 * It is still kept out of tracked source (.dev.vars locally, a Worker var
 * in deploys) so the key isn't published in the public repo.
 */
interface ImportMetaEnv {
  readonly PUBLIC_TLDRAW_LICENSE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals extends Runtime {
    /**
     * Set by src/middleware.ts on requests that already cleared the
     * /admin or /api/admin platform-role check, so a route doesn't
     * re-query a role the middleware just resolved. Undefined on every
     * non-admin request. Never treat this as the authority — routes that
     * need full 'admin' still call requireAdmin() themselves.
     */
    admin?: AdminContext;
  }
}

interface Env {
  ASSETS: Fetcher;
  /** D1 binding declared in wrangler.json. Reached via src/db/client.ts. */
  DB: D1Database;
  /** KV binding used as Better Auth's secondaryStorage (session cache). */
  SESSIONS: KVNamespace;
  /**
   * One tldraw sync room per roadmap board (src/roadmap/RoadmapRoom.ts).
   * SQLite-backed, so it works on the Workers free plan.
   */
  ROADMAP_ROOM: DurableObjectNamespace<import("./roadmap/RoadmapRoom").RoadmapRoom>;
  /**
   * One tldraw sync room per user board (src/boards/BoardRoom.ts).
   * SQLite-backed. The DO id is derived from `idFromName(boardId)`.
   */
  BOARD_ROOM: DurableObjectNamespace<import("./boards/BoardRoom").BoardRoom>;
  /**
   * Images, screenshots and video pasted onto the roadmap board. R2 rather than
   * D1 or the DO's SQLite: these are large binaries, and a screenshot with an
   * arrow drawn on it is the single most useful piece of feedback an artist can
   * leave — it must not be squeezed into a row.
   */
  ROADMAP_ASSETS: R2Bucket;

  // Secrets. Two supported mechanisms, both read through
  // src/lib/secrets.ts's readSecret() so call sites don't branch on shape:
  //
  //  - a plain string, from `.dev.vars` locally or `wrangler secret put`
  //  - a Secrets Store binding (`secrets_store_secrets` in wrangler.json),
  //    which is account-level and shared across Workers, and is read with
  //    an async `get()` rather than as a string
  //
  // Local `astro dev` can only use the string form — Secrets Store secrets
  // created with `--remote` are not readable from local development.
  BETTER_AUTH_SECRET?: SecretLike;
  /** Overrides the request origin as Better Auth's baseURL. Optional. */
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: SecretLike;
  GOOGLE_CLIENT_SECRET?: SecretLike;
  OPENROUTER_API_KEY?: SecretLike;
  OPENROUTER_MODEL?: SecretLike;
  /** Server-only PicX key used for authenticated, credit-metered generation. */
  PICX_API_KEY?: SecretLike;
  /**
   * Signing secret for inbound PicX webhook deliveries (POST /api/webhooks/picx).
   *
   * This is the key-derived secret shown on the API key's detail view in the PicX
   * developer console — NOT a `whsec_` from a registered webhook, because a
   * per-request `callback_url` is signed with the derived one. It is not
   * obtainable from any `/v1` endpoint, so it has to be copied from the console.
   *
   * Setting it is what switches batch generation from blocking on each render to
   * submitting and being called back (see src/lib/batch/run.ts). While it is
   * unset the receiver refuses every delivery with 503 and the batch pipeline
   * keeps using the synchronous path, so an unconfigured deployment is degraded
   * rather than broken.
   *
   * NOT YET WIRED as a Secrets Store binding in wrangler.json, deliberately.
   * Cloudflare validates the binding at deploy time and rejects the whole deploy
   * with error 10182 if the referenced secret does not exist yet — which would
   * break staging AND prod deploys, including the git-connected auto-deploy, for
   * as long as the secret were missing. Create the secret first, then add the
   * binding to both `secrets_store_secrets` blocks:
   *
   *   wrangler secrets-store secret create 801d9480d51848d69033ff869398bcbe \
   *     --name PICX_WEBHOOK_SECRET --scopes workers --remote
   *
   *   { "binding": "PICX_WEBHOOK_SECRET",
   *     "store_id": "801d9480d51848d69033ff869398bcbe",
   *     "secret_name": "PICX_WEBHOOK_SECRET" }
   *
   * The type stays declared because the code reads it today and tolerates its
   * absence; only the binding is deferred.
   */
  PICX_WEBHOOK_SECRET?: SecretLike;
  /**
   * Recovery hatch for platform admin access. If migrations/
   * 0008_seed_first_admin.sql matched zero rows (the account had not signed
   * up yet when migrations ran), there is otherwise no way to create the
   * first admin, because creating one requires already being one.
   *
   * Only ever *raises* a role, never lowers one, and logs a warning on every
   * use. Unset it once the account has been promoted properly through
   * PATCH /api/admin/users/:id/role.
   */
  ADMIN_BOOTSTRAP_EMAIL?: SecretLike;
}
