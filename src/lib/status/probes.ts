/* The probe registry behind /status.
 *
 * Two rules govern everything in this file.
 *
 * 1. NO PROBE MAY COST MONEY. Every check here is either a Cloudflare binding
 *    call (billed as part of the request we are already serving) or a free
 *    third-party endpoint. Image generation, video generation and LLM inference
 *    are declared `metered` and never invoked — see `types.ts` for why they are
 *    still listed. If you add a probe, confirm its endpoint is free before
 *    wiring it: a status page that bills the product to prove it is alive is a
 *    self-inflicted outage waiting for a traffic spike.
 *
 * 2. NOTHING SECRET OR CAPACITY-REVEALING LEAVES THIS FILE. /status is public
 *    and unauthenticated. Secrets are checked for *presence* and never read
 *    into a message. Credit balances are reported as a coarse band, never as a
 *    number, because an exact figure tells the internet how much capacity is
 *    left and exactly when the product is about to stop working.
 */

import type { Probe, ProbeContext, ProbeOutcome } from "./types";

/** Anything slower than this is indistinguishable from broken to a visitor. */
export const PROBE_TIMEOUT_MS = 2500;
/**
 * Default latency budgets, overridable per probe via `slowMs`.
 *
 * BINDING covers calls that stay inside Cloudflare's network (D1, KV, R2, the
 * Worker's own routes) — those should be fast, and slowness there is a real
 * signal. THIRD_PARTY covers a round trip across the public internet, where
 * several hundred milliseconds is normal and flagging it produces noise rather
 * than information.
 */
export const SLOW_BINDING_MS = 400;
const SLOW_THIRD_PARTY_MS = 1800;
/** Below this many PicX credits the capacity probe reports 'running low'. */
const LOW_CREDIT_THRESHOLD = 200;

/**
 * Latency-aware verdict for a probe that succeeded.
 *
 * `budget` is the probe's own threshold; the runner passes it in from the
 * registry so a probe body never has to know which class of call it is.
 */
function ok(
  latencyMs: number,
  budget: number,
  note?: string | null,
  say?: string | null,
): ProbeOutcome {
  return { state: latencyMs > budget ? "degraded" : "operational", latencyMs, note, say };
}

/**
 * Verdict for a binding that is not present in this environment at all.
 *
 * Reported separately from a failed call on purpose. "check failed" says the
 * dependency is broken; this says the deployment was never wired to it — a
 * configuration fault with a completely different fix. Conflating them cost real
 * time on this project before: an empty Secrets Store binding presented as a
 * runtime error, and the actual problem was a missing binding in wrangler.json.
 *
 * `degraded` rather than `down`: in local development (wrangler.local.json omits
 * R2 and Durable Objects on purpose) this is expected and must not paint the
 * whole page red, while in production it is a real, visible defect.
 */
function notConfigured(what: string): ProbeOutcome {
  return {
    state: "degraded",
    latencyMs: null,
    note: "not configured",
    say: `${what} is not wired up in this environment, so it could not be checked.`,
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

/**
 * A same-origin or third-party GET constrained to the probe deadline.
 *
 * `redirect: "manual"` matters: a probe should report on the endpoint it was
 * pointed at, not silently follow a redirect and grade something else.
 */
async function probeFetch(url: string, ctx: ProbeContext, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    method: init?.method ?? "GET",
    redirect: "manual",
    signal: ctx.signal,
    headers: { "user-agent": "doodleai-status/1.0", ...(init?.headers ?? {}) },
  });
}

/** Secrets Store bindings resolve lazily; `.get()` is the only proof they exist. */
async function secretPresent(binding: unknown): Promise<boolean> {
  if (!binding) return false;
  // A plain string is the local-dev shape (.dev.vars via platformProxy).
  if (typeof binding === "string") return binding.trim().length > 0;
  const store = binding as { get?: () => Promise<string | undefined> };
  if (typeof store.get !== "function") return false;
  try {
    const value = await store.get();
    return typeof value === "string" && value.trim().length > 0;
  } catch {
    return false;
  }
}

