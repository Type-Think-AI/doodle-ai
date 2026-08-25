/* Client-side chat thread storage.
 *
 * Signed out, this is exactly what it always was: localStorage, one key for
 * the thread index and one per thread's message array.
 *
 * Signed in, localStorage becomes a per-user mirror of /api/v1/threads —
 * reads still come from it synchronously (the sidebar renders from
 * `listThreads()` mid-init), writes go to it optimistically and to the server
 * through the background queue in api-client.ts. See that file's header for
 * why the indirection exists rather than making these functions async.
 *
 * Every exported signature below is unchanged from the localStorage-only
 * version. `hydrateThread` is the one addition, for pages that want a
 * thread's server-side history before their first paint. */

import {
  apiFetch,
  currentUserId,
  drained,
  enqueue,
  isSignedIn,
  readJsonLocal,
  registerHydrator,
  registerImportSource,
  scopedKey,
  whenSynced,
  writeJsonLocal,
} from "./api-client";

const THREAD_INDEX_KEY = "doodleai-chats";
const THREAD_KEY_PREFIX = "doodleai-chat-";
const USER_ID_KEY = "doodleai-user-id";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  /** A #-mentioned moodboard image, sent as an extra style/composition reference. */
  refImageUrl?: string;
  images?: string[];
  createdAt: number;
}

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
  /** A skill id pinned via "Install & run" from a skill detail page. */
  skillId?: string;
  /** The thread's first successful generation — set once, never overwritten. */
  thumbnailUrl?: string;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * The id /api/chat scopes agent memory by.
 *
 * Signed in this is the account id, so memory follows the user across
 * devices; signed out it stays the per-browser id it has always been.
 */
