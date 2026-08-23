/* Settings page: API key persistence, appearance toggle, and the two local
   "doodle defaults" preferences (visual style + default skill). */

import {
  DEFAULT_SKILL_STORAGE_KEY,
  STORAGE_KEY,
  STYLE_THEME_STORAGE_KEY,
} from "../../lib/doodle-constants";
import { getStoredTheme, setTheme, type ThemeName } from "../../lib/theme";

function initSettings(): void {
  const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement | null;
  const keySaved = document.getElementById("keySaved");
  const appearanceRow = document.getElementById("appearanceRow");
  const styleSelect = document.getElementById("styleThemeSelect") as HTMLSelectElement | null;
  const defaultSkillSelect = document.getElementById("defaultSkillSelect") as HTMLSelectElement | null;
  if (!apiKeyInput) return;

  /* ---- API key ---- */
  let apiKey = "";
  try {
    apiKey = localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    apiKey = "";
  }
  apiKeyInput.value = apiKey;
  if (keySaved) keySaved.hidden = !apiKey.trim();

  apiKeyInput.addEventListener("input", () => {
    const next = apiKeyInput.value.trim();
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable (private mode) — key stays in memory only */
    }
    if (keySaved) keySaved.hidden = !next;
  });

  /* ---- Appearance ---- */
  function syncAppearance(theme: ThemeName): void {
    appearanceRow?.querySelectorAll<HTMLButtonElement>(".appearance-card").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeOpt === theme));
    });
  }
  syncAppearance(getStoredTheme());
  appearanceRow?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-opt]");
    const theme = btn?.dataset.themeOpt as ThemeName | undefined;
    if (!theme) return;
    setTheme(theme);
    syncAppearance(theme);
  });

  /* ---- Doodle defaults ---- */
  if (styleSelect) {
    try {
      styleSelect.value = localStorage.getItem(STYLE_THEME_STORAGE_KEY) || "pastel";
    } catch {
      styleSelect.value = "pastel";
    }
    styleSelect.addEventListener("change", () => {
      try {
        localStorage.setItem(STYLE_THEME_STORAGE_KEY, styleSelect.value);
      } catch {
        /* storage unavailable — preference stays session-only */
      }
    });
  }

  if (defaultSkillSelect) {
    try {
      defaultSkillSelect.value = localStorage.getItem(DEFAULT_SKILL_STORAGE_KEY) || "normal";
    } catch {
      defaultSkillSelect.value = "normal";
    }
    defaultSkillSelect.addEventListener("change", () => {
      try {
        localStorage.setItem(DEFAULT_SKILL_STORAGE_KEY, defaultSkillSelect.value);
      } catch {
        /* storage unavailable — preference stays session-only */
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}
