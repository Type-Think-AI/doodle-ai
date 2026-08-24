/* Shared character storage — a character is a named, reusable reference
   photo; v1 is one photo per character.

   Same two-mode arrangement as chat-store.ts and moodboard.ts: localStorage
   alone when signed out, a per-user localStorage mirror of /api/v1/characters
   when signed in. See api-client.ts for why the reads stay synchronous. */

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

function isCharacter(item: unknown): item is Character {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as Character).id === "string" &&
    typeof (item as Character).name === "string" &&
    typeof (item as Character).imageUrl === "string" &&
    typeof (item as Character).createdAt === "number"
  );
}

function readCharacters(key: string): Character[] {
  const parsed = readJsonLocal<unknown>(key, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isCharacter).sort((a, b) => b.createdAt - a.createdAt);
}

export function listCharacters(): Character[] {
  return readCharacters(scopedKey(CHARACTERS_KEY));
}

function saveCharacters(items: Character[]): void {
  writeJsonLocal(scopedKey(CHARACTERS_KEY), items);
}

export function getCharacter(id: string): Character | undefined {
  return listCharacters().find((c) => c.id === id);
}

export function createCharacter(name: string, imageUrl: string): Character {
  const character: Character = { id: newId(), name: name.trim() || "Unnamed", imageUrl, createdAt: Date.now() };
  saveCharacters([character, ...listCharacters()]);

  if (isSignedIn()) {
    // The client's id goes to the server so the optimistic row and the stored
    // row are the same row — a later rename or delete addresses it by id.
    enqueue(() => apiFetch("/api/v1/characters", { method: "POST", body: JSON.stringify(character) }));
  }
  return character;
}

export function renameCharacter(id: string, name: string): void {
  const items = listCharacters();
  const entry = items.find((c) => c.id === id);
  if (entry) {
    entry.name = name.trim() || entry.name;
    saveCharacters(items);
    if (isSignedIn()) {
      const renamed = entry.name;
      enqueue(() =>
        apiFetch("/api/v1/characters", { method: "PATCH", body: JSON.stringify({ id, name: renamed }) }),
      );
    }
  }
}

export function deleteCharacter(id: string): void {
  saveCharacters(listCharacters().filter((c) => c.id !== id));
  if (isSignedIn()) {
    enqueue(() => apiFetch(`/api/v1/characters?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
  }
}

registerHydrator(async () => {
  const data = await apiFetch<{ characters: Character[] }>("/api/v1/characters");
  if (data) saveCharacters(data.characters);
});

registerImportSource("characters", () => readCharacters(CHARACTERS_KEY));
