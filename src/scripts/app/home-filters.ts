/* Style filter for the homepage skill rail. Persists the family under the same
   key the prompt path reads (getArtFamilyId), so filtering to a style is also
   choosing it for the next generation. */

function initHomeFilters(): void {
  const root = document.querySelector<HTMLElement>(".home-filters");
  const items = Array.from(document.querySelectorAll<HTMLElement>(".home-skill-item"));
  const empty = document.querySelector<HTMLElement>(".home-families-empty");
  if (!root || !items.length) return;

  const key = root.dataset.familyKey ?? "doodleai-art-family";
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>(".home-chip"));
  let kind = "";
  let family = "";

  const apply = (): void => {
    let shown = 0;
    for (const item of items) {
      const families = (item.dataset.families ?? "").split(" ").filter(Boolean);
      const match = (!kind || item.dataset.kind === kind) && (!family || families.includes(family));
      item.hidden = !match;
      if (match) shown++;
    }
    if (empty) empty.hidden = shown > 0;
    for (const chip of chips) {
      const pressed = chip.dataset.filter === "all"
        ? !kind && !family
        : chip.dataset.kind
          ? chip.dataset.kind === kind
          : (chip.dataset.familyId ?? "") === family && family !== "";
      chip.setAttribute("aria-pressed", String(pressed));
    }
  };

  const persist = (): void => {
    try {
      localStorage.setItem(key, family);
    } catch {
      /* Private mode: the filter still works for this session. */
    }
    window.dispatchEvent(new CustomEvent("doodleai:art-family", { detail: { id: family } }));
  };

  for (const chip of chips) {
    chip.addEventListener("click", () => {
      if (chip.dataset.filter === "all") {
        kind = "";
        family = "";
      } else if (chip.dataset.kind) {
        kind = chip.dataset.kind === kind ? "" : chip.dataset.kind;
      } else {
        const id = chip.dataset.familyId ?? "";
        family = id === family ? "" : id;
      }
      persist();
      apply();
    });
  }

  let stored = "";
  try {
    stored = localStorage.getItem(key) ?? "";
  } catch {
    stored = "";
  }
  if (chips.some((chip) => (chip.dataset.familyId ?? "") === stored && stored !== "")) family = stored;
  apply();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHomeFilters);
} else {
  initHomeFilters();
}
