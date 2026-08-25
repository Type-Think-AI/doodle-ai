/* Sidebar interactivity: collapse toggle (persisted), resize, and auth slot.
   Runs on every app shell page (imported by Sidebar.astro). Theme switching
   lives on the settings page's Appearance section, not here. */

import { getSession, signOut } from "./auth-client";
import { listThreads, loadThread } from "./chat-store";

const SIDEBAR_COLLAPSED_KEY = "doodleai-sidebar-collapsed";
const SIDEBAR_WIDTH_KEY = "doodleai-sidebar-width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;

/** Playful placeholders for a chat with no doodle yet — on-brand, not a generic chat-bubble icon. */
const PLACEHOLDER_EMOJI = ["🎨", "✏️", "🖍️", "🐱", "🌟", "🦄", "🎭", "🐶"];

/** Deterministic per-thread pick — stays the same on every render, doesn't flicker on reload. */
function placeholderFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_EMOJI[hash % PLACEHOLDER_EMOJI.length]!;
}

function initSidebar(): void {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const collapseBtn = document.getElementById("sidebarCollapse");
  const openBtn = document.getElementById("sidebarOpen");
  const resizeHandle = document.getElementById("sidebarResizeHandle");
  const chatsList = document.getElementById("sidebarChatsList");
  const feedbackBtn = document.getElementById("sidebarFeedback");

  // The dialog itself lives in FeedbackDialog.astro (mounted once in
  // AppShellLayout.astro) and listens for this same event — decoupled via a
  // custom event rather than a direct import, same pattern as
  // doodleai:open-auth.
  feedbackBtn?.addEventListener("click", () => window.dispatchEvent(new Event("doodleai:open-feedback")));

  /* ---- Chats ---- */
  if (chatsList) {
    // A thread the user only just clicked "New chat" into and never sent
    // anything in is clutter, not history — the server already excludes
    // these from a synced list (GET /api/v1/threads), but this device's own
    // freshly-created thread hasn't necessarily round-tripped yet, so the
    // local mirror needs the same filter applied optimistically.
    const threads = listThreads().filter((t) => loadThread(t.id).length > 0);
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
        link.dataset.active = String(t.id === activeId);

        // A thumbnail once the thread has its first doodle; a playful,
        // on-brand emoji before that (stable per thread — see
        // placeholderFor) so a text-only conversation doesn't leave every
        // row looking like a generic chat app.
        const thumb = document.createElement("span");
        thumb.className = "sidebar-chat-thumb";
        if (t.thumbnailUrl) {
          const img = document.createElement("img");
          img.src = t.thumbnailUrl;
          img.alt = "";
          img.loading = "lazy";
          thumb.appendChild(img);
        } else {
          thumb.textContent = placeholderFor(t.id);
        }

        const title = document.createElement("span");
        title.className = "sidebar-chat-title";
        title.textContent = t.title;

        // Not link.append(thumb, title) — worker-configuration.d.ts declares
        // its own global Element.append() (Cloudflare's HTMLRewriter API),
        // which collides with the DOM's and breaks overload resolution here.
        link.appendChild(thumb);
        link.appendChild(title);
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

  const setCollapsed = (nextCollapsed: boolean): void => {
    collapsed = nextCollapsed;
    sidebar.classList.toggle("collapsed", collapsed);
    collapseBtn?.setAttribute("aria-label", collapsed ? "Hide sidebar" : "Collapse sidebar");
    collapseBtn?.setAttribute("aria-expanded", String(!collapsed));
    openBtn?.setAttribute("aria-expanded", String(collapsed));
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable — collapse state stays session-only */
    }
  };

  setCollapsed(collapsed);
  collapseBtn?.addEventListener("click", () => setCollapsed(true));
  openBtn?.addEventListener("click", () => setCollapsed(false));
  // Entering whiteboard mode (chat.ts) needs the room — decoupled via a
  // custom event rather than an export, same pattern as doodleai:open-auth.
  // Deliberately one-directional: leaving whiteboard mode does not
  // re-expand the sidebar, since the user may have manually collapsed it
  // before ever opening the whiteboard.
  window.addEventListener("doodleai:sidebar-collapse", () => setCollapsed(true));

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

  // Clicking this row opens the team switcher (account-menu.ts binds its own
  // click listener on #sidebarAuthUser) rather than navigating straight to
  // /settings — the profile link moved into that menu ("Your profile").
  userBox.classList.add("sidebar-auth-user-clickable");
  userBox.setAttribute("role", "button");
  userBox.setAttribute("tabindex", "0");
  userBox.setAttribute("aria-label", "Open team switcher");
  userBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      userBox.click();
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
  const balanceEl = document.getElementById("sidebarCreditsBalance");
  if (!balanceEl) return;

  window.addEventListener("doodleai:credits", (event) => {
    const balance = (event as CustomEvent<{ balance: number }>).detail?.balance;
    if (typeof balance === "number") setCreditsBalance(balanceEl, balance);
  });

  try {
    const res = await fetch("/api/v1/me", { credentials: "include" });
    if (!res.ok) return;
    const payload = (await res.json()) as { credits?: { balance?: unknown }; org?: { name?: string; isPersonal?: boolean } };
    const balance = payload.credits?.balance;
    if (typeof balance === "number") setCreditsBalance(balanceEl, balance);

    const orgEl = document.getElementById("sidebarAuthOrg");
    // "Just you" for the personal workspace rather than its auto-generated
    // "<name>'s Team" label — that label exists so the switcher has
    // something to show, but on the sidebar's own compact row it would read
    // as if the user had already created a team.
    if (orgEl && payload.org?.name) {
      orgEl.textContent = payload.org.isPersonal ? "Just you" : payload.org.name;
      orgEl.hidden = false;
    }
  } catch {
    // Balance just stays showing "…" — not worth a visible error for a
    // secondary readout the user can always get from /settings?tab=billing.
  }
}

/** Lives inline in the profile row now (see Sidebar.astro), not a separate block. */
function setCreditsBalance(balanceEl: HTMLElement, balance: number): void {
  balanceEl.textContent = `${balance} credit${balance === 1 ? "" : "s"}`;
  balanceEl.dataset.empty = String(balance <= 0);
  // The out-of-credits hint is a plain sentence, not a button — there's no
  // purchase flow yet (Stripe is out of scope for this phase), and a "Buy
  // credits" control that goes nowhere would be worse than no control.
  const hint = document.getElementById("sidebarCreditsHint");
  if (hint) hint.hidden = balance > 0;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar);
} else {
  initSidebar();
}
