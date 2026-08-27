/**
 * The real Worker entry point — `wrangler.json`'s `main` points here, not at
 * `dist/_worker.js/index.js` directly.
 *
 * @astrojs/cloudflare's build output only ever exports a `fetch` handler;
 * the adapter has no support for `scheduled()` (checked its dist output —
 * there's no such hook anywhere in the package). Cloudflare Cron Triggers
 * need a `scheduled` export on the *deployed* Worker, so this file re-exports
 * Astro's build as-is and adds the one export Astro can't produce: the hourly
 * reconciliation pass from docs/architecture.md § "Failure modes".
 *
 * This imports `dist/_worker.js/index.js`, which only exists after `astro
 * build` has run — true for `wrangler deploy` (always builds first, see the
 * `deploy`/`deploy:staging` scripts) and for `wrangler dev --remote`
 * (scripts/dev.mjs builds before starting it). Wrangler bundles this file
 * and its import together at that point, so the relative path resolves fine
 * despite living outside `src/`.
 */
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema";
import { reconcile } from "../src/lib/credits/reconcile";
import { sweepBatches } from "../src/lib/batch/sweep";
import { collectStatus } from "../src/lib/status/run";
import { recordSamples } from "../src/lib/status/history";
import astroWorker from "../dist/_worker.js/index.js";

/**
 * The roadmap board's tldraw sync server. Durable Object classes must be
 * exported from the Worker's entry module for Cloudflare to instantiate them,
 * and `wrangler.json`'s `main` points here — so this re-export is what makes
 * the `ROADMAP_ROOM` binding resolve. Same reason `scheduled` lives here:
 * exports Astro's build cannot produce belong in this file.
 */
export { RoadmapRoom } from "../src/roadmap/RoadmapRoom";

/**
 * Per-board tldraw sync server. Same pattern as RoadmapRoom: must be exported
 * from the Worker entry for the `BOARD_ROOM` binding to resolve.
 */
export { BoardRoom } from "../src/boards/BoardRoom";

type ExportedHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
};

const worker = astroWorker as ExportedHandler;

export default {
  fetch: worker.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema });
    ctx.waitUntil(
      reconcile(db).then((report) => {
        console.log("Hourly reconciliation:", JSON.stringify(report));
        if (report.negativeBalances.length > 0) {
          // No alerting integration configured yet — a negative balance means
          // one of the spend()/refund() guards in src/lib/credits/index.ts
          // failed somewhere, which is worth a human's attention. Logging it
          // clearly is the honest interim: don't pretend to page anyone.
          console.error("Reconciliation found negative balances:", report.negativeBalances);
        }
      }),
    );
    // Same hourly tick, same best-effort logging discipline — see
    // src/lib/batch/sweep.ts for what this repairs and why it's a separate
    // pass from reconcile() rather than folded into it (batch_item/batch_job
    // have their own stuck-state shape, distinct from the ledger/balance
    // drift reconcile() targets).
    ctx.waitUntil(
      sweepBatches(db).then((report) => {
        console.log("Hourly batch sweep:", JSON.stringify(report));
      }),
    );

    /**
     * Availability sample for /status.
     *
     * The cron is the only writer — see migrations/0015_status_history.sql for
     * why the request path must not record samples. A fixed hourly cadence is
     * also what makes the published uptime figure mean anything: it is taken
     * whether or not anyone is looking, rather than being biased toward the
     * moments the site had traffic.
     *
     * `origin` is the production hostname because a cron isolate has no
     * incoming request to derive one from, and two probes (static assets and the
     * auth endpoint) are same-origin.
     */
    ctx.waitUntil(
      collectStatus(env, "https://doodleai.art")
        .then((payload) => recordSamples(db, payload).then((n) => ({ payload, n })))
        .then(({ payload, n }) => {
          console.log(
            `Hourly status sample: ${n} components recorded, summary=${payload.summary.state}`,
          );
          const unhealthy = payload.components.filter(
            (c) => c.state === "down" || c.state === "degraded",
          );
          if (unhealthy.length > 0) {
            // Same discipline as the reconciliation logging above: no alerting
            // integration exists yet, so log it clearly rather than pretend
            // someone was paged.
            console.error(
              "Status sample found unhealthy components:",
              unhealthy.map((c) => `${c.id}=${c.state}${c.note ? ` (${c.note})` : ""}`).join(", "),
            );
          }
        })
        .catch((error) => {
          // A failed sample must never fail the tick that also reconciles the
          // credit ledger — that is the job with money attached.
          console.error("Hourly status sample failed:", error);
        }),
    );
  },
};