export const PROBES: Probe[] = [
  /* ─── Edge & compute ─────────────────────────────────────────────── */
  {
    id: "worker",
    name: "Application",
    detail: "Worker · doodleai-agent",
    group: "edge",
    // Nothing to call: this code is running, which is the measurement. Reporting
    // a latency here would mean timing an empty function and calling it uptime.
    run: async () => ({
      state: "operational",
      latencyMs: null,
      note: "serving",
      say: "The app itself is up — this page was rendered by the Worker you are asking about.",
    }),
  },
  {
    id: "assets",
    name: "Static assets",
    detail: "ASSETS binding",
    group: "edge",
    run: async (ctx) => {
      const assets = (ctx.env as { ASSETS?: { fetch: (r: Request) => Promise<Response> } }).ASSETS;
      if (!assets?.fetch) return notConfigured("The static asset binding");
      // Through the binding, not over HTTP to our own origin. A Worker's fetch()
      // to its own hostname does not pass through the assets handler, so the
      // previous same-origin version reported 404 on staging for a file that
      // serves 200 to real traffic — a false 'degraded' on a healthy component.
      const { value, ms } = await timed(() =>
        assets.fetch(new Request("https://assets.internal/favicon.svg")),
      );
      if (!value.ok) return { state: "degraded", latencyMs: ms, note: `HTTP ${value.status}` };
      return ok(ms, ctx.budget, null, "Fonts, icons and images are being served from the edge.");
    },
  },

  /* ─── Data ───────────────────────────────────────────────────────── */
  {
    id: "db",
    name: "Database",
    detail: "D1 · doodleai",
    group: "data",
    run: async (ctx) => {
      if (!ctx.env.DB) return notConfigured("The database binding");
      // A literal, not a table read: this must measure D1 reachability without
      // depending on any schema, so a migration in flight cannot look like an
      // outage.
      const { ms } = await timed(() => ctx.env.DB.prepare("SELECT 1").first());
      return ok(ms, ctx.budget, null, "The database answered a query, so saving and loading your work is fine.");
    },
  },
  {
    id: "kv",
    name: "Session store",
    detail: "KV · SESSIONS",
    group: "data",
    run: async (ctx) => {
      if (!ctx.env.SESSIONS) return notConfigured("The session store");
      // Read a key that is expected to be absent. A miss still exercises the
      // full path and, unlike a write, adds nothing to storage on every check.
      const { ms } = await timed(() => ctx.env.SESSIONS.get("__status_probe__"));
      return ok(ms, ctx.budget, null, "Sign-in sessions are being stored and read back.");
    },
  },
  {
    id: "r2",
    name: "Object storage",
    detail: "R2 · doodleai-roadmap-assets",
    group: "data",
    run: async (ctx) => {
      if (!ctx.env.ROADMAP_ASSETS) return notConfigured("Object storage");
      const { ms } = await timed(() => ctx.env.ROADMAP_ASSETS.head("__status_probe__"));
      return ok(ms, ctx.budget, null, "Uploaded files and board assets are reachable.");
    },
  },
  {
    id: "realtime",
    name: "Realtime rooms",
    detail: "Durable Objects · RoadmapRoom, BoardRoom",
    group: "data",
    run: async (ctx) => {
      if (!ctx.env.ROADMAP_ROOM || !ctx.env.BOARD_ROOM) {
        return notConfigured("The realtime room bindings");
      }
      // `idFromName` resolves the binding and derives an id WITHOUT waking an
      // instance. A real round trip would spin up both rooms every check —
      // billable duration and evicted state, to learn something the binding
      // check already tells us. The label says exactly what was verified.
      const { ms } = await timed(async () => {
        ctx.env.ROADMAP_ROOM.idFromName("status-probe");
        ctx.env.BOARD_ROOM.idFromName("status-probe");
      });
      return ok(
        ms,
        ctx.budget,
        "bindings resolved",
        "The multiplayer roadmap and board rooms are wired up and addressable.",
      );
    },
  },

  /* ─── Identity ───────────────────────────────────────────────────── */
  {
    id: "auth",
    name: "Sign-in",
    detail: "Better Auth · initialisation",
    group: "identity",
    run: async (ctx) => {
      // In-process construction, not an HTTP call.
      //
      // Two earlier versions were both wrong. Probing /api/auth/get-session made
      // a session lookup that hit D1 and KV on every check and shared the
      // rate-limit bucket with real users, returning 429 while the probe
      // reported operational. Probing /api/auth/ok fixed the cost but not the
      // transport: a Worker fetching its own hostname does not re-enter its own
      // routes, so on staging it returned 404 for a path that serves 200.
      //
      // Constructing the auth instance is what actually catches the failure this
      // product has really had: missing or unresolvable secrets, which took
      // sign-in down with a 500 while everything else looked fine. If it builds
      // and exposes a handler, the credentials resolved and the database adapter
      // initialised — which is the whole dependency chain the route is.
      if (!ctx.context) {
        return {
          state: "operational",
          latencyMs: null,
          note: "not checked here",
          say: "Sign-in is verified on the status page, not in the scheduled sample.",
        };
      }
      const { createAuth } = await import("../auth");
      const { value, ms } = await timed(() => createAuth(ctx.context!));
      if (typeof value?.handler !== "function") {
        return { state: "down", latencyMs: ms, note: "no handler" };
      }
      return ok(ms, ctx.budget, null, "The sign-in service is configured and ready.");
    },
  },
  {
    id: "google",
    name: "Google sign-in",
    detail: "Google · OIDC discovery",
    group: "identity",
    slowMs: SLOW_THIRD_PARTY_MS,
    run: async (ctx) => {
      const { value, ms } = await timed(() =>
        probeFetch("https://accounts.google.com/.well-known/openid-configuration", ctx),
      );
      if (!value.ok) return { state: "degraded", latencyMs: ms, note: `HTTP ${value.status}` };
      return ok(ms, ctx.budget, null, "Google's sign-in service is reachable, so social login works.");
    },
  },
  {
    id: "secrets",
    name: "Credentials",
    detail: "Secrets Store · 6 bindings",
    group: "identity",
    run: async (ctx) => {
      // Presence only. Values are never read into a variable that could reach a
      // response or a log. This probe exists because an empty binding has
      // already taken this product down twice — once when a Secrets Store
      // binding referenced a secret that did not exist yet, and once when empty
      // store bindings shadowed .dev.vars locally. Both failed at runtime with
      // no signal until a user hit sign-in.
      const bindings: [string, unknown][] = [
        ["OPENROUTER_API_KEY", ctx.env.OPENROUTER_API_KEY],
        ["OPENROUTER_MODEL", ctx.env.OPENROUTER_MODEL],
        ["PICX_API_KEY", ctx.env.PICX_API_KEY],
        ["GOOGLE_CLIENT_ID", ctx.env.GOOGLE_CLIENT_ID],
        ["GOOGLE_CLIENT_SECRET", ctx.env.GOOGLE_CLIENT_SECRET],
        ["BETTER_AUTH_SECRET", ctx.env.BETTER_AUTH_SECRET],
      ];
      const results = await Promise.all(bindings.map(([, b]) => secretPresent(b)));
      const present = results.filter(Boolean).length;
      const total = bindings.length;
      if (present === total) {
        return {
          state: "operational",
          latencyMs: null,
          note: `${present} / ${total} resolved`,
          say: "Every credential the app needs is present. Their values are never read here.",
        };
      }
      // Deliberately does NOT name which binding is missing: on a public page
      // that is a map of what to attack while it is broken.
      return {
        state: present === 0 ? "down" : "degraded",
        latencyMs: null,
        note: `${present} / ${total} resolved`,
        say: "At least one credential is not resolving. The team has been given the details privately.",
      };
    },
  },

  /* ─── Generation ─────────────────────────────────────────────────── */
  {
    id: "picx",
    name: "Drawing service",
    detail: "PicX · api.picxstudio.com/health",
    group: "generation",
    slowMs: SLOW_THIRD_PARTY_MS,
    run: async (ctx) => {
      const { value, ms } = await timed(() =>
        probeFetch("https://api.picxstudio.com/health", ctx),
      );
      if (!value.ok) return { state: "down", latencyMs: ms, note: `HTTP ${value.status}` };
      return ok(ms, ctx.budget, null, "The service that draws your doodles is reachable.");
    },
  },
  {
    id: "picx-capacity",
    name: "Drawing capacity",
    detail: "PicX · account balance",
    group: "generation",
    slowMs: SLOW_THIRD_PARTY_MS,
    run: async (ctx) => {
      const key = await readSecret(ctx.env.PICX_API_KEY);
      if (!key) return { state: "degraded", latencyMs: null, note: "no credential" };
      const { value, ms } = await timed(() =>
        probeFetch("https://api.picxstudio.com/v1/account/me", ctx, {
          headers: { authorization: `Bearer ${key}` },
        }),
      );
      if (!value.ok) return { state: "degraded", latencyMs: ms, note: `HTTP ${value.status}` };
      const body = (await value.json().catch(() => null)) as
        | { credits?: { balance?: number } }
        | null;
      const balance = body?.credits?.balance;
      if (typeof balance !== "number") {
        return { state: "degraded", latencyMs: ms, note: "balance unreadable" };
      }
      // Banded, never the number. An exact balance on a public page tells the
      // internet how much capacity is left and when the product will stop
      // working — useful to nobody except someone timing an abuse run. The
      // precise figure is available to admins via /api/status?detail=full.
      if (balance <= 0) {
        return {
          state: "down",
          latencyMs: ms,
          note: "exhausted",
          say: "Generation credit has run out, so new doodles will fail until it is topped up.",
        };
      }
      if (balance < LOW_CREDIT_THRESHOLD) {
        return {
          state: "degraded",
          latencyMs: ms,
          note: "running low",
          say: "There is enough credit to keep drawing, but it is getting low.",
        };
      }
      return ok(ms, ctx.budget, "healthy", "There is plenty of credit available for new doodles.");
    },
  },
  {
    id: "openrouter",
    name: "Model routing",
    detail: "OpenRouter · key check",
    group: "generation",
    slowMs: SLOW_THIRD_PARTY_MS,
    run: async (ctx) => {
      const key = await readSecret(ctx.env.OPENROUTER_API_KEY);
      if (!key) return { state: "degraded", latencyMs: null, note: "no credential" };
      // /api/v1/key validates the credential and returns quota. It runs no
      // model and consumes ZERO tokens, which is what makes it legitimate here
      // — a chat completion would bill per check.
      const { value, ms } = await timed(() =>
        probeFetch("https://openrouter.ai/api/v1/key", ctx, {
          headers: { authorization: `Bearer ${key}` },
        }),
      );
      if (value.status === 401) {
        return { state: "down", latencyMs: ms, note: "credential rejected" };
      }
      if (!value.ok) return { state: "degraded", latencyMs: ms, note: `HTTP ${value.status}` };
      return ok(ms, ctx.budget, "key valid · 0 tokens", "The assistant's model gateway is reachable.");
    },
  },
  {
    id: "cdn",
    name: "Image delivery",
    detail: "cdn.picxstudio.com",
    group: "generation",
    slowMs: SLOW_THIRD_PARTY_MS,
    run: async (ctx) => {
      const { value, ms } = await timed(() =>
        probeFetch("https://cdn.picxstudio.com/", ctx, { method: "HEAD" }),
      );
      // Any answer proves the CDN edge is up; the root path is not expected to
      // be a real object, so its status code is not the signal here.
      if (value.status >= 500) return { state: "degraded", latencyMs: ms, note: `HTTP ${value.status}` };
      return ok(ms, ctx.budget, null, "Finished doodles are being delivered from the image CDN.");
    },
  },
  {
    id: "image-generation",
    name: "Image generation",
    detail: "15–53 credits per call",
    group: "generation",
    metered: true,
    meteredReason:
      "Every call draws a real image and spends real credit. Probing it on a schedule would bill this product to render a green dot, so its reachability is inferred from the two checks above instead.",
  },
  {
    id: "video-generation",
    name: "Video generation",
    detail: "metered per second of output",
    group: "generation",
    metered: true,
    meteredReason:
      "The most expensive call the product can make. Never invoked by monitoring.",
  },
  {
    id: "chat-inference",
    name: "Assistant replies",
    detail: "token cost per message",
    group: "generation",
    metered: true,
    meteredReason:
      "Each check would be a paid completion. The model gateway's credential is verified above at no cost, which is the part that actually breaks.",
  },
];


/**
 * Read a Secrets Store binding, tolerating the local-dev string shape.
 *
 * Kept separate from `secretPresent` on purpose: that one must never return the
 * value, this one must, and collapsing them would make it easy to accidentally
 * surface a secret from the presence check.
 */
export async function readSecret(binding: unknown): Promise<string | null> {
  if (!binding) return null;
  if (typeof binding === "string") return binding.trim() || null;
  const store = binding as { get?: () => Promise<string | undefined> };
  if (typeof store.get !== "function") return null;
  try {
    const value = await store.get();
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function probeById(id: string): Probe | undefined {
  return PROBES.find((p) => p.id === id);
}
