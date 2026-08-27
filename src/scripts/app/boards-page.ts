/* /boards — the board index.
 *
 * Each board is rendered as a mosaic of its own newest items, not as a folder
 * card. That is the central lesson from the feature this replaces: a container
 * you cannot see into gives you no reason to open it, so it stays empty, so
 * nobody exercises anything inside it.
 */
import { createBoard, listBoards, type BoardListEntry } from "./boards-api";
import { isSignedIn } from "./api-client";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";

const COVER_SLOTS = 4;

function relativeTime(ms: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "last month" : `${months} months ago`;
}

function countLabel(n: number): string {
  if (n === 0) return "Empty";
  return n === 1 ? "1 doodle" : `${n} doodles`;
}

/**
 * Build the cover mosaic.
 *
 * The layout ADAPTS to how many items exist (1 / 2 / 3 / 4+) rather than always
 * drawing a 2x2 grid. A fixed 2x2 left a three-doodle board with one glaring
 * empty quadrant, which read as a rendering failure rather than a board that
 * happens to hold three things. CSS does the arranging via `data-count`; this
 * function only decides how many tiles to emit.
 */
function buildMosaic(entry: BoardListEntry): HTMLElement {
  const mosaic = document.createElement("div");
  mosaic.className = "bd-mosaic";

  const covers = entry.coverItems.slice(0, COVER_SLOTS);
  const shown = Math.min(covers.length, COVER_SLOTS);
  mosaic.dataset.count = String(shown);

  if (shown === 0) {
    mosaic.dataset.count = "0";
    const blank = document.createElement("div");
    blank.className = "bd-mosaic-blank";
    mosaic.appendChild(blank);
    return mosaic;
  }

  // Only the 4-tile layout can overflow, and only then is a "+N" tile useful.
  const overflow = shown === COVER_SLOTS ? entry.itemCount - COVER_SLOTS : 0;

  covers.slice(0, shown).forEach((item, i) => {
    const isLastTile = i === shown - 1;
    if (isLastTile && overflow > 0) {
      const more = document.createElement("div");
      more.className = "bd-mosaic-more";
      more.textContent = `+${overflow + 1}`;
      mosaic.appendChild(more);
      return;
    }
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    setImageSrc(img, item.url);
    mosaic.appendChild(img);
  });

  return mosaic;
}

function buildRow(entry: BoardListEntry): HTMLElement {
  const row = document.createElement("a");
  row.className = "bd-row";
  row.href = `/b/${encodeURIComponent(entry.id)}`;

  const isInbox = entry.kind === "inbox";
  row.setAttribute(
    "aria-label",
    `${entry.name}, ${countLabel(entry.itemCount).toLowerCase()}${entry.shared ? ", shared with you" : ""}`,
  );

  row.appendChild(buildMosaic(entry));

  const name = document.createElement("p");
  name.className = "bd-rowname";
  name.textContent = entry.name;
  row.appendChild(name);

  const meta = document.createElement("p");
  meta.className = "bd-rowmeta";
  const parts: string[] = [countLabel(entry.itemCount)];
  if (isInbox) parts.push("everything you make");
  else parts.push(relativeTime(entry.updatedAt));
  if (entry.shared) parts.push("shared with you");
  meta.textContent = parts.join(" · ");
  row.appendChild(meta);

  return row;
}

function initBoardsPage(): void {
  const listRoot = document.getElementById("boardsList");
  if (!listRoot) return;
  // Re-bound as non-nullable: TypeScript does not carry the null-narrowing
  // above into the hoisted function declarations below, since those could in
  // principle be called before the guard runs.
  const list: HTMLElement = listRoot;

  const newButton = document.getElementById("newBoardButton");
  const form = document.getElementById("newBoardForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("newBoardName") as HTMLInputElement | null;
  const cancelButton = document.getElementById("cancelBoardButton");
  const errorEl = document.getElementById("newBoardError");

  function showError(message: string | null): void {
    if (!errorEl) return;
    errorEl.textContent = message ?? "";
    errorEl.hidden = !message;
  }

  function renderEmpty(): void {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "bd-empty";
    empty.innerHTML =
      'Nothing here yet — <a href="/">make a doodle</a> and it lands in your Inbox automatically.';
    list.appendChild(empty);
  }

  function renderSignedOut(): void {
    list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "bd-empty";
    empty.innerHTML = 'Sign in to keep boards across your devices — or <a href="/">start a doodle</a>.';
    list.appendChild(empty);
  }

  async function render(): Promise<void> {
    if (!isSignedIn()) {
      list.setAttribute("aria-busy", "false");
      renderSignedOut();
      return;
    }

    const boards = await listBoards();
    list.setAttribute("aria-busy", "false");

    // null means the request failed — say so rather than implying "no boards".
    if (boards === null) {
      list.innerHTML = "";
      const err = document.createElement("p");
      err.className = "bd-error";
      err.textContent = "Couldn't load your boards. Check your connection and reload.";
      list.appendChild(err);
      return;
    }

    if (boards.length === 0) {
      renderEmpty();
      return;
    }

    list.innerHTML = "";
    boards.forEach((entry) => list.appendChild(buildRow(entry)));
  }

  function openForm(): void {
    if (!form || !nameInput) return;
    form.hidden = false;
    if (newButton) newButton.hidden = true;
    nameInput.focus();
  }

  function closeForm(): void {
    if (!form || !nameInput) return;
    form.hidden = true;
    nameInput.value = "";
    showError(null);
    if (newButton) {
      newButton.hidden = false;
      (newButton as HTMLButtonElement).focus();
    }
  }

  newButton?.addEventListener("click", openForm);
  cancelButton?.addEventListener("click", closeForm);

  nameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeForm();
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim();
    if (!name) {
      showError("Give the board a name.");
      nameInput?.focus();
      return;
    }
    showError(null);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;

    const created = await createBoard(name);

    if (submit) submit.disabled = false;
    if (!created) {
      showError("Couldn't create that board. Try again.");
      return;
    }
    // Go straight into the new board — the next thing anyone wants is to put
    // something in it, and that only happens on the detail page.
    window.location.href = `/b/${encodeURIComponent(created.id)}`;
  });

  void render();
  guardBfcacheRestore();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBoardsPage);
} else {
  initBoardsPage();
}
