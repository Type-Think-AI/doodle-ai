/**
 * Board share sheet controller.
 *
 * Self-initialises on DOMContentLoaded. Listens on `window` for a CustomEvent
 * named 'board:share' with detail: { boardId: string, boardName: string }.
 * On that event, opens the <dialog id="boardShareSheet"> and loads state for
 * the given board.
 *
 * No other wiring is required.
 */

interface ShareLink {
  id: string;
  url: string;
  role: string;
  allowComments: boolean;
  expiresAt: number | null;
  createdAt: number;
}

interface Member {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: number;
}

let currentBoardId: string | null = null;
let dialog: HTMLDialogElement | null = null;
let openerElement: HTMLElement | null = null;

// --- DOM refs ---
function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// --- API helpers ---
async function api<T>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = (await res.json()) as T;
  return { ok: res.ok, data };
}

function showStatus(msg: string, type: "error" | "success"): void {
  const el = $("bssStatus");
  if (!el) return;
  el.textContent = msg;
  el.setAttribute("data-type", type);
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

// --- Render helpers ---
function renderLinks(links: ShareLink[]): void {
  const list = $("bssLinksList");
  const empty = $("bssLinksEmpty");
  if (!list) return;

  // Clear existing items (keep the empty message element)
  list.querySelectorAll(".bss-link-item").forEach((el) => el.remove());

  if (links.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const link of links) {
    const row = document.createElement("div");
    row.className = "bss-link-item";
    row.innerHTML = `
      <span class="bss-link-role">${link.role}</span>
      <span class="bss-link-url">${link.url}</span>
      <button type="button" class="bss-btn-sm" data-action="copy" data-url="${link.url}">Copy</button>
      <button type="button" class="bss-btn-sm" data-action="revoke" data-link-id="${link.id}">Revoke</button>
    `;
    list.appendChild(row);
  }
}

function renderMembers(members: Member[]): void {
  const list = $("bssMembersList");
  const empty = $("bssMembersEmpty");
  if (!list) return;

  list.querySelectorAll(".bss-member-item").forEach((el) => el.remove());

  if (members.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const m of members) {
    const row = document.createElement("div");
    row.className = "bss-member-item";
    row.innerHTML = `
      <div class="bss-member-info">
        <div class="bss-member-name">${escapeHtml(m.name || m.email)}</div>
        <div class="bss-member-email">${escapeHtml(m.email)}</div>
      </div>
      <span class="bss-member-role">${m.role}</span>
      <button type="button" class="bss-btn-sm" data-action="remove-member" data-user-id="${m.userId}">Remove</button>
    `;
    list.appendChild(row);
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- State loading ---
async function loadState(): Promise<void> {
  if (!currentBoardId) return;

  // Load links
  const linksRes = await api<{ links: ShareLink[] }>("GET", `/api/v1/boards/${currentBoardId}/share`);
  if (linksRes.ok) {
    renderLinks(linksRes.data.links ?? []);
  } else {
    renderLinks([]);
  }

  // Load members
  const membersRes = await api<{ members: Member[] }>("GET", `/api/v1/boards/${currentBoardId}/members`);
  if (membersRes.ok) {
    renderMembers(membersRes.data.members ?? []);
  } else {
    renderMembers([]);
  }
}

// --- Actions ---
async function createLink(): Promise<void> {
  if (!currentBoardId) return;
  const select = $("bssRoleSelect") as HTMLSelectElement | null;
  const role = select?.value ?? "view";

  const res = await api<{ link?: ShareLink; error?: { message?: string } }>(
    "POST",
    `/api/v1/boards/${currentBoardId}/share`,
    { role },
  );

  if (!res.ok) {
    showStatus(res.data.error?.message || "Failed to create link.", "error");
    return;
  }

  showStatus("Link created.", "success");
  await loadState();
}

async function revokeLink(linkId: string): Promise<void> {
  if (!currentBoardId) return;

  const res = await api<{ error?: { message?: string } }>(
    "DELETE",
    `/api/v1/boards/${currentBoardId}/share?linkId=${encodeURIComponent(linkId)}`,
  );

  if (!res.ok) {
    showStatus(res.data.error?.message || "Failed to revoke.", "error");
    return;
  }

  showStatus("Link revoked.", "success");
  await loadState();
}

async function inviteMember(): Promise<void> {
  if (!currentBoardId) return;
  const input = $("bssInviteInput") as HTMLInputElement | null;
  const roleSelect = $("bssInviteRole") as HTMLSelectElement | null;
  const email = input?.value.trim();
  const role = roleSelect?.value ?? "view";

  if (!email) {
    showStatus("Enter an email address to invite.", "error");
    input?.focus();
    return;
  }
  // Shape check only — whether an account actually uses this address is the
  // server's call, and its message is surfaced verbatim below.
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    showStatus("That doesn't look like an email address.", "error");
    input?.focus();
    return;
  }

  const res = await api<{ error?: { message?: string } }>(
    "POST",
    `/api/v1/boards/${currentBoardId}/members`,
    { email, role },
  );

  if (!res.ok) {
    showStatus(res.data.error?.message || "Failed to invite.", "error");
    return;
  }

  if (input) input.value = "";
  showStatus("Member added.", "success");
  await loadState();
}

async function removeMember(userId: string): Promise<void> {
  if (!currentBoardId) return;

  const res = await api<{ error?: { message?: string } }>(
    "DELETE",
    `/api/v1/boards/${currentBoardId}/members?userId=${encodeURIComponent(userId)}`,
  );

  if (!res.ok) {
    showStatus(res.data.error?.message || "Failed to remove.", "error");
    return;
  }

  showStatus("Member removed.", "success");
  await loadState();
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    showStatus("Copied to clipboard.", "success");
  }).catch(() => {
    showStatus("Copy failed — try manually.", "error");
  });
}

