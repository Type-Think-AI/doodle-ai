/* Sidebar interactivity: collapse toggle (persisted), API-key status pill,
   and theme toggle. Runs on every app shell page (imported by
   Sidebar.astro). */

import { STORAGE_KEY } from "../../lib/doodle-constants";
import { getStoredTheme, toggleTheme } from "../../lib/theme";
import { listThreads } from "./chat-store";

const SIDEBAR_COLLAPSED_KEY = "doodleai-sidebar-collapsed";

function initSidebar(): void {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const collapseBtn = document.getElementById("sidebarCollapse");
  const keyDot = document.getElementById("sidebarKeyDot");
  const keyLabel = document.getElementById("sidebarKeyLabel");
  const themeToggle = document.getElementById("sidebarThemeToggle");
  const themeLabel = document.getElementById("sidebarThemeLabel");
  const chatsList = document.getElementById("sidebarChatsList");

  /* ---- Chats ---- */
  if (chatsList) {
    const threads = listThreads();
    const activeId = window.location.pathname.match(/\/c\/([^/]+)/)?.[1];
    if (threads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sidebar-chats-empty";
      empty.textContent = "No chats yet";
      chatsList.appendChild(empty);
    } else {
      threads.slice(0, 20).forEach((t) => {
        const link = document.createElement("a");
        link.href = `/c/${t.id}`;
        link.className = "sidebar-chat-link";
        link.textContent = t.title;
        link.dataset.active = String(t.id === activeId);
        chatsList.appendChild(link);
      });
    }
  }

  /* ---- Collapse ---- */
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }
  sidebar.classList.toggle("collapsed", collapsed);
  collapseBtn?.addEventListener("click", () => {
    collapsed = !collapsed;
    sidebar.classList.toggle("collapsed", collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable — collapse state stays session-only */
    }
  });

  /* ---- API key status ---- */
  let hasKey = false;
  try {
    hasKey = Boolean(localStorage.getItem(STORAGE_KEY)?.trim());
  } catch {
    hasKey = false;
  }
  keyDot?.setAttribute("data-connected", String(hasKey));
  if (keyLabel) keyLabel.textContent = hasKey ? "API key connected" : "Add API key";

  /* ---- Theme toggle ---- */
  if (themeToggle && themeLabel) {
    const labelFor = (t: ReturnType<typeof getStoredTheme>) => (t === "dark" ? "Light mode" : "Dark mode");
    themeLabel.textContent = labelFor(getStoredTheme());
    themeToggle.addEventListener("click", () => {
      themeLabel.textContent = labelFor(toggleTheme());
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}
