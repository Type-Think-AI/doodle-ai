/* Settings hub: URL-routed tabs on desktop, accordion panels on mobile, and
   session-aware profile data with local demo preferences until profile writes
   are connected to the account API. */

import { STYLE_THEME_STORAGE_KEY, THEMES } from "../../lib/doodle-constants";
import { getStoredTheme, setTheme, type ThemeName } from "../../lib/theme";
import { getSession, type AuthUser } from "./auth-client";

const PROFILE_STORAGE_KEY = "doodleai-profile-preferences";
const VALID_TABS = ["general", "subscription", "connectors", "billing"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

interface ProfilePreferences {
  name?: string;
  nickname?: string;
  preferences?: string;
}

function getRequestedTab(): SettingsTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return VALID_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : "general";
}

function isMobile(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
}

function readProfilePreferences(): ProfilePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? (value as ProfilePreferences) : {};
  } catch {
    return {};
  }
}

function writeProfilePreferences(value: ProfilePreferences): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep the preference in the current form only */
  }
}

function initials(user: AuthUser | null): string {
  const name = user?.name?.trim() || user?.email?.trim() || "?";
  return name.slice(0, 1).toUpperCase();
}

function initSettings(): void {
  const root = document.getElementById("settingsRoot");
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-settings-tab]"));
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-settings-panel]"));
  const mobileToggles = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-settings-toggle]"));
  const profileName = document.getElementById("settingsProfileName");
  const profileEmail = document.getElementById("settingsProfileEmail");
  const profileAvatar = document.getElementById("settingsProfileAvatar");
  const fullNameInput = document.getElementById("settingsFullName") as HTMLInputElement | null;
  const nicknameInput = document.getElementById("settingsNickname") as HTMLInputElement | null;
  const preferencesInput = document.getElementById("settingsPreferences") as HTMLTextAreaElement | null;
  const preferencesCount = document.getElementById("settingsPreferencesCount");
  const saveProfileButton = document.getElementById("settingsSaveProfile") as HTMLButtonElement | null;
  const saveStatus = document.getElementById("settingsSaveStatus");
  const signInCard = document.getElementById("settingsSignInCard");
  const signInButton = document.getElementById("settingsProfileSignIn");
  const avatarButton = document.getElementById("settingsAvatarButton") as HTMLButtonElement | null;
  const avatarInput = document.getElementById("settingsAvatarInput") as HTMLInputElement | null;
  if (tabs.length === 0 || panels.length === 0) return;

  let activeTab = getRequestedTab();
  let sessionUser: AuthUser | null = null;
  let avatarObjectUrl: string | null = null;

  function syncProfilePreferences(): void {
    const preferences = readProfilePreferences();
    if (fullNameInput && !fullNameInput.value) fullNameInput.value = preferences.name || sessionUser?.name || "";
    if (nicknameInput) nicknameInput.value = preferences.nickname || "";
    if (preferencesInput) preferencesInput.value = preferences.preferences || "";
    if (preferencesCount && preferencesInput) preferencesCount.textContent = `${preferencesInput.value.length}/1000`;
  }

  function syncProfileUser(user: AuthUser | null): void {
    sessionUser = user;
    const displayName = user?.name || user?.email || "Your profile";
    if (profileName) profileName.textContent = displayName;
    if (profileEmail) profileEmail.textContent = user?.email || "Sign in to sync your profile";
    if (profileAvatar) {
      profileAvatar.textContent = initials(user);
      profileAvatar.style.backgroundImage = user?.image ? `url("${user.image}")` : "";
    }
    if (signInCard) signInCard.hidden = Boolean(user);
    if (saveProfileButton) saveProfileButton.disabled = !user;
    if (avatarButton) avatarButton.disabled = !user;
    syncProfilePreferences();
  }

  function syncPanels(): void {
    const mobile = isMobile();
    tabs.forEach((tab) => {
      const selected = tab.dataset.settingsTab === activeTab;
      tab.setAttribute("aria-selected", String(selected));
    });
    panels.forEach((panel) => {
      const selected = panel.dataset.settingsPanel === activeTab;
      if (mobile) {
        panel.hidden = false;
        if (!panel.dataset.mobileOpen) panel.dataset.mobileOpen = String(selected);
      } else {
        panel.hidden = !selected;
        delete panel.dataset.mobileOpen;
      }
    });
    mobileToggles.forEach((toggle) => {
      const open = toggle.closest<HTMLElement>("[data-settings-panel]")?.dataset.mobileOpen === "true";
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  function setActiveTab(next: string, updateUrl = true): void {
    if (!VALID_TABS.includes(next as SettingsTab)) return;
    activeTab = next as SettingsTab;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    }
    syncPanels();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.settingsTab || "general"));
  });
  mobileToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const panel = toggle.closest<HTMLElement>("[data-settings-panel]");
      if (!panel) return;
      if (!isMobile()) {
        setActiveTab(panel.dataset.settingsPanel || "general");
        return;
      }
      panel.dataset.mobileOpen = String(panel.dataset.mobileOpen !== "true");
      toggle.setAttribute("aria-expanded", panel.dataset.mobileOpen);
    });
  });
  window.addEventListener("resize", syncPanels);
  window.addEventListener("popstate", () => {
    activeTab = getRequestedTab();
    syncPanels();
  });

  /* ---- Appearance and doodle defaults ---- */
  const appearanceRow = document.getElementById("appearanceRow");
  const styleSelect = document.getElementById("styleThemeSelect") as HTMLSelectElement | null;
  function syncAppearance(theme: ThemeName): void {
    appearanceRow?.querySelectorAll<HTMLButtonElement>(".appearance-card").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeOpt === theme));
    });
  }
  syncAppearance(getStoredTheme());
  appearanceRow?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-opt]");
    const theme = button?.dataset.themeOpt as ThemeName | undefined;
    if (!theme) return;
    setTheme(theme);
    syncAppearance(theme);
  });
  if (styleSelect) {
    try {
      styleSelect.value = localStorage.getItem(STYLE_THEME_STORAGE_KEY) || THEMES[0]?.id || "pastel";
    } catch {
      styleSelect.value = THEMES[0]?.id || "pastel";
    }
    styleSelect.addEventListener("change", () => {
      try {
        localStorage.setItem(STYLE_THEME_STORAGE_KEY, styleSelect.value);
      } catch {
        /* storage unavailable — preference stays session-only */
      }
    });
  }

  /* ---- Subscription controls ---- */
  const upgradeButton = document.getElementById("settingsUpgradeButton");
  const upgradeStatus = document.getElementById("settingsUpgradeStatus");
  upgradeButton?.addEventListener("click", () => {
    if (upgradeStatus) upgradeStatus.textContent = "Upgrade checkout is coming soon.";
  });
  root.querySelectorAll<HTMLButtonElement>("[data-usage-range]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll<HTMLButtonElement>("[data-usage-range]").forEach((rangeButton) => {
        rangeButton.setAttribute("aria-pressed", String(rangeButton === button));
      });
    });
  });

  /* ---- Profile preferences ---- */
  preferencesInput?.addEventListener("input", () => {
    if (preferencesCount) preferencesCount.textContent = `${preferencesInput.value.length}/1000`;
  });
  saveProfileButton?.addEventListener("click", () => {
    if (!sessionUser) {
      window.dispatchEvent(new Event("doodleai:open-auth"));
      return;
    }
    writeProfilePreferences({
      name: fullNameInput?.value.trim() || sessionUser.name,
      nickname: nicknameInput?.value.trim(),
      preferences: preferencesInput?.value.trim(),
    });
    if (profileName && fullNameInput?.value.trim()) profileName.textContent = fullNameInput.value.trim();
    if (saveStatus) {
      saveStatus.textContent = "Saved on this device";
      window.setTimeout(() => {
        if (saveStatus) saveStatus.textContent = "";
      }, 2400);
    }
  });
  signInButton?.addEventListener("click", () => window.dispatchEvent(new Event("doodleai:open-auth")));
  avatarButton?.addEventListener("click", () => avatarInput?.click());
  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    if (!file || !profileAvatar || !sessionUser || !file.type.startsWith("image/")) return;
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = URL.createObjectURL(file);
    profileAvatar.textContent = "";
    profileAvatar.style.backgroundImage = `url("${avatarObjectUrl}")`;
    if (saveStatus) saveStatus.textContent = "Avatar preview only — server upload is next";
  });
  window.addEventListener("beforeunload", () => {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
  });

  syncProfileUser(null);
  void getSession().then(syncProfileUser);
  setActiveTab(activeTab, false);
  if (window.location.hash === "#profile") {
    window.setTimeout(() => document.getElementById("settingsProfileCard")?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}
