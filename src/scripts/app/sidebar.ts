/* Sidebar interactivity: collapse toggle (persisted), resize, and auth slot.
   Runs on every app shell page (imported by Sidebar.astro). Theme switching
   lives on the settings page's Appearance section, not here. */

import { getSession, signOut } from "./auth-client";
import { listThreads } from "./chat-store";

const SIDEBAR_COLLAPSED_KEY = "doodleai-sidebar-collapsed";
const SIDEBAR_WIDTH_KEY = "doodleai-sidebar-width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;

function initSidebar(): void {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const collapseBtn = document.getElementById("sidebarCollapse");
  const resizeHandle = document.getElementById("sidebarResizeHandle");
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

  /* ---- Resize ---- */
  try {
    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (storedWidth >= SIDEBAR_MIN_WIDTH && storedWidth <= SIDEBAR_MAX_WIDTH) {
      sidebar.style.setProperty("--sidebar-w", `${storedWidth}px`);
    }
  } catch {
    /* storage unavailable — default width applies */
  }

  resizeHandle?.addEventListener("pointerdown", (event) => {
    if (sidebar.classList.contains("collapsed")) return;
    event.preventDefault();
    sidebar.classList.add("resizing");
    const pointerId = (event as PointerEvent).pointerId;
    resizeHandle.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = sidebar.getBoundingClientRect();
      const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, moveEvent.clientX - rect.left));
      sidebar.style.setProperty("--sidebar-w", `${width}px`);
    };
    const onUp = () => {
      sidebar.classList.remove("resizing");
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
      try {
        const width = parseFloat(getComputedStyle(sidebar).getPropertyValue("--sidebar-w"));
        if (width) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
      } catch {
        /* storage unavailable — resized width stays session-only */
      }
    };
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
  });

  /* ---- Auth slot ---- */
  void renderAuthSlot();
}

/**
 * Fills the sidebar's auth slot from /api/auth/get-session.
 *
 * Resolved on the client rather than server-rendered because the app shell's
 * pages are otherwise static — making them all SSR just to label one pill
 * would cost a Worker invocation per navigation. The session read itself is
 * a KV hit, not a D1 one (see src/lib/auth/index.ts).
 */
async function renderAuthSlot(): Promise<void> {
  const signInLink = document.getElementById("sidebarSignIn");
  const userBox = document.getElementById("sidebarAuthUser");
  if (!signInLink || !userBox) return;

  const user = await getSession();

  if (!user) {
    // Opens the shared #authDialog (src/components/app/AuthDialog.astro)
    // mounted once in AppShellLayout.astro, rather than navigating to a
    // dedicated page — there's no separate /signin route anymore.
    signInLink.addEventListener("click", () => window.dispatchEvent(new Event("doodleai:open-auth")));
    signInLink.hidden = false;
    return;
  }

  const avatar = document.getElementById("sidebarAuthAvatar");
  const nameEl = document.getElementById("sidebarAuthName");
  const emailEl = document.getElementById("sidebarAuthEmail");
  const signOutBtn = document.getElementById("sidebarSignOut");

  const displayName = user.name || user.email;
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email;
  if (avatar) {
    if (user.image) avatar.style.backgroundImage = `url("${user.image}")`;
    else avatar.textContent = displayName.charAt(0).toUpperCase();
  }

  const openProfile = (): void => {
    window.location.href = "/settings?tab=general#profile";
  };
  userBox.classList.add("sidebar-auth-user-clickable");
  userBox.setAttribute("role", "link");
  userBox.setAttribute("tabindex", "0");
  userBox.setAttribute("aria-label", "Open your profile settings");
  userBox.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("#sidebarSignOut")) return;
    openProfile();
  });
  userBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfile();
    }
  });

  signOutBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await signOut();
    // Reload rather than re-render: other surfaces on the page (and the
    // stores, from Phase 3 on) read session state at load time.
    window.location.reload();
  });

  userBox.hidden = false;

  // Only signed-in users get a balance slot at all — /api/v1/me 401s
  // otherwise, and the sign-in state above has already returned by then.
  void renderCreditsSlot();
}

/**
 * Fetches the starting balance from /api/v1/me (the single authoritative
 * source per docs/mobile-strategy.md) and wires the slot to stay current
 * afterwards. Generation-time updates don't refetch — chat.ts already reads
 * the post-spend balance off the same /api/chat stream and rebroadcasts it
 * as a `doodleai:credits` window event, so this listener is the only other
 * place that needs to know.
 */
async function renderCreditsSlot(): Promise<void> {
  const wrap = document.getElementById("sidebarCredits");
  const balanceEl = document.getElementById("sidebarCreditsBalance");
  if (!wrap || !balanceEl) return;

  window.addEventListener("doodleai:credits", (event) => {
    const balance = (event as CustomEvent<{ balance: number }>).detail?.balance;
    if (typeof balance === "number") setCreditsBalance(wrap, balanceEl, balance);
  });

  try {
    const res = await fetch("/api/v1/me", { credentials: "include" });
    if (!res.ok) return;
    const payload = (await res.json()) as { credits?: { balance?: unknown } };
    const balance = payload.credits?.balance;
    if (typeof balance === "number") setCreditsBalance(wrap, balanceEl, balance);
  } catch {
    // Balance just stays hidden — not worth a visible error for a secondary
    // readout the user can always get from /settings?tab=billing.
  }
}

function setCreditsBalance(wrap: HTMLElement, balanceEl: HTMLElement, balance: number): void {
  balanceEl.textContent = `${balance} credit${balance === 1 ? "" : "s"}`;
  wrap.dataset.empty = String(balance <= 0);
  // The out-of-credits hint is a plain sentence, not a button — there's no
  // purchase flow yet (Stripe is out of scope for this phase), and a "Buy
  // credits" control that goes nowhere would be worse than no control.
  const hint = document.getElementById("sidebarCreditsHint");
  if (hint) hint.hidden = balance > 0;
  wrap.hidden = false;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}
