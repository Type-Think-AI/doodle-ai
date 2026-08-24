/* Shared moodboard storage.
 *
 * Signed out this is localStorage only, capped at 24 items — the cap exists
 * because a moodboard shares the origin's few megabytes with the entire chat
 * history, not because 24 is a product decision. Signed in, the board lives
 * in D1 with no cap and localStorage is just the local mirror (see
 * api-client.ts). Used by the chat result view (adds) and /moodboards (reads,
 * removes). */

import {
  apiFetch,
  enqueue,
  isSignedIn,
  readJsonLocal,
  registerHydrator,
  registerImportSource,
  scopedKey,
  writeJsonLocal,
} from "./api-client";

const MOODBOARD_KEY = "doodleai_moodboard";
/** Signed-out only. Signed-in boards are server-side and unbounded. */
const MOODBOARD_LIMIT = 24;

export interface MoodboardItem {
  id: string;
  url: string;
  createdAt: number;
}

function isItem(item: unknown): item is MoodboardItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as MoodboardItem).id === "string" &&
    typeof (item as MoodboardItem).url === "string" &&
    typeof (item as MoodboardItem).createdAt === "number"
  );
}

function readItems(key: string): MoodboardItem[] {
  const parsed = readJsonLocal<unknown>(key, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isItem);
}

export function loadMoodboard(): MoodboardItem[] {
  return readItems(scopedKey(MOODBOARD_KEY));
}

function saveMoodboard(items: MoodboardItem[]): void {
  writeJsonLocal(scopedKey(MOODBOARD_KEY), items);
}

/**
 * Adds a doodle to the moodboard, ignoring URLs already saved — chat
 * re-renders a thread's whole history on every page load and auto-saves
 * each generated image, so without this a revisited thread would refill
 * the board with duplicates of its own doodles.
 */
export function addToMoodboard(url: string): void {
  const items = loadMoodboard();
  if (items.some((item) => item.url === url)) return;
  const item: MoodboardItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    createdAt: Date.now(),
  };
  items.unshift(item);
  // The 24-item trim is the signed-out storage cap; a signed-in board keeps
  // everything, so trimming it here would silently drop items the server has.
  saveMoodboard(isSignedIn() ? items : items.slice(0, MOODBOARD_LIMIT));

  if (isSignedIn()) {
    enqueue(() => apiFetch("/api/v1/moodboard", { method: "POST", body: JSON.stringify(item) }));
  }
}

export function removeFromMoodboard(id: string): void {
  saveMoodboard(loadMoodboard().filter((item) => item.id !== id));
  if (isSignedIn()) {
    enqueue(() => apiFetch(`/api/v1/moodboard?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
  }
}

registerHydrator(async () => {
  const data = await apiFetch<{ items: MoodboardItem[] }>("/api/v1/moodboard");
  if (data) saveMoodboard(data.items);
});

registerImportSource("moodboard", () => readItems(MOODBOARD_KEY));
