import type { Config } from "drizzle-kit";

/**
 * drizzle-kit only ever *generates* SQL here — it never connects to D1.
 * Migrations are applied by `wrangler d1 migrations apply doodleai`
 * (see package.json's db:migrate:* scripts), which reads the same
 * `migrations` directory declared in wrangler.json's d1_databases entry.
 * That split is why no credentials are configured below: `generate` diffs
 * the TypeScript schema against the existing migration files and writes a
 * new one, entirely offline.
 */
export default {
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
