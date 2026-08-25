/* Controller for #joinTeamDialog (src/components/app/JoinTeamDialog.astro). */
import { showToast } from "./toast";

const OPEN_EVENT = "doodleai:open-team-join";

/** Accepts a full URL or a bare token — strips the origin/path client-side. */
function extractToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const joinMatch = trimmed.match(/\/join\/([^/?#\s]+)/);
  if (joinMatch) return joinMatch[1] ?? null;
  // No slashes at all — treat the whole thing as a bare token.
  if (!trimmed.includes("/")) return trimmed;
  return null;
}

function initJoinTeamDialog(): void {
  const dialog = document.getElementById("joinTeamDialog") as HTMLDialogElement | null;
  const input = document.getElementById("joinTeamDialogInput") as HTMLInputElement | null;
  const errorEl = document.getElementById("joinTeamDialogError");
  const submitBtn = document.getElementById("joinTeamDialogSubmit") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("joinTeamDialogClose");
  if (!dialog || !input || !submitBtn) return;

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  closeBtn?.addEventListener("click", close);

  const showError = (message: string): void => {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  submitBtn.addEventListener("click", async () => {
    if (errorEl) errorEl.hidden = true;
    const token = extractToken(input.value);
    if (!token) {
      showError("Paste a valid invite link.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Joining…";

    try {
      const res = await fetch("/api/v1/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { orgName?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(payload?.error?.message || "That invite link isn't valid.");

      close();
      showToast(`Joined ${payload?.orgName ?? "the team"}`);
      window.setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Join team";
      showError(err instanceof Error ? err.message : "That invite link isn't valid.");
    }
  });

  window.addEventListener(OPEN_EVENT, () => {
    input.value = "";
    if (errorEl) errorEl.hidden = true;
    submitBtn.disabled = false;
    submitBtn.textContent = "Join team";
    if (!dialog.open) dialog.showModal();
    input.focus();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initJoinTeamDialog);
} else {
  initJoinTeamDialog();
}
