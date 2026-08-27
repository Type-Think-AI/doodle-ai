/* Client-side data access for Boards.
 *
 * One module so /boards and /b/:id cannot drift apart the way the old
 * /projects batch panel drifted from doodle-constants.ts (it hardcoded four
 * skills as <option> tags while the catalogue grew past twenty, and nothing
 * in the build could catch it).
 *
 * Every call goes through apiFetch, which never throws and returns null on
 * failure — callers render an honest error state rather than a blank screen.
 */
import { apiFetch } from "./api-client";

// ─── Types (mirror src/lib/boards/queries.ts DTOs) ───────────────────────────

export interface BoardItemPreview {
  id: string;
  url: string;
}

export interface BoardListEntry {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  viewMode: string;
  itemCount: number;
  coverItems: BoardItemPreview[];
  shared: boolean;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  viewMode: string;
  createdBy: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoardItem {
  id: string;
  url: string;
  kind: string;
  generationId: string | null;
  characterId: string | null;
  note: string | null;
  sortKey: string;
  width: number | null;
  height: number | null;
  createdBy: string;
  createdAt: number;
}

/** The server resolves the literal id "inbox" to the caller's own Inbox. */
export const INBOX = "inbox";

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listBoards(): Promise<BoardListEntry[] | null> {
  const body = await apiFetch<{ boards: BoardListEntry[] }>("/api/v1/boards");
  return body?.boards ?? null;
}

export async function getBoard(id: string): Promise<BoardDetail | null> {
  const body = await apiFetch<{ board: BoardDetail }>(`/api/v1/boards/${encodeURIComponent(id)}`);
  return body?.board ?? null;
}

export async function listItems(id: string): Promise<BoardItem[] | null> {
  const body = await apiFetch<{ items: BoardItem[] }>(
    `/api/v1/boards/${encodeURIComponent(id)}/items`,
  );
  return body?.items ?? null;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function createBoard(name: string, description?: string): Promise<BoardDetail | null> {
  const body = await apiFetch<{ board: BoardDetail }>("/api/v1/boards", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  return body?.board ?? null;
}

export async function renameBoard(id: string, name: string): Promise<BoardDetail | null> {
  const body = await apiFetch<{ board: BoardDetail }>(`/api/v1/boards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return body?.board ?? null;
}

export async function deleteBoard(id: string): Promise<boolean> {
  const body = await apiFetch<{ ok: boolean }>(`/api/v1/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return body?.ok === true;
}

/**
 * Add an image to a board. Re-adding the same URL is a server-side no-op, so
 * this is safe to call optimistically (e.g. on every generation).
 */
export async function addItem(
  boardId: string,
  url: string,
  extra: { kind?: string; generationId?: string; width?: number; height?: number } = {},
): Promise<BoardItem | null> {
  const body = await apiFetch<{ item: BoardItem }>(
    `/api/v1/boards/${encodeURIComponent(boardId)}/items`,
    { method: "POST", body: JSON.stringify({ url, ...extra }) },
  );
  return body?.item ?? null;
}

export async function removeItem(boardId: string, itemId: string): Promise<boolean> {
  const body = await apiFetch<{ ok: boolean }>(
    `/api/v1/boards/${encodeURIComponent(boardId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
  return body?.ok === true;
}

/** Move an item to a different board: add there, then remove here. */
export async function moveItem(
  fromBoardId: string,
  itemId: string,
  toBoardId: string,
  url: string,
): Promise<boolean> {
  const added = await addItem(toBoardId, url, { kind: "generation" });
  if (!added) return false;
  return removeItem(fromBoardId, itemId);
}
