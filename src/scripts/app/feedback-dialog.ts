/* Controller for the shared #feedbackDialog (src/components/app/FeedbackDialog.astro),
   mounted once per app-shell page. Mirrors auth-dialog.ts's open/close plumbing,
   plus a plain fetch for the one-field form. */

/** Any trigger opens the dialog by dispatching this on `window` — see sidebar.ts. */
const OPEN_EVENT = "doodleai:open-feedback";
/** How long the "Thanks!" state stays up before the dialog closes itself. */
const AUTO_CLOSE_MS = 1500;

function initFeedbackDialog(): void {
  const dialog = document.getElementById("feedbackDialog") as HTMLDialogElement | null;
  const body = document.getElementById("feedbackDialogBody");
  if (!dialog || !body) return;

  // showThanks() replaces the form markup in place; stash the original so a
  // later reopen can restore the real form instead of leaving "Thanks!" up.
  const formHtml = body.innerHTML;

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  // A click that lands on the <dialog> element itself (rather than something
  // inside feedback-dialog-body) is a click on the backdrop area within its
  // box — <dialog> has no separate "outside" element to target since
  // ::backdrop isn't part of the DOM.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  const showThanks = (): void => {
    body.innerHTML = '<p class="feedback-dialog-thanks">Thanks for the feedback!</p>';
    window.setTimeout(close, AUTO_CLOSE_MS);
  };

  // Elements inside feedback-dialog-body are re-queried and re-bound every
  // time the form markup is (re)installed, since showThanks() tears the
  // original nodes out of the DOM via innerHTML.
  const bindForm = (): void => {
    const closeBtn = document.getElementById("feedbackDialogClose");
    const textarea = document.getElementById("feedbackDialogText") as HTMLTextAreaElement | null;
    const errorEl = document.getElementById("feedbackDialogError");
    const submitBtn = document.getElementById("feedbackDialogSubmit") as HTMLButtonElement | null;

    closeBtn?.addEventListener("click", close);

    submitBtn?.addEventListener("click", async () => {
      const text = textarea?.value.trim() ?? "";
      if (errorEl) errorEl.hidden = true;

      if (!text) {
        if (errorEl) {
          errorEl.textContent = "Say something first.";
          errorEl.hidden = false;
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      try {
        const res = await fetch("/api/v1/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message || "Couldn't send that. Try again.");
        }

        showThanks();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send feedback";
        if (errorEl) {
          errorEl.textContent = err instanceof Error ? err.message : "Couldn't send that. Try again.";
          errorEl.hidden = false;
        }
      }
    });
  };

  bindForm();

  // Re-showing the dialog after a previous "Thanks!" close should present a
  // fresh form, not the thanks message or leftover text from last time.
  window.addEventListener(OPEN_EVENT, () => {
    if (body.innerHTML !== formHtml) {
      body.innerHTML = formHtml;
      bindForm();
    }
    if (!dialog.open) dialog.showModal();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFeedbackDialog);
} else {
  initFeedbackDialog();
}
