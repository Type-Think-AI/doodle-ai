/* /b/:id — a single board.
 *
 * The two things this page exists to fix, stated plainly:
 *   1. There is a way IN. The pinned composer targets this board, and finished
 *      generations land here. The feature this replaces could only be filled by
 *      pasting a CDN URL into a text input, so it was always empty.
 *   2. Items keep their real proportions. The old asset grid forced every
 *      doodle into a 1:1 crop, which throws away information.
 */
import {
  deleteBoard,
  getBoard,
  listBoards,
  listItems,
  moveItem,
  removeItem,
  renameBoard,
  type BoardDetail,
  type BoardItem,
} from "./boards-api";
import { isSignedIn, currentUserId } from "./api-client";
import { initLightbox, openLightbox } from "./lightbox";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";

function countLabel(n: number): string {
  if (n === 0) return "Empty";
  return n === 1 ? "1 doodle" : `${n} doodles`;
}

/**
 * Trigger a download. CDN images are cross-origin, so the `download` attribute
 * alone is ignored by browsers; fetching to a blob first is what actually saves
 * the file. If the fetch is blocked we open the image instead of failing
 * silently.
 */
async function download(url: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = url.split("/").pop()?.split("?")[0] || "doodle.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function initBoardDetail(): void {
  const root = document.getElementById("boardDetail");
  if (!root) return;

  const boardId = root.dataset.boardId;
  if (!boardId) return;

  /**
   * Null in canvas view — that view renders a tldraw island instead of a grid.
   * The header (rename / share / delete) is shared by BOTH views, so this
   * controller must keep running when the grid is absent rather than bailing.
   */
  const grid = document.getElementById("boardGrid");

  const nameEl = document.getElementById("boardName");
  const metaEl = document.getElementById("boardMeta");
  const renameButton = document.getElementById("renameBoardButton") as HTMLButtonElement | null;
  const shareButton = document.getElementById("shareBoardButton") as HTMLButtonElement | null;
  const deleteButton = document.getElementById("deleteBoardButton") as HTMLButtonElement | null;
  const composer = document.getElementById("boardComposer") as HTMLFormElement | null;
  const promptInput = document.getElementById("boardPrompt") as HTMLInputElement | null;

  initLightbox();

  let board: BoardDetail | null = null;
  let items: BoardItem[] = [];

  function setStatus(message: string, isError = false): void {
    if (!grid) return;
    grid.innerHTML = "";
    const p = document.createElement("p");
    p.className = isError ? "bd-error" : "bd-status";
    p.textContent = message;
    grid.appendChild(p);
  }

  function renderHeader(): void {
    if (!board) return;
    const isInbox = board.kind === "inbox";
    const isOwner = currentUserId() === board.createdBy;

    if (nameEl) nameEl.textContent = board.name;
    document.title = `${board.name} — Doodle AI`;

    if (metaEl) {
      const parts = [countLabel(items.length)];
      if (isInbox) parts.push("everything you make lands here");
      metaEl.textContent = parts.join(" · ");
    }

    // The Inbox is a system board: it cannot be renamed, shared or deleted, so
    // those controls are not rendered rather than rendered-and-rejected.
    if (renameButton) renameButton.hidden = !isOwner || isInbox;
    if (shareButton) shareButton.hidden = !isOwner || isInbox;
    if (deleteButton) deleteButton.hidden = !isOwner || isInbox;
  }

  function buildCell(item: BoardItem): HTMLElement {
    const cell = document.createElement("figure");
    cell.className = "bd-cell";

    const img = document.createElement("img");
    img.alt = "Doodle";
    img.loading = "lazy";
    img.decoding = "async";
    // Intrinsic dimensions when we have them: reserves the right box before the
    // image loads, so the masonry columns do not reflow (CLS).
    if (item.width && item.height) {
      img.width = item.width;
      img.height = item.height;
    }
    setImageSrc(img, item.url);
    cell.appendChild(img);

    const open = () => openLightbox(items.map((i) => i.url), item.url);
    img.style.cursor = "zoom-in";
    img.addEventListener("click", open);

    const bar = document.createElement("figcaption");
    bar.className = "bd-cellbar";

    // Use as reference — hands the image back to the composer, which is the
    // loop that makes a board generative rather than an archive.
    const refBtn = document.createElement("button");
    refBtn.type = "button";
    refBtn.className = "bd-cellbtn";
    refBtn.textContent = "Reference";
    refBtn.title = "Use as reference in a new doodle";
    refBtn.addEventListener("click", () => {
      const url = new URL("/", window.location.origin);
      url.searchParams.set("board", boardId!);
      url.searchParams.set("ref", item.url);
      window.location.href = url.toString();
    });
    bar.appendChild(refBtn);

    // Move — a native <select> so mobile gets the platform picker and we do not
    // introduce a second dialog surface for a one-choice action.
    const move = document.createElement("select");
    move.className = "bd-cellbtn";
    move.setAttribute("aria-label", "Move this doodle to another board");
    const placeholder = document.createElement("option");
    placeholder.textContent = "Move…";
    placeholder.value = "";
    move.appendChild(placeholder);
    let boardsLoaded = false;
    move.addEventListener("focus", async () => {
      if (boardsLoaded) return;
      boardsLoaded = true;
      const all = await listBoards();
      (all ?? [])
        .filter((b) => b.id !== boardId)
        .forEach((b) => {
          const opt = document.createElement("option");
          opt.value = b.id;
          opt.textContent = b.name;
          move.appendChild(opt);
        });
    });
    move.addEventListener("change", async () => {
      const target = move.value;
      if (!target) return;
      move.disabled = true;
      const ok = await moveItem(boardId!, item.id, target, item.url);
      if (ok) {
        items = items.filter((i) => i.id !== item.id);
        renderGrid();
        renderHeader();
      } else {
        move.disabled = false;
        move.value = "";
      }
    });
    bar.appendChild(move);

    const dl = document.createElement("button");
    dl.type = "button";
    dl.className = "bd-cellbtn";
    dl.textContent = "Save";
    dl.title = "Download";
    dl.addEventListener("click", () => void download(item.url));
    bar.appendChild(dl);

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "bd-cellbtn";
    rm.textContent = "Remove";
    rm.title = "Remove from this board";
    rm.addEventListener("click", async () => {
      rm.disabled = true;
      const ok = await removeItem(boardId!, item.id);
      if (ok) {
        items = items.filter((i) => i.id !== item.id);
        renderGrid();
        renderHeader();
      } else {
        rm.disabled = false;
      }
    });
    bar.appendChild(rm);

    cell.appendChild(bar);
    return cell;
  }

  function renderGrid(): void {
    if (!grid) return; // canvas view — tldraw owns the surface
    grid.setAttribute("aria-busy", "false");
    if (items.length === 0) {
      grid.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "bd-empty";
      empty.textContent = "Nothing on this board yet — describe a doodle below and it lands here.";
      grid.appendChild(empty);
      return;
    }
    grid.innerHTML = "";
    items.forEach((item) => grid.appendChild(buildCell(item)));
  }

  async function load(): Promise<void> {
    if (!isSignedIn()) {
      if (nameEl) nameEl.textContent = "Sign in to view this board";
      setStatus("Boards are tied to your account. Sign in to see this one.");
      return;
    }

    const [detail, list] = await Promise.all([getBoard(boardId!), listItems(boardId!)]);

    if (!detail) {
      if (nameEl) nameEl.textContent = "Board not found";
      setStatus("That board doesn't exist, or you no longer have access to it.", true);
      return;
    }

    board = detail;
    items = list ?? [];
    renderHeader();
    renderGrid();
  }

  renameButton?.addEventListener("click", async () => {
    if (!board) return;
    const next = window.prompt("Rename this board", board.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === board.name) return;
    const updated = await renameBoard(boardId!, trimmed);
    if (updated) {
      board = updated;
      renderHeader();
    }
  });

  shareButton?.addEventListener("click", () => {
    if (!board) return;
    // Contract with board-share.ts — it owns the sheet and listens for this.
    window.dispatchEvent(
      new CustomEvent("board:share", { detail: { boardId: board.id, boardName: board.name } }),
    );
  });

  deleteButton?.addEventListener("click", async () => {
    if (!board) return;
    const ok = window.confirm(
      `Delete "${board.name}"? The doodles on it stay in your Inbox — only the board is removed.`,
    );
    if (!ok) return;
    if (await deleteBoard(boardId!)) window.location.href = "/boards";
  });

  // Composer hand-off: one generation pipeline, board as the target.
  composer?.addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = promptInput?.value.trim();
    if (!prompt) {
      promptInput?.focus();
      return;
    }
    const url = new URL("/", window.location.origin);
    url.searchParams.set("board", boardId!);
    url.searchParams.set("prompt", prompt);
    window.location.href = url.toString();
  });

  void load();
  guardBfcacheRestore();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBoardDetail);
} else {
  initBoardDetail();
}