export function getUserId(): string {
  const accountId = currentUserId();
  if (accountId) return accountId;
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

function indexKey(): string {
  return scopedKey(THREAD_INDEX_KEY);
}

function threadKey(id: string): string {
  return scopedKey(THREAD_KEY_PREFIX + id);
}

function loadIndex(): ThreadSummary[] {
  const parsed = readJsonLocal<unknown>(indexKey(), []);
  return Array.isArray(parsed) ? (parsed as ThreadSummary[]) : [];
}

function saveIndex(index: ThreadSummary[]): void {
  writeJsonLocal(indexKey(), index);
}

export function listThreads(): ThreadSummary[] {
  return loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadThread(id: string): ChatMessage[] {
  const parsed = readJsonLocal<unknown>(threadKey(id), []);
  return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
}

function saveThread(id: string, messages: ChatMessage[]): void {
  writeJsonLocal(threadKey(id), messages);
}

export function createThread(): string {
  const id = newId();
  const index = loadIndex();
  const now = Date.now();
  index.push({ id, title: "New chat", updatedAt: now });
  saveIndex(index);
  saveThread(id, []);

  // The server is given the client's id, so the /c/<id> URL the user is about
  // to be sent to resolves on any device without a round trip first.
  if (isSignedIn()) {
    enqueue(() =>
      apiFetch("/api/v1/threads", {
        method: "POST",
        body: JSON.stringify({ id, title: "New chat", createdAt: now, updatedAt: now }),
      }),
    );
  }
  return id;
}

export function threadExists(id: string): boolean {
  return loadIndex().some((t) => t.id === id);
}

export function appendMessage(id: string, message: ChatMessage): ChatMessage[] {
  const messages = [...loadThread(id), message];
  saveThread(id, messages);

  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  const now = Date.now();
  let created = false;
  if (entry) {
    entry.updatedAt = now;
  } else {
    created = true;
    index.push({ id, title: "New chat", updatedAt: now });
  }
  saveIndex(index);

  if (isSignedIn()) {
    // The queue is serial, so a thread implied by its first message is
    // created before that message is posted to it.
    if (created) {
      enqueue(() =>
        apiFetch("/api/v1/threads", {
          method: "POST",
          body: JSON.stringify({ id, title: "New chat", createdAt: now, updatedAt: now }),
        }),
      );
    }
    // The title stays "New chat" here deliberately — it's set once, from the
    // skill's display name, when the first doodle finishes generating (see
    // setThreadThumbnail below), not from the raw prompt. A raw prompt can
    // be a pasted URL, a JSON blob, anything — not a label a non-technical
    // user should see in their chat list.
    enqueue(() =>
      apiFetch(`/api/v1/threads/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        body: JSON.stringify(message),
      }),
    );
  }

  return messages;
}

export function getThreadTitle(id: string): string {
  return loadIndex().find((t) => t.id === id)?.title || "New chat";
}

export function getThreadSkill(id: string): string | undefined {
  return loadIndex().find((t) => t.id === id)?.skillId;
}

function patchThread(id: string, patch: Record<string, unknown>): void {
  if (!isSignedIn()) return;
  enqueue(() =>
    apiFetch(`/api/v1/threads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  );
}

export function setThreadSkill(id: string, skillId: string): void {
  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  if (entry) {
    entry.skillId = skillId;
    saveIndex(index);
    patchThread(id, { skillId });
  }
}

export function clearThreadSkill(id: string): void {
  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  if (entry) {
    delete entry.skillId;
    saveIndex(index);
    patchThread(id, { skillId: null });
  }
}

/**
 * Called once, right when a thread's first doodle finishes generating —
 * sets the sidebar thumbnail and upgrades the title from "New chat" to the
 * skill's friendly name. First doodle wins: if the thread already has a
 * thumbnail, this is a no-op both locally and server-side (the PATCH handler
 * re-checks `thumbnailUrl IS NULL` itself, so this local guard is a
 * fast-path, not the actual safety net).
 */
export function setThreadThumbnail(id: string, thumbnailUrl: string, title: string): void {
  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  if (!entry || entry.thumbnailUrl) return;
  entry.thumbnailUrl = thumbnailUrl;
  entry.title = title;
  saveIndex(index);
  patchThread(id, { thumbnailUrl, title });
}

export function deleteThread(id: string): void {
  saveIndex(loadIndex().filter((t) => t.id !== id));
  try {
    localStorage.removeItem(threadKey(id));
  } catch {
    /* no-op */
  }
  if (isSignedIn()) {
    enqueue(() => apiFetch(`/api/v1/threads/${encodeURIComponent(id)}`, { method: "DELETE" }));
  }
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

interface ThreadDto {
  id: string;
  title: string;
  updatedAt: number;
  skillId?: string;
  thumbnailUrl?: string;
}

registerHydrator(async () => {
  const data = await apiFetch<{ threads: ThreadDto[] }>("/api/v1/threads");
  if (!data) return;
  saveIndex(
    data.threads.map((t) => ({
      id: t.id,
      title: t.title,
      updatedAt: t.updatedAt,
      ...(t.skillId ? { skillId: t.skillId } : {}),
      ...(t.thumbnailUrl ? { thumbnailUrl: t.thumbnailUrl } : {}),
    })),
  );
});

registerImportSource("threads", () => {
  // Deliberately reads the *unscoped* keys: the import offer is about the
  // work done on this device before signing in.
  const parsed = readJsonLocal<unknown>(THREAD_INDEX_KEY, []);
  const summaries = Array.isArray(parsed) ? (parsed as ThreadSummary[]) : [];
  return summaries.map((t) => ({
    ...t,
    messages: readJsonLocal<ChatMessage[]>(THREAD_KEY_PREFIX + t.id, []),
  }));
});

/**
 * Pull one thread's server-side history into the mirror.
 *
 * Awaited by the chat page before its first paint, which is what makes a
 * thread opened on a second device render its real history rather than an
 * empty pane. Any turn queued locally but not yet acknowledged is kept —
 * appends the server has not seen are newer than everything it returned.
 */
export async function hydrateThread(id: string): Promise<ChatMessage[]> {
  await whenSynced();
  if (!isSignedIn()) return loadThread(id);
  await drained();

  const data = await apiFetch<{ messages: ChatMessage[] }>(
    `/api/v1/threads/${encodeURIComponent(id)}/messages`,
  );
  if (!data) return loadThread(id);

  const newestRemote = data.messages.reduce((max, m) => Math.max(max, m.createdAt), 0);
  const pending = loadThread(id).filter((m) => m.createdAt > newestRemote);
  const merged = [...data.messages, ...pending];
  saveThread(id, merged);
  return merged;
}
