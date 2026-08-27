/* Availability history for /status. See migrations/0015_status_history.sql for
   why samples are written by the hourly cron rather than by the request path. */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const statusSample = sqliteTable(
  "status_sample",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /**
     * Stable probe id from PROBES in src/lib/status/probes.ts. No foreign key by
     * design: probes live in code, and a retired probe's history should outlive
     * its removal instead of vanishing and retroactively improving uptime.
     */
    component: text("component").notNull(),
    /**
     * 'operational' | 'degraded' | 'down'.
     *
     * Never 'metered'. A metered component is deliberately never called, so
     * there is no observation to store — and storing one would let a component
     * we do not measure influence a number we publish.
     */
    state: text("state").notNull(),
    /** NULL when the probe has no round trip to time (e.g. secret resolution). */
    latencyMs: integer("latency_ms"),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("status_sample_component_checked_idx").on(t.component, t.checkedAt),
    index("status_sample_checked_idx").on(t.checkedAt),
  ],
);
