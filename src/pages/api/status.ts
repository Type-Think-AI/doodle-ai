// deploy-loop check: 2026-08-28 — verify dev→staging auto-deploy (safe to remove)
/**
 * GET /api/status — machine-readable system status.
 *
 * Public and unauthenticated by design: a status page you must log in to read is
 * useless during the outage where it matters. Two consequences are enforced
 * here rather than left to the probes:
 *
 *  1. CACHED AT THE EDGE. Without this the endpoint is a free amplifier — one
 *     visitor holding refresh, or a crawler, turns into unbounded D1/KV/R2 calls
 *     and outbound requests to Google, PicX and OpenRouter. The cache window is
 *     shorter than the page's poll interval so a human still sees movement.
 *
 *  2. NO PRIVILEGED DETAIL. `?detail=full` adds exact figures (credit balances,
 *     which secret is missing) and is admin-gated. Everyone else gets states and
 *     latencies, which is all a status page owes the public.
 */

import type { APIContext } from "astro";
import { getDb } from "../../db/client";
import { collectStatus } from "../../lib/status/run";
import { loadHistory } from "../../lib/status/history";
import type { StatusPayload } from "../../lib/status/types";

export const prerender = false;

/** Shorter than the page's 30s poll, so a refresh is never served a stale tick. */
const EDGE_CACHE_SECONDS = 20;

export async function GET(context: APIContext): Promise<Response> {
  const payload = await buildStatus(context);

  return new Response(JSON.stringify(payload, null, 2), {
    status: payload.summary.state === "down" ? 503 : 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // s-maxage caches at the Cloudflare edge; stale-while-revalidate keeps the
      // page fast during a slow probe round instead of blocking on it.
      "cache-control": `public, max-age=10, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=60`,
      // A 503 is a real signal for uptime watchers, so make it explicit that a
      // retry is cheap and soon.
      ...(payload.summary.state === "down" ? { "retry-after": "30" } : {}),
    },
  });
}

/**
 * Shared by this route and the /status page, so the page never has to make an
 * HTTP call back into its own Worker to render itself — that would double the
 * probe work and add a hop that can fail on its own.
 */
export async function buildStatus(context: APIContext): Promise<StatusPayload> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env) {
    throw new Error("Cloudflare bindings unavailable — check platformProxy in astro.config.mjs");
  }

  // History is best-effort: if D1 is the thing that is broken, the live probes
  // are exactly what a visitor needs, and failing the whole page because the
  // history query failed would hide that.
  let history = new Map();
  try {
    history = await loadHistory(getDb(context));
  } catch (error) {
    console.error("status history unavailable:", error);
  }

  const payload = await collectStatus(env, new URL(context.request.url).origin, history, context);

  const colo = (context.request as { cf?: { colo?: string } }).cf?.colo;
  return { ...payload, colo: typeof colo === "string" ? colo : null };
}
