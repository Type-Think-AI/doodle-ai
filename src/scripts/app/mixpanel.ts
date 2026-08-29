/**
 * Analytics client for Doodle AI — Mixpanel (+ Session Replay) and GA4.
 *
 * Mixpanel now ships as a bundled npm dependency (`mixpanel-browser`) rather
 * than the hand-rolled CDN loader stub that used to live in AppLayout.astro.
 * That stub queued calls against a `window.mixpanel` array, which meant no type
 * safety, no way to await `loaded`, and — because it was pasted twice — two
 * `init()` calls per page load. The real SDK removes all three problems and is
 * the supported way to enable Session Replay.
 *
 * The import path is deliberately the `loader-module-with-async-modules` entry,
 * not the package root: the default `mixpanel-browser` export statically bundles
 * the rrweb recorder, which measured 129 KB gzipped in our client chunk and would
 * be paid on every page — including the static editorial articles where LCP
 * matters most. This loader ships the core SDK only and pulls the recorder from
 * cdn.mxpnl.com (already allowed in the CSP) via a script tag when a session is
 * actually sampled for recording.
 *
 * GA4 stays on its own gtag.js snippet; these helpers dual-fire to both.
 */

import mixpanel from "mixpanel-browser/src/loaders/loader-module-with-async-modules";
import { REPLAY_CONFIG, resolveSessionsPercent } from "./replay-config";

const MIXPANEL_TOKEN = "2f06c42c258b8121e6d3feb324179bf2";

/** Shape of the self-diagnostic object published on `window`. */
interface ReplayDiagnostics {
  initialized: boolean;
  sessionsPercent: number;
  recording: boolean;
  replayId: string | null;
  replayUrl: string | null;
  error: string | null;
}

declare global {
  interface Window {
    mixpanel?: typeof mixpanel;
    gtag?: (...args: unknown[]) => void;
    /** Live replay status, readable from the console on any environment. */
    __doodleReplay?: () => ReplayDiagnostics;
  }
}

let initialized = false;
let initError: string | null = null;
let sessionsPercent = 0;

// ---------- Boot ----------

/**
 * Initialize Mixpanel exactly once, with Session Replay enabled.
 *
 * Safe to call from several entrypoints — repeat calls are ignored. Wrapped in
 * try/catch per Mixpanel's own guidance: an analytics SDK must never be able to
 * take the app down, and a thrown init would abort the rest of the module script.
 */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    sessionsPercent = resolveSessionsPercent(window.location);

    mixpanel.init(MIXPANEL_TOKEN, {
      debug: false,
      track_pageview: true,
      persistence: "localStorage",
      ...REPLAY_CONFIG,
      record_sessions_percent: sessionsPercent,
    });

    // Kept for console debugging and for anything still reaching for the global.
    window.mixpanel = mixpanel;
  } catch (error) {
    initError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  // Never swallowed silently: a failed init has to be readable from the page.
  window.__doodleReplay = replayDiagnostics;
  if (initError) console.warn("[analytics] Mixpanel init failed —", initError);
}

// ---------- Safe accessors ----------

/**
 * Returns the SDK, initializing it on first use.
 *
 * Self-initializing on purpose: `analytics-boot.ts` schedules `initAnalytics()`
 * at idle so it does not compete with LCP, but `sidebar.ts` calls
 * `identifyUser()` as soon as the session resolves — which can land first. A
 * plain "return null if not initialized" guard would silently drop the identity
 * link on fast connections. `initAnalytics()` is idempotent, so this is safe.
 */
function mp(): typeof mixpanel | null {
  if (!initialized) initAnalytics();
  return initialized && !initError ? mixpanel : null;
}

function ga(...args: unknown[]): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

// ---------- Session Replay ----------

/**
 * Replay properties for the active capture — `{ $mp_replay_id }`, or `{}` when
 * nothing is recording. Attach these to any event sent outside the JS SDK (e.g.
 * from a Worker route) so it lands in the right replay timeline.
 */
export function getReplayProperties(): Record<string, string> {
  try {
    return (mp()?.get_session_recording_properties() ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Mixpanel UI link to the current replay, or null when not recording. */
export function getReplayUrl(): string | null {
  try {
    return mp()?.get_session_replay_url() || null;
  } catch {
    return null;
  }
}

/**
 * Force recording on regardless of the sampling decision. Used by the localhost
 * verification path; also the hook for "always record this cohort" later.
 */
export function startReplay(): void {
  try {
    mp()?.start_session_recording();
  } catch {
    // Recorder unavailable (blocked by an extension, or init failed).
  }
}

/** Stop the active capture. Call before showing anything that must not be seen. */
export function stopReplay(): void {
  try {
    mp()?.stop_session_recording();
  } catch {
    // Nothing in progress.
  }
}

/** Current replay state — surfaced as `window.__doodleReplay()`. */
export function replayDiagnostics(): ReplayDiagnostics {
  const replayId = getReplayProperties().$mp_replay_id ?? null;
  return {
    initialized: initialized && !initError,
    sessionsPercent,
    recording: Boolean(replayId),
    replayId,
    replayUrl: getReplayUrl(),
    error: initError,
  };
}

// ---------- Identity ----------

/**
 * Call once on page load after the session is resolved.
 *
 * Also what makes server-side stitching work: replays are matched to non-SDK
 * events by distinct ID, so this must use the same user id the Worker sends.
 */
export function identifyUser(user: { id: string; email: string; name: string }): void {
  const m = mp();
  if (m) {
    m.identify(user.id);
    m.people.set({ $name: user.name, $email: user.email });
    m.register({ user_id: user.id });
  }
  // GA4: set user_id for cross-device/session stitching.
  ga("set", { user_id: user.id });
}

/**
 * Call on sign-out to sever the identity link on the device.
 */
export function resetIdentity(): void {
  mp()?.reset();
  // GA4 doesn't have a reset — user_id clears on next page load without set().
}

// ---------- Events ----------

/**
 * Track the sign-up/first-sign-in event.
 */
export function trackSignUp(method: string): void {
  mp()?.track("sign_up_completed", {
    sign_up_method: method,
    platform: "web",
  });
  ga("event", "sign_up", { method });
}

/**
 * Track the Value Moment: a doodle was successfully generated.
 */
export function trackDoodleGenerated(props: {
  skill_id?: string;
  skill_name?: string;
  has_photo: boolean;
  has_reference: boolean;
}): void {
  mp()?.track("doodle_generated", {
    skill_id: props.skill_id ?? "unknown",
    skill_name: props.skill_name ?? "unknown",
    has_photo: props.has_photo,
    has_reference: props.has_reference,
    platform: "web",
  });
  ga("event", "generate_content", {
    content_type: "doodle",
    skill_id: props.skill_id ?? "unknown",
    has_photo: props.has_photo,
  });
}

/**
 * Track a skill selection (from the marketplace or composer chip).
 */
export function trackSkillSelected(skillId: string, skillName: string, surface: string): void {
  mp()?.track("skill_selected", {
    skill_id: skillId,
    skill_name: skillName,
    surface,
    platform: "web",
  });
  ga("event", "select_content", { content_type: "skill", item_id: skillId });
}

/**
 * Generic event tracker for one-off events.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  mp()?.track(name, { ...properties, platform: "web" });
  ga("event", name, properties);
}
