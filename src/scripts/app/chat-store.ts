/* Client-side chat thread storage (localStorage only — same trust model as
   the PicX API key and the moodboard). Each thread's full message array is
   sent to /api/chat on every turn; the server stays stateless. */

const THREAD_INDEX_KEY = "doodleai-chats";
const THREAD_KEY_PREFIX = "doodleai-chat-";
const USER_ID_KEY = "doodleai-user-id";
const TITLE_MAX_LEN = 48;

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
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getUserId(): string {
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

function loadIndex(): ThreadSummary[] {
  try {
    const raw = localStorage.getItem(THREAD_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIndex(index: ThreadSummary[]): void {
  try {
    localStorage.setItem(THREAD_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* storage unavailable (private mode, quota) — thread list stays session-only */
  }
}

export function listThreads(): ThreadSummary[] {
  return loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadThread(id: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(THREAD_KEY_PREFIX + id);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveThread(id: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(THREAD_KEY_PREFIX + id, JSON.stringify(messages));
  } catch {
    /* storage unavailable — this turn's message stays in-memory only */
  }
}

export function createThread(): string {
  const id = newId();
  const index = loadIndex();
  index.push({ id, title: "New chat", updatedAt: Date.now() });
  saveIndex(index);
  saveThread(id, []);
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
  if (entry) {
    entry.updatedAt = now;
    if (entry.title === "New chat" && message.role === "user") {
      entry.title = message.content.trim().slice(0, TITLE_MAX_LEN) || "New chat";
    }
  } else {
    index.push({
      id,
      title: message.role === "user" ? message.content.trim().slice(0, TITLE_MAX_LEN) || "New chat" : "New chat",
      updatedAt: now,
    });
  }
  saveIndex(index);

  return messages;
}

export function getThreadSkill(id: string): string | undefined {
  return loadIndex().find((t) => t.id === id)?.skillId;
}

export function setThreadSkill(id: string, skillId: string): void {
  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  if (entry) {
    entry.skillId = skillId;
    saveIndex(index);
  }
}

export function clearThreadSkill(id: string): void {
  const index = loadIndex();
  const entry = index.find((t) => t.id === id);
  if (entry) {
    delete entry.skillId;
    saveIndex(index);
  }
}

export function deleteThread(id: string): void {
  saveIndex(loadIndex().filter((t) => t.id !== id));
  try {
    localStorage.removeItem(THREAD_KEY_PREFIX + id);
  } catch {
    /* no-op */
  }
}
