/* /characters page: grid + add-character modal (upload -> name -> save). */

import { MAX_IMAGE_BYTES } from "../../lib/doodle-constants";
import { createCharacter, deleteCharacter, listCharacters, type Character } from "./character-store";
import { whenSynced } from "./api-client";
import { setImageSrc, guardBfcacheRestore } from "./dom-utils";
import { getSession } from "./auth-client";

function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}


function initCharactersPage(): void {
  const grid = $("charsGrid");
  const addCard = $("charsAddCard");
  const fileInput = $<HTMLInputElement>("charsFileInput");
  const backdrop = $("charsModalBackdrop");
  const preview = $<HTMLImageElement>("charsModalPreview");
  const nameInput = $<HTMLInputElement>("charsNameInput");
  const statusEl = $("charsModalStatus");
  const cancelBtn = $("charsModalCancel");
  const saveBtn = $<HTMLButtonElement>("charsModalSave");
  if (!grid || !addCard) return;

  let pendingUrl: string | null = null;
  let previewObjectUrl: string | null = null;

  function render(): void {
    grid!.querySelectorAll(".chars-card").forEach((el) => el.remove());
    listCharacters().forEach((character: Character) => {
      const card = document.createElement("div");
      card.className = "chars-card";

      const img = document.createElement("img");
      img.alt = character.name;
      setImageSrc(img, character.imageUrl);
      card.appendChild(img);

      const name = document.createElement("span");
      name.className = "chars-card-name";
      name.textContent = character.name;
      card.appendChild(name);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chars-card-remove";
      removeBtn.setAttribute("aria-label", `Remove ${character.name}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        deleteCharacter(character.id);
        render();
      });
      card.appendChild(removeBtn);

      grid!.appendChild(card);
    });
  }

  function openModal(): void {
    backdrop?.classList.add("open");
    nameInput?.focus();
  }
  function closeModal(): void {
    backdrop?.classList.remove("open");
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    pendingUrl = null;
    if (nameInput) nameInput.value = "";
    if (statusEl) statusEl.textContent = "";
    if (saveBtn) saveBtn.disabled = true;
    if (fileInput) fileInput.value = "";
  }

  function syncSaveState(): void {
    if (!saveBtn) return;
    saveBtn.disabled = !pendingUrl || !nameInput?.value.trim();
  }

  async function handleFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      if (statusEl) statusEl.textContent = "That doesn't look like an image.";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      if (statusEl) statusEl.textContent = "Images must be 20 MB or smaller.";
      return;
    }
    if (!(await getSession())) {
      if (statusEl) statusEl.textContent = "Sign in to save a character.";
      window.dispatchEvent(new Event("doodleai:open-auth"));
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    if (preview) setImageSrc(preview, previewObjectUrl);
    openModal();
    if (statusEl) statusEl.textContent = "Uploading…";
    syncSaveState();

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string | { message?: string };
      };
      const errorMessage = typeof data.error === "string" ? data.error : data.error?.message;
      if (!res.ok || !data.url) throw new Error(errorMessage || "Upload failed");
      pendingUrl = data.url;
      if (statusEl) statusEl.textContent = "";
    } catch (err) {
      if (statusEl) statusEl.textContent = err instanceof Error ? err.message : "Upload failed";
    } finally {
      syncSaveState();
    }
  }

  addCard.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });
  nameInput?.addEventListener("input", syncSaveState);
  cancelBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  saveBtn?.addEventListener("click", () => {
    if (!pendingUrl || !nameInput?.value.trim()) return;
    createCharacter(nameInput.value, pendingUrl);
    closeModal();
    render();
  });

  render();
  // Characters saved on another device arrive with the sync — repaint then.
  void whenSynced().then(render);
  guardBfcacheRestore();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCharactersPage);
} else {
  initCharactersPage();
}
