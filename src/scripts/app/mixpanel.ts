/**
 * Analytics client for Doodle AI — Mixpanel + GA4.
 *
 * Both SDKs are loaded via CDN in AppLayout.astro. This module wraps them
 * with safe guards (no-ops if either SDK isn't loaded, e.g. on localhost
 * where ad-blockers may strip them or during SSR).
 *
 * All heavy network I/O happens async in the background — these calls
 * just queue data into the SDK buffers and return immediately.
 */

// ---------- Types for global analytics objects ----------

interface MixpanelPeople {
  set: (props: Record<string, unknown>) => void;
  set_once: (props: Record<string, unknown>) => void;
}

interface MixpanelInstance {
  init: (token: string, config?: Record<string, unknown>) => void;
  track: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  register: (superProperties: Record<string, unknown>) => void;
  people: MixpanelPeople;
}

declare global {
  interface Window {
    mixpanel?: MixpanelInstance;
    gtag?: (...args: unknown[]) => void;
  }
}

// ---------- Safe accessors ----------

function mp(): MixpanelInstance | null {
  return typeof window !== "undefined" && window.mixpanel ? window.mixpanel : null;
}

function ga(...args: unknown[]): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

// ---------- Public API ----------

/**
 * Call once on page load after the session is resolved.
 * If the user is already authenticated, pass their identity.
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
