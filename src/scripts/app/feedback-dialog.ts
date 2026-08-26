/* Controller for the sticky-note-style feedback dialog.
 *
 * Flow:
 *  1. POST /api/v1/feedback (stores D1 row; attempts DO RPC for multiplayer).
 *  2. Dispatch 'doodleai:feedback-added' with the text — the RoadmapBoard
 *     component listens for this and creates the note directly on the canvas.
 *     This is what makes feedback visible in local mode (no DO) and also gives
 *     instant feedback in multiplayer mode even if the RPC hasn't propagated yet.
 */

const OPEN_EVENT = "doodleai:open-feedback";
const ADDED_EVENT = "doodleai:feedback-added";
const AUTO_CLOSE_MS = 1800;

function initFeedbackDialog(): void {
  const dialog = document.getElementById("feedbackDialog") as HTMLDialogElement | null;
  const body = document.getElementById("feedbackDialogBody");
  if (!dialog || !body) return;

  const formHtml = body.innerHTML;

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  const showThanks = (): void => {
    body.innerHTML = `
      <div class="fb-thanks">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.2L12 16.6 5.7 20.8 8 13.6 2 9.2h7.6L12 2Z" fill="#fbbf24"/></svg>
        <p>Stuck on the board!</p>
      </div>`;
    window.setTimeout(close, AUTO_CLOSE_MS);
  };

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
          errorEl.textContent = "Write something first.";
          errorEl.hidden = false;
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Sticking…";

      try {
        const res = await fetch("/api/v1/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message || "Couldn't stick that. Try again.");
        }

        // Tell the board to add the note client-side (works in local + sync).
        window.dispatchEvent(new CustomEvent(ADDED_EVENT, { detail: { text } }));

        showThanks();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Stick it";
        if (errorEl) {
          errorEl.textContent = err instanceof Error ? err.message : "Couldn't stick that. Try again.";
          errorEl.hidden = false;
        }
      }
    });
  };

  bindForm();

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
