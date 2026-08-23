/* Shared moodboard storage (localStorage only — nothing server-side).
   Used by the /create/[skill] result view (adds) and /moodboards (reads,
   removes). Ported unchanged from the old doodle.ts single-page app. */

const MOODBOARD_KEY = "doodlebooth_moodboard";
const MOODBOARD_LIMIT = 24;

export interface MoodboardItem {
  id: string;
  url: string;
  createdAt: number;
}

export function loadMoodboard(): MoodboardItem[] {
  try {
    const raw = localStorage.getItem(MOODBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MoodboardItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.url === "string" &&
        typeof item.createdAt === "number",
    );
  } catch {
    return [];
  }
}

function saveMoodboard(items: MoodboardItem[]): void {
  try {
    localStorage.setItem(MOODBOARD_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable (private mode, quota) — moodboard stays session-only */
  }
}

export function addToMoodboard(url: string): void {
  const items = loadMoodboard();
  items.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, createdAt: Date.now() });
  saveMoodboard(items.slice(0, MOODBOARD_LIMIT));
}

export function removeFromMoodboard(id: string): void {
  saveMoodboard(loadMoodboard().filter((item) => item.id !== id));
}
