/* Sidebar interactivity: collapse toggle (persisted), API-key status pill,
   theme toggle, and the Akku helper-panel toggle button. Runs on every app
   shell page (imported by Sidebar.astro). */

import { STORAGE_KEY } from "../../lib/doodle-constants";
import { getStoredTheme, toggleTheme } from "../../lib/theme";

const SIDEBAR_COLLAPSED_KEY = "doodlebooth-sidebar-collapsed";

function initSidebar(): void {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const collapseBtn = document.getElementById("sidebarCollapse");
  const keyDot = document.getElementById("sidebarKeyDot");
  const keyLabel = document.getElementById("sidebarKeyLabel");
  const themeToggle = document.getElementById("sidebarThemeToggle");
  const themeLabel = document.getElementById("sidebarThemeLabel");
  const akkuToggle = document.getElementById("akkuNavToggle");

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

  /* ---- Akku helper toggle ---- */
  akkuToggle?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("doodlebooth:toggle-helper"));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}