// --- Dialog management ---
function openSheet(): void {
  if (!dialog) return;
  dialog.showModal();
  // Focus first interactive control
  const firstControl = dialog.querySelector<HTMLElement>("select, input, button:not(.bss-close)");
  firstControl?.focus();
}

function closeSheet(): void {
  if (!dialog) return;
  dialog.close();
  // Return focus to opener
  if (openerElement) {
    openerElement.focus();
    openerElement = null;
  }
}

// --- Initialisation ---
function init(): void {
  dialog = document.getElementById("boardShareSheet") as HTMLDialogElement | null;
  if (!dialog) return;

  // Listen for the board:share custom event
  window.addEventListener("board:share", ((e: CustomEvent<{ boardId: string; boardName: string }>) => {
    currentBoardId = e.detail.boardId;
    const titleEl = $("bssTitle");
    if (titleEl) titleEl.textContent = `Share "${e.detail.boardName}"`;

    // Track opener for focus restoration
    openerElement = document.activeElement as HTMLElement | null;

    openSheet();
    void loadState();
  }) as EventListener);

  // Close button
  $("bssClose")?.addEventListener("click", closeSheet);

  // Escape closes via native dialog, but ensure focus restoration
  dialog.addEventListener("close", () => {
    if (openerElement) {
      openerElement.focus();
      openerElement = null;
    }
  });

  // Click outside (::backdrop) closes
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeSheet();
  });

  // Create link
  $("bssCreateLink")?.addEventListener("click", () => void createLink());

  // Invite
  $("bssInviteBtn")?.addEventListener("click", () => void inviteMember());

  // Delegated click handlers for dynamic items
  $("bssLinksList")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (action === "copy") {
      const url = btn.getAttribute("data-url");
      if (url) copyToClipboard(url);
    } else if (action === "revoke") {
      const linkId = btn.getAttribute("data-link-id");
      if (linkId) void revokeLink(linkId);
    }
  });

  $("bssMembersList")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-action='remove-member']");
    if (!btn) return;
    const userId = btn.getAttribute("data-user-id");
    if (userId) void removeMember(userId);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
