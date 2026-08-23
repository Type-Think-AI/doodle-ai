/* /moodboards page: renders the saved-locally grid, wires remove + lightbox. */

import { loadMoodboard, removeFromMoodboard, type MoodboardItem } from "./moodboard";
import { initLightbox, openLightbox } from "./lightbox";

function initMoodboardsPage(): void {
  const grid = document.getElementById("moodGrid");
  const empty = document.getElementById("moodEmpty");
  if (!grid) return;

  initLightbox();

  function render(): void {
    const items: MoodboardItem[] = loadMoodboard();
    if (empty) empty.hidden = items.length > 0;
    grid!.innerHTML = "";

    items.forEach((item) => {
      const cell = document.createElement("div");
      cell.className = "mood-cell";
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", "View full doodle");

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = "Saved doodle";
      img.loading = "lazy";
      cell.appendChild(img);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "mood-remove";
      removeBtn.setAttribute("aria-label", "Remove from moodboard");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromMoodboard(item.id);
        render();
      });
      cell.appendChild(removeBtn);

      const open = () => openLightbox(items.map((i) => i.url), item.url);
      cell.addEventListener("click", open);
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      grid!.appendChild(cell);
    });
  }

  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMoodboardsPage);
} else {
  initMoodboardsPage();
}
