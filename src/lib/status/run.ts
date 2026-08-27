/* Runs the probe registry and assembles the payload /status renders.
 *
 * The isolation rule: one probe failing, hanging or throwing must never take
 * down the status page. A monitoring surface that goes dark exactly when
 * something is broken is worse than having none, because its silence is
 * indistinguishable from everything being fine.
 */

import type { APIContext } from "astro";
import { PROBES, PROBE_TIMEOUT_MS, SLOW_BINDING_MS } from "./probes";
import {
  isObserved,
  type ComponentStatus,
  type ObservedState,
  type Probe,
  type ProbeOutcome,
  type StatusPayload,
  type StatusSummary,
} from "./types";

/** How long the caller should wait before asking again. */
const REFRESH_AFTER_SECONDS = 30;

/** Worst-first, so `reduce` can pick the summary state. */
const SEVERITY: Record<ObservedState, number> = { down: 2, degraded: 1, operational: 0 };

async function runOne(
  probe: Probe,
  env: Env,
  origin: string,
  context?: APIContext,
): Promise<ProbeOutcome> {
  if (probe.metered || !probe.run) {
    return { state: "metered", latencyMs: null, note: "not probed", say: probe.meteredReason };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Race the probe against the same deadline its fetches use. A binding call
    // (D1, KV, R2) does not accept an AbortSignal, so the signal alone cannot
    // bound this — without the race a hung binding would hold the whole request
    // open until the platform killed it.
    return await Promise.race([
      probe.run({
        env,
        origin,
        signal: controller.signal,
        // Registry value wins; bindings fall back to the tight default.
        budget: probe.slowMs ?? SLOW_BINDING_MS,
        context,
      }),
      new Promise<ProbeOutcome>((resolve) =>
        setTimeout(
          () => resolve({ state: "down", latencyMs: PROBE_TIMEOUT_MS, note: "timed out" }),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (error) {
    // Message text is not surfaced: it can carry internal hostnames, paths and
    // occasionally credential fragments from an upstream client. It is logged
    // for the team and reduced to a state for the public.
    console.error(`status probe "${probe.id}" threw:`, error);
    return { state: "down", latencyMs: null, note: "check failed" };
  } finally {
    clearTimeout(timer);
  }
}

function summarise(components: ComponentStatus[]): StatusSummary {
  const probed = components.filter((c) => isObserved(c.state));
  const metered = components.length - probed.length;
  const healthy = probed.filter((c) => c.state === "operational").length;
  const worst = probed.reduce<ObservedState>(
    (acc, c) => (SEVERITY[c.state as ObservedState] > SEVERITY[acc] ? (c.state as ObservedState) : acc),
    "operational",
  );

  // Brand voice, but the headline must never overstate. "All systems drawing"
  // is only allowed when every probed component is genuinely operational.
  const headline =
    worst === "operational"
      ? "All systems drawing"
      : worst === "degraded"
        ? "Drawing, a little slowly"
        : "Something is not drawing";

  const detail =
    worst === "operational"
      ? `${healthy} of ${probed.length} checks passed. ${metered} metered components are listed but never called.`
      : `${healthy} of ${probed.length} checks passed. See the affected rows below for what is impacted.`;

  return {
    state: worst,
    headline,
    detail,
    probedCount: probed.length,
    healthyCount: healthy,
    meteredCount: metered,
  };
}

/**
 * Probe everything in parallel and merge in recorded history.
 *
 * `history` is passed in rather than fetched here so this stays a pure function
 * of (env, origin, history) — which is what lets the cron reuse it to take a
 * sample without also reading back 90 days of rows it does not need.
 */
export async function collectStatus(
  env: Env,
  origin: string,
  history: Map<string, { states: ObservedState[]; uptime: number | null }> = new Map(),
  context?: APIContext,
): Promise<StatusPayload> {
  const outcomes = await Promise.all(PROBES.map((probe) => runOne(probe, env, origin, context)));

  const components: ComponentStatus[] = PROBES.map((probe, i) => {
    const recorded = history.get(probe.id);
    return {
      id: probe.id,
      name: probe.name,
      detail: probe.detail,
      group: probe.group,
      meteredReason: probe.meteredReason,
      ...outcomes[i],
      // A metered component has no observations, so it must not display an
      // uptime figure — an empty strip is the honest rendering.
      uptime90d: probe.metered ? null : (recorded?.uptime ?? null),
      history: probe.metered ? [] : (recorded?.states ?? []),
    };
  });

  return {
    summary: summarise(components),
    components,
    checkedAt: new Date().toISOString(),
    colo: null,
    refreshAfterSeconds: REFRESH_AFTER_SECONDS,
  };
}
