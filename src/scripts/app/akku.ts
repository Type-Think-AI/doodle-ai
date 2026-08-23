/* Akku helper panel: free-text message -> POST /api/agent -> mode
   recommendation with a deep link into /create/[mode]. Toggled open/closed
   from the sidebar's Akku nav button via a CustomEvent (no cross-page
   state needed — the panel only exists on app-shell pages). */

const MODE_LABELS: Record<string, string> = {
  normal: "Doodle Avatar",
  collage: "Doodle Collage",
  "full-body": "Full-Body Action Collage",
};

function initAkku(): void {
  const panel = document.getElementById("akkuPanel");
  if (!panel) return;

  const closeBtn = document.getElementById("akkuClose");
  const thread = document.getElementById("akkuThread");
  const input = document.getElementById("akkuInput") as HTMLInputElement | null;
  const sendBtn = document.getElementById("akkuSend");
  const quickies = document.getElementById("akkuQuickies");

  function setOpen(open: boolean): void {
    panel!.setAttribute("data-open", String(open));
  }

  closeBtn?.addEventListener("click", () => setOpen(false));
  document.addEventListener("doodlebooth:toggle-helper", () => {
    const open = panel!.getAttribute("data-open") === "true";
    setOpen(!open);
  });

  function addMessage(who: "u" | "a", node: Node): void {
    if (!thread) return;
    const wrap = document.createElement("div");
    wrap.className = who === "u" ? "akku-msg akku-msg-u" : "akku-msg akku-msg-a";
    wrap.appendChild(node);
    thread.appendChild(wrap);
    thread.scrollTop = thread.scrollHeight;
  }

  function addText(who: "u" | "a", text: string): void {
    const p = document.createElement("p");
    p.textContent = text;
    addMessage(who, p);
  }

  async function ask(message: string): Promise<void> {
    if (!message.trim()) return;
    addText("u", message);
    if (input) input.value = "";

    const thinking = document.createElement("p");
    thinking.textContent = "Thinking…";
    addMessage("a", thinking);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => ({}))) as { mode?: string; reason?: string; error?: string };
      thinking.remove();

      if (!res.ok || !data.mode) {
        addText("a", data.error || "Couldn't get a recommendation for that — try rephrasing.");
        return;
      }

      const wrap = document.createElement("div");
      wrap.className = "akku-recommend";
      const reason = document.createElement("p");
      reason.textContent = data.reason || `${MODE_LABELS[data.mode] || data.mode} fits this best.`;
      const link = document.createElement("a");
      link.href = `/create/${encodeURIComponent(data.mode)}`;
      link.textContent = `Use ${MODE_LABELS[data.mode] || data.mode} →`;
      wrap.appendChild(reason);
      wrap.appendChild(link);
      addMessage("a", wrap);
    } catch {
      thinking.remove();
      addText("a", "Couldn't reach the assistant — try again in a moment.");
    }
  }

  sendBtn?.addEventListener("click", () => void ask(input?.value ?? ""));
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void ask(input.value);
  });
  quickies?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-quick]");
    if (btn?.dataset.quick) void ask(btn.dataset.quick);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAkku);
} else {
  initAkku();
}
