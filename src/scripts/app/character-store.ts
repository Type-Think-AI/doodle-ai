/* Shared character storage (localStorage only — nothing server-side, same
   trust model as moodboard.ts / chat-store.ts). A character is a named,
   reusable reference photo — v1 is one photo per character. */

const CHARACTERS_KEY = "doodleai-characters";

export interface Character {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: number;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function listCharacters(): Character[] {
  try {
    const raw = localStorage.getItem(CHARACTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Character =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.imageUrl === "string" &&
          typeof item.createdAt === "number",
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function saveCharacters(items: Character[]): void {
  try {
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable (private mode, quota) — character list stays session-only */
  }
}

export function getCharacter(id: string): Character | undefined {
  return listCharacters().find((c) => c.id === id);
}

export function createCharacter(name: string, imageUrl: string): Character {
  const character: Character = { id: newId(), name: name.trim() || "Unnamed", imageUrl, createdAt: Date.now() };
  saveCharacters([character, ...listCharacters()]);
  return character;
}

export function renameCharacter(id: string, name: string): void {
  const items = listCharacters();
  const entry = items.find((c) => c.id === id);
  if (entry) {
    entry.name = name.trim() || entry.name;
    saveCharacters(items);
  }
}

export function deleteCharacter(id: string): void {
  saveCharacters(listCharacters().filter((c) => c.id !== id));
}
