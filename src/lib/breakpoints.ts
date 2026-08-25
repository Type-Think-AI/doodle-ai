/**
 * Canonical breakpoint reference values.
 *
 * IMPORTANT: CSS `@media (max-width: ...)` rules cannot reference these
 * constants (or CSS custom properties inside a media condition — this
 * project has no PostCSS custom-media plugin configured, see
 * astro.config.mjs) and must keep hardcoding the matching pixel value
 * directly in each stylesheet/component.
 *
 * These constants exist so JavaScript-side responsive logic (e.g.
 * `window.matchMedia(...)`) has one canonical source, and so anyone adding
 * a new `@media` rule in CSS has a single place to eyeball for consistency
 * with existing breakpoints. They are a reference point only, not an
 * enforcement mechanism — nothing keeps CSS values in sync with these
 * automatically.
 */

/** Shell layout swap: sidebar (desktop) <-> bottom tab bar (mobile). Dominant breakpoint across the app shell. */
export const MOBILE_NAV_BREAKPOINT = 860;

/** Common "tighter content" tweak point used across marketing/app pages below the shell breakpoint. */
export const TIGHT_CONTENT_BREAKPOINT = 720;

/** Secondary layout breakpoint used by a few wider content grids/sections. */
export const WIDE_CONTENT_BREAKPOINT = 980;

/** Secondary layout breakpoint just below WIDE_CONTENT_BREAKPOINT, used by a couple of pages/sections. */
export const MEDIUM_CONTENT_BREAKPOINT = 900;

/** Small-content / narrow-panel breakpoint reused in a couple of places (e.g. cards, dialogs). */
export const NARROW_CONTENT_BREAKPOINT = 560;

/** Compact panel breakpoint reused in a couple of places (e.g. footer, lightbox). */
export const COMPACT_PANEL_BREAKPOINT = 520;

/** Small-screen breakpoint reused in a couple of places (e.g. auth dialog, chat detail page). */
export const SMALL_SCREEN_BREAKPOINT = 420;

/** Settings hub: tabs (desktop) <-> accordion panels (mobile). Also used by the chat detail page layout. */
export const SETTINGS_ACCORDION_BREAKPOINT = 760;
