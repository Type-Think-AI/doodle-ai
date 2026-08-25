/* Controller for #teamNameDialog (src/components/app/TeamNameDialog.astro). */
import { showToast } from "./toast";

const OPEN_EVENT = "doodleai:open-team-name";

function initTeamNameDialog(): void {
  const dialog = document.getElementById("teamNameDialog") as HTMLDialogElement | null;
  const input = document.getElementById("teamNameDialogInput") as HTMLInputElement | null;
  const transferRow = document.getElementById("teamNameDialogTransferRow");
  const transferCheckbox = document.getElementById("teamNameDialogTransfer") as HTMLInputElement | null;
  const transferLabel = document.getElementById("teamNameDialogTransferLabel");
  const errorEl = document.getElementById("teamNameDialogError");
  const submitBtn = document.getElementById("teamNameDialogSubmit") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("teamNameDialogClose");
  const joinInsteadBtn = document.getElementById("teamNameDialogJoinInstead");
  if (!dialog || !input || !submitBtn) return;

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  closeBtn?.addEventListener("click", close);
  joinInsteadBtn?.addEventListener("click", () => {
    close();
    window.dispatchEvent(new Event("doodleai:open-team-join"));
  });

  const showError = (message: string): void => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  submitBtn.addEventListener("click", async () => {
    const name = input.value.trim();
    if (errorEl) errorEl.hidden = true;
    if (!name) {
      showError("Give the team a name.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";

    try {
      const res = await fetch("/api/v1/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          transferCredits: transferCheckbox && !transferRow?.hidden ? transferCheckbox.checked : undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { org?: { name: string }; warning?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(payload?.error?.message || "Couldn't create that team.");

      close();
      showToast(payload?.warning ? payload.warning : `Created ${payload?.org?.name ?? "your team"}`);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create team";
      showError(err instanceof Error ? err.message : "Couldn't create that team.");
    }
  });

  window.addEventListener(OPEN_EVENT, () => {
    input.value = "";
    if (errorEl) errorEl.hidden = true;
    submitBtn.disabled = false;
    submitBtn.textContent = "Create team";

    // The "move my credits" checkbox only makes sense from a personal org
    // that actually holds some — fetched fresh each open rather than cached,
    // since the balance can have changed since the page loaded.
    void prefillTransferOption();

    if (!dialog.open) dialog.showModal();
    input.focus();
  });

  async function prefillTransferOption(): Promise<void> {
    if (!transferRow || !transferLabel) return;
    transferRow.hidden = true;
    try {
      const res = await fetch("/api/v1/me", { credentials: "include" });
      if (!res.ok) return;
      const payload = (await res.json()) as { org?: { isPersonal?: boolean; balance?: number } };
      const balance = payload.org?.balance ?? 0;
      if (payload.org?.isPersonal && balance > 0) {
        transferLabel!.textContent = `Move my ${balance} credit${balance === 1 ? "" : "s"} to this team`;
        transferRow.hidden = false;
      }
    } catch {
      // Leave the row hidden — the create-team flow still works without it.
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTeamNameDialog);
} else {
  initTeamNameDialog();
}
