import { getSession } from "./auth-client";

const pendingKey = "doodleai-pending-join";

async function initJoinPage(): Promise<void> {
  const root = document.getElementById("joinPage");
  if (!root) return;
  const token = root.getAttribute("data-token");
  const title = document.getElementById("joinTitle");
  const description = document.getElementById("joinDescription");
  const button = document.getElementById("joinAction") as HTMLButtonElement | null;
  const error = document.getElementById("joinError");
  const avatar = document.getElementById("joinAvatar");
  if (!token || !button) return;

  const inviteToken = token;
  const action = button;
  try {
    const response = await fetch(`/api/v1/join/${encodeURIComponent(inviteToken)}`);
    const payload = (await response.json()) as { valid?: boolean; orgName?: string; role?: string; reason?: string };
    if (!payload.valid) {
      throw new Error(
        payload.reason === "expired"
          ? "This invite has expired."
          : payload.reason === "revoked"
            ? "This invite was revoked."
            : "This invite isn't available.",
      );
    }
    if (title) title.textContent = `Join ${payload.orgName || "this team"}`;
    if (description) description.textContent = `You've been invited as a ${payload.role || "team member"}. Sign in to join this shared workspace.`;
    if (avatar) avatar.textContent = (payload.orgName || "T").charAt(0).toUpperCase();
    action.disabled = false;
    action.textContent = "Join team";
    action.addEventListener("click", () => void accept());
  } catch (err) {
    if (title) title.textContent = "Invite unavailable";
    if (description) description.textContent = "";
    if (error) {
      error.textContent = err instanceof Error ? err.message : "This invite isn't available.";
      error.hidden = false;
    }
    action.disabled = true;
  }

  async function accept(): Promise<void> {
    action.disabled = true;
    action.textContent = "Joining…";
    const session = await getSession();
    if (!session) {
      try {
        localStorage.setItem(pendingKey, inviteToken);
      } catch (storageError) {
        void storageError;
      }
      window.dispatchEvent(new Event("doodleai:open-auth"));
      action.disabled = false;
      action.textContent = "Sign in to join";
      return;
    }

    try {
      const response = await fetch("/api/v1/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: inviteToken }),
      });
      const payload = (await response.json()) as { orgName?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Couldn't join this team.");
      try {
        localStorage.removeItem(pendingKey);
      } catch (storageError) {
        void storageError;
      }
      if (title) title.textContent = `Welcome to ${payload.orgName || "the team"}`;
      if (description) description.textContent = "Your shared workspace is ready.";
      action.textContent = "Open workspace";
      action.disabled = false;
      action.onclick = () => { window.location.href = "/boards"; };
    } catch (err) {
      if (error) {
        error.textContent = err instanceof Error ? err.message : "Couldn't join this team.";
        error.hidden = false;
      }
      action.disabled = false;
      action.textContent = "Try again";
    }
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void initJoinPage());
else void initJoinPage();
