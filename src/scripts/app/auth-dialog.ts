/* Controller for the shared #authDialog (src/components/app/AuthDialog.astro),
   mounted once per app-shell page. Google is the only sign-in method, so
   this is a click handler and open/close plumbing — no form. */

import { signInWithGoogle } from "./auth-client";

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

  const close = (): void => {
    if (dialog.open) dialog.close();
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
    if (errorEl) errorEl.hidden = true;
    const result = await signInWithGoogle(REDIRECT_TO);
    if (!result.ok && errorEl) {
      errorEl.textContent = result.message;
      errorEl.hidden = false;
    }
  });

  window.addEventListener(OPEN_EVENT, () => {
    if (!dialog.open) dialog.showModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthDialog);
} else {
  initAuthDialog();
}
