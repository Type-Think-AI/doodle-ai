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
 * As of the astro 7 / `@astrojs/cloudflare` 14 migration this composes
 * Astro's SSR handler by importing the adapter's published server
 * entrypoint (`@astrojs/cloudflare/entrypoints/server`, whose default export
 * is `{ fetch }`) rather than the old `dist/_worker.js/index.js` file. The v14
 * adapter builds through `@cloudflare/vite-plugin`, which reads `wrangler.json`'s
 * `main` (this file) as THE Worker entry and bundles it directly — it no longer
 * emits a standalone `dist/_worker.js` for a separate wrangler pass to wrap. The
 * server entrypoint pulls in the adapter's `virtual:astro-cloudflare:config`
 * and `cloudflare:workers` virtual modules, which resolve only inside that
 * plugin's build; bundling this file through the adapter is what makes them
 * (and the relative `../src/*` imports below) resolve.
 */
import { routeAgentRequest } from "agents";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema";
import { reconcile } from "../src/lib/credits/reconcile";
import { sweepBatches } from "../src/lib/batch/sweep";
import { collectStatus } from "../src/lib/status/run";
import { recordSamples } from "../src/lib/status/history";
import { syncIndexNow } from "../src/lib/seo/submit";
import { SITE_ORIGIN, fetchPageInventory } from "../src/lib/seo/inventory";
import { refreshBingIndex } from "../src/lib/seo/refresh";
import type { SecretLike } from "../src/lib/secrets";
import astroWorker from "@astrojs/cloudflare/entrypoints/server";

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

/**
 * Real-time voice mode. Third Durable Object, same export-from-entry pattern:
 * the `VOICE_ROOM` binding resolves because this class is exported here.
 */
export { VoiceRoom } from "../src/voice/VoiceRoom";

type ExportedHandler = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
};

const worker = astroWorker as ExportedHandler;

export default {
  /**
   * Route `/agents/*` to the Agents SDK before handing anything to Astro.
   *
   * This is REQUIRED for voice mode and was the missing link: the browser opens
   * `ws://<host>/agents/voice-room/<name>?token=…`, and `routeAgentRequest`
   * is what resolves that path to the VoiceRoom Durable Object and performs the
   * WebSocket upgrade. Without it every voice socket hit Astro's handler, which
   * has no such route, and the browser reported
   * "WebSocket is closed before the connection is established" — the connection
   * failure seen in local testing.
   *
   * Everything that is not an agents path falls through to Astro unchanged, so
   * no existing route behaviour changes.
   *
   * NOTE: this only exists in the WORKER. `astro dev` (port 4321) never loads
   * this file, so voice cannot work there at all — use `pnpm dev`, which builds
   * the Worker and runs it under `wrangler dev` with the real Durable Object and
   * AI bindings.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/agents/")) {
      const routed = await routeAgentRequest(request, env);
      if (routed) return routed;
    }
    return worker.fetch(request, env, ctx);
  },

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

    /**
     * IndexNow push for /admin/seo.
     *
     * Hourly is the right cadence because IndexNow exists to tell search
     * engines about a change *promptly* — a daily job would make a new article
     * wait up to 24 hours for the one signal that was supposed to be instant.
     * It is safe at that cadence only because `syncIndexNow` pushes a URL just
     * once per content change (see `selectPendingUrls`), so the steady state is
     * a discovery pass and zero submissions. The IndexNow FAQ warns specifically
     * against resubmitting unchanged URLs, and that predicate is what honours it.
     *
     * `trigger: "cron"` and never `force`. A forced run resubmits all ~145 URLs;
     * doing that hourly is how a host earns a 429 and gets treated as a spammer,
     * so it stays an explicit admin action behind a confirm dialog.
     *
     * The origin is the production hostname for the same reason the status probe
     * hardcodes it: a cron isolate has no request to derive one from. That also
     * means staging's cron would submit production URLs, which is why staging
     * simply has no INDEXNOW_KEY binding — the run reports `skipped` and pushes
     * nothing.
     */
    ctx.waitUntil(
      syncIndexNow(db, {
        env: env as unknown as Record<string, SecretLike>,
        trigger: "cron",
        // Over HTTP, because this file is bundled by wrangler and cannot resolve
        // `astro:content`. src/lib/seo/inventory.ts documents that constraint;
        // `wrangler deploy --dry-run` is what enforces it.
        loadPages: () => fetchPageInventory(SITE_ORIGIN),
      })
        .then((report) => {
          console.log("Hourly IndexNow sync:", JSON.stringify(report));
          if (report.skipped) {
            // Not an error: an absent key is the normal state on staging and
            // before the secret is provisioned. Logged at info level so it is
            // visible without looking like a failure.
            console.log(`IndexNow sync skipped: ${report.skipped}`);
          } else if (!report.ok) {
            console.error(
              `IndexNow sync failed (status=${report.statusCode}): ${report.error ?? "unknown"}`,
            );
          }
        })
        .catch((error) => {
          console.error("Hourly IndexNow sync failed:", error);
        }),
    );

    /**
     * Bing index read for /admin/seo.
     *
     * DAILY, not hourly, and that is the whole reason it is gated on the hour
     * rather than sitting beside the sync above. A sweep costs a bounded but real
     * number of Bing Webmaster API calls, and an engine's index does not move
     * fast enough for 24 reads a day to tell you anything 1 does not — the push
     * side is hourly because IndexNow exists to be prompt, which is the opposite
     * requirement.
     *
     * 03:00 UTC is chosen only for being outside the traffic peak; nothing
     * depends on the exact hour. If the cron expression in wrangler.json ever
     * stops firing hourly this silently stops running, so the two are a pair.
     */
    if (new Date(_event.scheduledTime).getUTCHours() === 3) {
      ctx.waitUntil(
        refreshBingIndex(db, {
          env: env as unknown as Record<string, SecretLike>,
          origin: SITE_ORIGIN,
        })
          .then((report) => {
            console.log("Daily Bing index read:", JSON.stringify(report));
            if (report.skipped) {
              // Absent credential is the normal state before setup; not an error.
              console.log(`Bing index read skipped: ${report.skipped}`);
            } else if (!report.ok) {
              console.error(`Bing index read failed: ${report.error ?? "unknown"}`);
            }
          })
          .catch((error) => {
            console.error("Daily Bing index read failed:", error);
          }),
      );
    }
  },
};
