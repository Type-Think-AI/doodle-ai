import { showToast } from "./toast";

function initInviteTeamDialog(): void {
  const dialog = document.getElementById("inviteTeamDialog") as HTMLDialogElement | null;
  const email = document.getElementById("inviteTeamEmail") as HTMLInputElement | null;
  const role = document.getElementById("inviteTeamRole") as HTMLSelectElement | null;
  const submit = document.getElementById("inviteTeamSubmit") as HTMLButtonElement | null;
  const error = document.getElementById("inviteTeamError");
  const result = document.getElementById("inviteTeamResult");
  const link = document.getElementById("inviteTeamLink") as HTMLInputElement | null;
  const copy = document.getElementById("inviteTeamCopy");
  const close = document.getElementById("inviteTeamDialogClose");
  if (!dialog || !email || !role || !submit || !link) return;

  const hide = (): void => { if (dialog.open) dialog.close(); };
  close?.addEventListener("click", hide);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) hide(); });

  window.addEventListener("doodleai:open-team-invite", () => {
    email.value = "";
    if (error) error.hidden = true;
    if (result) result.hidden = true;
    submit.disabled = false;
    submit.textContent = "Create invite link";
    if (!dialog.open) dialog.showModal();
    email.focus();
  });

  submit.addEventListener("click", async () => {
    if (error) error.hidden = true;
    if (!email.value.trim() || !email.value.includes("@")) {
      if (error) { error.textContent = "Enter a valid email address."; error.hidden = false; }
      return;
    }
    submit.disabled = true;
    submit.textContent = "Creating…";
    try {
      const me = await fetch("/api/v1/me", { credentials: "include" });
      const mePayload = (await me.json()) as { org?: { id?: string } };
      const orgId = mePayload.org?.id;
      if (!orgId) throw new Error("No active team found.");
      const response = await fetch(`/api/v1/orgs/${orgId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.value.trim(), role: role.value }),
      });
      const payload = (await response.json().catch(() => null)) as { invitation?: { inviteUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.invitation?.inviteUrl) throw new Error(payload?.error?.message || "Couldn't create the invite.");
      link.value = payload.invitation.inviteUrl;
      if (result) result.hidden = false;
      submit.textContent = "Invite created";
    } catch (err) {
      submit.disabled = false;
      submit.textContent = "Create invite link";
      if (error) { error.textContent = err instanceof Error ? err.message : "Couldn't create the invite."; error.hidden = false; }
    }
  });

  copy?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link.value); } catch { link.select(); document.execCommand("copy"); }
    showToast("Invite link copied");
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initInviteTeamDialog);
else initInviteTeamDialog();
