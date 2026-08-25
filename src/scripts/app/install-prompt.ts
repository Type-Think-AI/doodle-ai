/* Registers the service worker (src=public/sw.js, needed for installability
   alongside the manifest) and drives the "Install app" banner mounted by
   InstallPrompt.astro. The banner only appears once the browser actually
   fires beforeinstallprompt — there's no custom UI shown before that, since
   iOS Safari and already-installed contexts never fire it at all. */

const DISMISSED_KEY = "doodleai-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own standalone flag — not covered by the media query above.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function initServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (e.g. unsupported context) just means no
      // offline shell caching — install prompt logic below is independent.
    });
  });
}

function initInstallPrompt(): void {
  const banner = document.getElementById("installPromptBanner");
  const installBtn = document.getElementById("installPromptButton");
  const dismissBtn = document.getElementById("installPromptDismiss");
  if (!banner || !installBtn || !dismissBtn) return;

  if (isStandalone()) return;
  try {
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
  } catch {
    /* storage unavailable — fall through and allow the prompt */
  }

  let deferredPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as typeof deferredPrompt;
    banner.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.hidden = true;
  });

  dismissBtn.addEventListener("click", () => {
    banner.hidden = true;
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable — banner just won't persist the dismissal */
    }
  });

  window.addEventListener("appinstalled", () => {
    banner.hidden = true;
    deferredPrompt = null;
  });
}

initServiceWorker();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initInstallPrompt);
} else {
  initInstallPrompt();
}
