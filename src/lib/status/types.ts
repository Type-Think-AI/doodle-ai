/* Shared vocabulary for /status — imported by the probes, the API route, the
   page, and the cron that records history. */

import type { APIContext } from "astro";

/**
 * What a component can be.
 *
 * `metered` is the state that makes this status page honest. Image generation,
 * video generation and chat inference all cost real money per call, so probing
 * them on a public cadence would spend the product's credits to render a green
 * dot. They are therefore listed and explicitly marked as unmeasured, rather
 * than omitted (which would hide that they exist) or shown green (which would
 * be a claim we did not verify).
 *
 * It is deliberately NOT part of `ObservedState`: a metered component has no
 * observation, so it can never be written to history or counted in uptime.
 */
export type ProbeState = "operational" | "degraded" | "down" | "metered";

/** The subset of states that represent an actual measurement. */
export type ObservedState = Exclude<ProbeState, "metered">;

export function isObserved(state: ProbeState): state is ObservedState {
  return state !== "metered";
}

/** Display grouping on the page, in render order. */
export type ProbeGroup = "edge" | "data" | "identity" | "generation" | "integrity";

export const GROUP_LABELS: Record<ProbeGroup, { title: string; note: string }> = {
  edge: { title: "Edge & compute", note: "Cloudflare Workers" },
  data: { title: "Data", note: "D1 · KV · R2 · Durable Objects" },
  identity: { title: "Identity", note: "Better Auth · Google · Secrets Store" },
  generation: { title: "Generation", note: "reachability only — never a paid call" },
  integrity: { title: "Integrity", note: "our own invariants, checked hourly" },
};

export const GROUP_ORDER: ProbeGroup[] = ["edge", "data", "identity", "generation", "integrity"];

/** What a single probe reports for one check. */
export interface ProbeOutcome {
  state: ProbeState;
  /** Round-trip in ms, or null where the probe has nothing to time. */
  latencyMs: number | null;
  /**
   * Short qualifier shown next to the state pill, e.g. "6 / 6 resolved".
   *
   * MUST be safe for a public, unauthenticated page: no secret material, no
   * internal hostnames, and no exact capacity figures (see the generation
   * probes for why a credit balance is reported as a band, not a number).
   */
  note?: string | null;
  /** Plain-English sentence for the page's human-readable column. */
  say?: string | null;
}

/** A probe's static identity plus how to run it. */
export interface Probe {
  /** Stable history key. Changing it starts that component's history over. */
  id: string;
  name: string;
  /** Monospace subtitle naming the concrete resource, e.g. "D1 · doodleai". */
  detail: string;
  group: ProbeGroup;
  /**
   * When false the probe is never invoked and always reports `metered`. Kept as
   * a declared property rather than an early return inside the probe body so the
   * "we do not call this" decision is visible in the registry itself.
   */
  metered?: boolean;
  /** Why it is not probed. Rendered verbatim on the page. Required if metered. */
  meteredReason?: string;
  /**
   * Latency above which this component counts as degraded, in ms.
   *
   * Per-probe rather than one global number because the budgets differ by an
   * order of magnitude: a D1 query in the same colo answers in tens of ms, while
   * a round trip to a third-party API across the public internet routinely takes
   * several hundred and is perfectly healthy. One global threshold either cries
   * wolf on every third-party call or never catches a slow binding — an 800ms
   * global limit was reporting PicX's health endpoint as degraded at 811ms.
   */
  slowMs?: number;
  run?: (ctx: ProbeContext) => Promise<ProbeOutcome>;
}

/** Everything a probe is allowed to touch. Never the raw secret values. */
export interface ProbeContext {
  env: Env;
  /**
   * Absolute origin of the running deployment.
   *
   * Informational only — do NOT use it to probe this app's own routes. A
   * Worker's fetch() to its own hostname does not re-enter its own asset
   * handler or routes, so a same-origin probe returns 404 for paths that serve
   * 200 to real traffic. Two probes were reporting false 'degraded' on staging
   * for exactly that reason. Use a binding or an in-process call instead.
   */
  origin: string;
  /** Per-probe deadline. Every outbound fetch must pass this. */
  signal: AbortSignal;
  /** This probe's degraded-above latency budget, resolved by the runner. */
  budget: number;
  /**
   * The live request context, for probes that must exercise app code in-process
   * rather than over HTTP (see `origin`). Absent in the cron sampler, which has
   * no incoming request — probes that need it must degrade gracefully.
   */
  context?: APIContext;
}

/** One component's result, as served by /api/status. */
export interface ComponentStatus extends ProbeOutcome {
  id: string;
  name: string;
  detail: string;
  group: ProbeGroup;
  meteredReason?: string;
  /** Rolling availability over the reported window, or null with no history. */
  uptime90d: number | null;
  /** Oldest-to-newest observed states for the history strip. */
  history: ObservedState[];
}

export interface StatusSummary {
  /** Worst observed state across probed components. */
  state: ObservedState;
  /** Brand-voice verdict, e.g. "All systems drawing". */
  headline: string;
  /** One sentence of specifics under the headline. */
  detail: string;
  probedCount: number;
  healthyCount: number;
  meteredCount: number;
}

export interface StatusPayload {
  summary: StatusSummary;
  components: ComponentStatus[];
  checkedAt: string;
  /** Cloudflare colo that served the check, when exposed. */
  colo: string | null;
  /** Seconds the caller should wait before re-requesting. */
  refreshAfterSeconds: number;
}
