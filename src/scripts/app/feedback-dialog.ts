/* Controller for the sticky-note-style feedback dialog.
 *
 * Flow:
 *  1. POST /api/v1/feedback (stores D1 row; attempts DO RPC for multiplayer).
 *  2. Dispatch 'doodleai:feedback-added' with the text — the RoadmapBoard
 *     component listens for this and creates the note directly on the canvas.
 *     This is what makes feedback visible in local mode (no DO) and also gives
 *     instant feedback in multiplayer mode even if the RPC hasn't propagated yet.
 *
 * Submission is driven by the form's native `submit` event, which is the single
 * choke point every entry path funnels through: a pointer click on the submit
 * button, an Enter keypress inside the textarea's implicit-submit, and an
 * agent-invoked declarative WebMCP submission all raise exactly one `submit`.
 * We call preventDefault() so the browser never navigates or reloads, then run
 * the async POST once. A re-entrancy guard (`submitting`) plus disabling the
 * button means the same note can never be sent twice.
 */

const OPEN_EVENT = "doodleai:open-feedback";
const ADDED_EVENT = "doodleai:feedback-added";
const AUTO_CLOSE_MS = 1800;

/** A SubmitEvent that MAY carry the experimental WebMCP respondWith API. We
 *  feature-detect it at runtime rather than depending on a lib type, so this
 *  stays TypeScript-safe on toolchains whose DOM lib predates the proposal. */
type MaybeAgentSubmitEvent = SubmitEvent & {
  respondWith?: (result: unknown) => void;
};

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
    const form = document.getElementById("feedbackForm") as HTMLFormElement | null;

    closeBtn?.addEventListener("click", close);

    if (!form) return;

    // Re-entrancy guard: a submit already in flight must not start a second POST,
    // regardless of which entry path (click / Enter / agent) fired.
    let submitting = false;

    const showError = (message: string): void => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
    };

    /** Runs the actual async submission exactly once. Returns a machine-readable
     *  result an agent caller can consume; also drives the human UI. */
    const runSubmit = async (): Promise<{ ok: boolean; message: string }> => {
      const text = textarea?.value.trim() ?? "";
      if (errorEl) errorEl.hidden = true;

      if (!text) {
        showError("Write something first.");
        return { ok: false, message: "Feedback text is empty." };
      }

      if (submitting) {
        return { ok: false, message: "A submission is already in progress." };
      }
      submitting = true;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sticking…";
      }

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
        return { ok: true, message: "Feedback filed and posted to the roadmap board." };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't stick that. Try again.";
        // Re-enable so the human (or agent) can retry; the DOM still holds the form.
        submitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Stick it";
        }
        showError(message);
        return { ok: false, message };
      }
    };

    // The single submission choke point. Every path — pointer click on the
    // type="submit" button, Enter inside the textarea's implicit submit, and an
    // agent-invoked declarative WebMCP submission — raises exactly one `submit`.
    form.addEventListener("submit", (e) => {
      // Stop native navigation/reload in all cases, including agent-invoked.
      e.preventDefault();

      const agentEvent = e as MaybeAgentSubmitEvent;
      const promise = runSubmit();

      // If the runtime exposes the experimental WebMCP respondWith API, hand the
      // caller a concise result. Feature-detected so TS/older DOMs stay safe, and
      // the same runSubmit() promise is reused — no second send.
      if (typeof agentEvent.respondWith === "function") {
        agentEvent.respondWith(
          promise.then((r) => (r.ok ? r.message : `Not filed: ${r.message}`)),
        );
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
