/**
 * Analytics entrypoint loaded by AppLayout.astro, so every route — app pages and
 * static editorial articles alike — initializes Mixpanel and Session Replay from
 * one place.
 *
 * Deliberately a bundled module script rather than the old `is:inline` blob: it
 * defers past the parser, is type-checked, and removes one of the two inline
 * scripts blocking promotion of the CSP in public/_headers to enforcing mode.
 *
 * The SDK itself is imported dynamically at idle. The static editorial pages are
 * the ones being measured for LCP, and analytics is never the reason a page is
 * slow to paint. Recording losing the first moment costs nothing: rrweb takes a
 * full DOM snapshot when it starts, so the page the user is looking at is
 * captured in full regardless of when capture begins.
 */

function boot(): void {
  void import("./mixpanel").then((m) => m.initAnalytics());
}

if (typeof requestIdleCallback === "function") {
  requestIdleCallback(boot, { timeout: 3000 });
} else {
  // Safari < 18.4 has no requestIdleCallback.
  setTimeout(boot, 1200);
}
