/* Measures the real rendered height of the bottom mobile nav (which varies
   by safe-area-inset-bottom across devices) and exposes it as --mobile-nav-h
   on the root element. app-shell.css and the chat page previously both
   hardcoded a 72px guess for this — close on some phones, off by enough on
   others (notched phones, or after nav content changes) to leave either a
   gap above the nav or a sliver of page hidden behind it, and made the
   document itself scrollable when the guess undershot, which is what was
   showing up as a phantom extra row peeking in at the bottom of the
   viewport. Measuring the actual element removes the guesswork. */

const FALLBACK_HEIGHT = 72;

function initMobileNavHeight(): void {
  const nav = document.getElementById("mobileNav");
  const root = document.documentElement;
  root.style.setProperty("--mobile-nav-h", `${FALLBACK_HEIGHT}px`);
  if (!nav) return;

  const apply = (): void => {
    const height = nav.getBoundingClientRect().height;
    if (height > 0) root.style.setProperty("--mobile-nav-h", `${height}px`);
  };

  apply();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(apply).observe(nav);
  } else {
    window.addEventListener("resize", apply);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileNavHeight);
} else {
  initMobileNavHeight();
}
