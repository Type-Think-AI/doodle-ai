/* Controller for the shared #authDialog (src/components/app/AuthDialog.astro),
   mounted once per app-shell page. Google is the only sign-in method, so
   this is a click handler and open/close plumbing — no form. */

import { getSession, signInWithGoogle } from "./auth-client";

const REDIRECT_TO = "/";
/** Any trigger opens the dialog by dispatching this on `window` — see sidebar.ts. */
const OPEN_EVENT = "doodleai:open-auth";

function initAuthDialog(): void {
  const dialog = document.getElementById("authDialog") as HTMLDialogElement | null;
  if (!dialog) return;

  const closeBtn = document.getElementById("authDialogClose");
  const skipBtn = document.getElementById("authDialogSkip");
  const googleBtn = document.getElementById("authDialogGoogle");
  const errorEl = document.getElementById("authDialogError");

  const clearError = (): void => {
    if (!errorEl) return;
    errorEl.textContent = "";
    errorEl.hidden = true;
  };

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  const dismissIfAuthenticated = async (): Promise<boolean> => {
    const user = await getSession();
    if (!user) return false;
    clearError();
    close();
    return true;
  };

  closeBtn?.addEventListener("click", close);
  skipBtn?.addEventListener("click", close);

  // A click that lands on the <dialog> element itself (rather than
  // something inside auth-dialog-panel/-image) is a click on the backdrop
  // area within its box — <dialog> has no separate "outside" element to
  // target since ::backdrop isn't part of the DOM.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  googleBtn?.addEventListener("click", async () => {
    clearError();
    const result = await signInWithGoogle(REDIRECT_TO);
    if (!result.ok && errorEl) {
      errorEl.textContent = result.message;
      errorEl.hidden = false;
    }
  });

  // OAuth returns to the app with a fresh page load. Resolve the session before
  // allowing an old dialog/error state to remain visible in that page.
  void dismissIfAuthenticated();

  window.addEventListener(OPEN_EVENT, async () => {
    if (await dismissIfAuthenticated()) return;
    if (!dialog.open) dialog.showModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthDialog);
} else {
  initAuthDialog();
}
