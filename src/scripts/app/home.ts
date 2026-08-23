/* Home screen: prompt box (text -> /api/agent -> routed to /create/[mode])
   and the tab filter over the featured skill grid. */

import { DEFAULT_SKILL_STORAGE_KEY } from "../../lib/doodle-constants";

function getDefaultSkill(): string {
  try {
    return localStorage.getItem(DEFAULT_SKILL_STORAGE_KEY) || "normal";
  } catch {
    return "normal";
  }
}

function initHome(): void {
  const prompt = document.getElementById("homePrompt") as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById("homeSend") as HTMLButtonElement | null;
  const photoBtn = document.getElementById("homePhotoBtn");
  const status = document.getElementById("homeStatus");
  const tabs = document.getElementById("homeTabs");
  const grid = document.getElementById("homeGrid");
  if (!prompt || !sendBtn) return;

  function setStatus(msg: string, err = false): void {
    if (!status) return;
    status.textContent = msg;
    status.dataset.err = String(err);
  }

  async function send(): Promise<void> {
    const message = prompt!.value.trim();
    if (!message) {
      setStatus("Type a description first, or start from a photo.", true);
      return;
    }
    sendBtn!.disabled = true;
    setStatus("Finding the right skill…");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => ({}))) as { mode?: string; error?: string };
      if (!res.ok || !data.mode) throw new Error(data.error || "Couldn't route that request");
      window.location.href = `/create/${encodeURIComponent(data.mode)}?prompt=${encodeURIComponent(message)}`;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong", true);
      sendBtn!.disabled = false;
    }
  }

  sendBtn.addEventListener("click", () => void send());
  prompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });
  photoBtn?.addEventListener("click", () => {
    window.location.href = `/create/${encodeURIComponent(getDefaultSkill())}`;
  });

  tabs?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".home-tab");
    if (!btn || !grid) return;
    tabs.querySelectorAll<HTMLButtonElement>(".home-tab").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
    const category = btn.dataset.cat;
    grid.querySelectorAll<HTMLElement>(".home-grid-item").forEach((item) => {
      item.hidden = category !== "for-you" && item.dataset.category !== category;
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHome);
} else {
  initHome();
}
