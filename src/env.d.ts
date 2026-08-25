type Runtime = import("@astrojs/cloudflare").Runtime<Env>;
type SecretLike = import("./lib/secrets").SecretLike;

declare namespace App {
  type Locals = Runtime;
}

interface Env {
  ASSETS: Fetcher;
  /** D1 binding declared in wrangler.json. Reached via src/db/client.ts. */
  DB: D1Database;
  /** KV binding used as Better Auth's secondaryStorage (session cache). */
  SESSIONS: KVNamespace;

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
}
