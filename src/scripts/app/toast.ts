/* Controller for the shared #toastHost (src/components/app/Toast.astro). */

const SHOW_MS = 2200;

function initToast(): void {
  const host = document.getElementById("toastHost");
  if (!host) return;

  window.addEventListener("doodleai:toast", (event) => {
    const text = (event as CustomEvent<{ text?: string }>).detail?.text;
    if (!text) return;

    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = text;
    host.appendChild(node);

    // Two rAFs rather than one: the node needs one full layout pass in its
    // initial (opacity: 0) state before flipping data-visible, or the
    // transition can get collapsed into the same frame and never animate.
    requestAnimationFrame(() => requestAnimationFrame(() => node.setAttribute("data-visible", "true")));

    window.setTimeout(() => {
      node.setAttribute("data-visible", "false");
      window.setTimeout(() => node.remove(), 200);
    }, SHOW_MS);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initToast);
} else {
  initToast();
}

/** Convenience for other scripts — same event, no import of this module needed. */
export function showToast(text: string): void {
  window.dispatchEvent(new CustomEvent("doodleai:toast", { detail: { text } }));
}
