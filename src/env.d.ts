type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  type Locals = Runtime;
}

interface Env {
  ASSETS: Fetcher;
  /** D1 binding declared in wrangler.json. Reached via src/db/client.ts. */
  DB: D1Database;
  /** KV binding used as Better Auth's secondaryStorage (session cache). */
  SESSIONS: KVNamespace;

  // Secrets — set locally in .dev.vars, in production via `wrangler secret put`.
  BETTER_AUTH_SECRET?: string;
  /** Overrides the request origin as Better Auth's baseURL. Optional. */
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  /** Server-only PicX key used for authenticated, credit-metered generation. */
  PICX_API_KEY?: string;
}
