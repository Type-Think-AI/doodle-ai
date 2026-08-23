/* Shared dark/light theme toggle. Dark is the product default.
   Applied via [data-theme] on <html> (see app.css). The inline snippet in
   AppLayout.astro's <head> mirrors getStoredTheme()+applyTheme() to avoid a
   flash of the wrong theme before this module loads. */

export type ThemeName = "dark" | "light";

export const THEME_STORAGE_KEY = "doodleai-theme";

export function getStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: ThemeName): void {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode) — theme stays session-only */
  }
}

export function toggleTheme(): ThemeName {
  const next: ThemeName = getStoredTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Wires a toggle button's label/click handling. Call once per page. */
export function initThemeToggle(
  button: HTMLElement,
  labelFor: (theme: ThemeName) => string = (t) => (t === "dark" ? "☀" : "☾"),
): void {
  button.textContent = labelFor(getStoredTheme());
  button.addEventListener("click", () => {
    button.textContent = labelFor(toggleTheme());
  });
}
