/* The single entry point drizzle.config.ts points at, so `drizzle-kit
   generate` sees every table in one place. Import from here rather than from
   the individual files so the schema object passed to drizzle() is complete. */
export * from "./auth";
export * from "./billing";
export * from "./product";
export * from "./boards";
export * from "./status";
