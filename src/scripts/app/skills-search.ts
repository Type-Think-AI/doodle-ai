/* Skills marketplace: the ONE client-side filter over the static wall.
 *
 * Search and art-style filtering live together here on purpose. They both write
 * `item.hidden`, so two independent scripts would race: typing in the search box
 * would un-hide skills the style chip had just filtered out. Wave 3 hit exactly
 * that and took search over inside src/pages/skills/index.astro, which left this
 * module orphaned; the logic is folded back here and the page imports it, so
 * there is one authority and one copy.
 *
 * Both predicates read attributes the page already renders on each tile
 * (`data-search`, `data-families`), so this module knows nothing about skills,
 * families or copy — the page stays the only place that decides what a tile is.
 */

function initSkillsFilter(): void {
  const input = document.getElementById("skillsSearch") as HTMLInputElement | null;
  const grid = document.getElementById("skillsGrid");
  const empty = document.getElementById("skillsEmpty");
  if (!grid) return;

  /* The chips are `aria-pressed` buttons rather than links or a <select>: this is
     a view filter, not navigation, and the pressed state has to be announced.
     Style choice is deliberately NOT persisted — a filter on a catalogue is a
     momentary act, and a remembered one would silently hide two thirds of the
     wall on a later visit with no explanation. The composer's family chips do
     persist, because that one is a preference rather than a filter. */
  const allChips = Array.from(document.querySelectorAll<HTMLButtonElement>(".skills-family-chip"));
  /* Two axes, not one list of alternatives: "an animation" and "chibi" are not
     competing answers — a visitor after a chibi animation needs both at once. So
     the kind chips toggle independently of the style chips. */
  const kindChips = allChips.filter((chip) => chip.dataset.kind);
  const chips = allChips.filter((chip) => !chip.dataset.kind);
  /** '' means both stills and animations. */
  let kind = "";
  const items = Array.from(grid.querySelectorAll<HTMLElement>(".skills-grid-item"));
  /** '' means every style. */
  let family = "";

  function apply(): void {
    const q = (input?.value ?? "").trim().toLowerCase();
    let visible = 0;
    items.forEach((item) => {
      const matchesSearch = !q || (item.dataset.search || "").includes(q);
      const matchesFamily = !family || (item.dataset.families || "").split(/\s+/).includes(family);
      const matchesKind = !kind || item.dataset.kind === kind;
      const show = matchesSearch && matchesFamily && matchesKind;
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (!empty) return;
    empty.hidden = visible > 0;
    if (visible > 0) return;
    /* The sentence depends on WHICH filter emptied the wall — a term, a style, or
       both — so it is composed here rather than pre-rendered. */
    const styleLabel = family ? chips.find((c) => c.dataset.familyId === family)?.textContent?.trim() : "";
    const kindLabel = kind === "video" ? "animations" : kind === "image" ? "pictures" : "";
    const what = [styleLabel, kindLabel].filter(Boolean).join(" ") || "skills";
    if (q) empty.textContent = `No ${what} match “${q}”.`;
    else if (styleLabel || kindLabel) empty.textContent = `No ${what} yet.`;
    else empty.textContent = "Nothing to show.";
  }

  input?.addEventListener("input", apply);

  kindChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      /* Pressing the pressed one clears it, so the pair needs no third "both"
         chip taking room in the row. */
      kind = chip.dataset.kind === kind ? "" : (chip.dataset.kind ?? "");
      kindChips.forEach((other) => other.setAttribute("aria-pressed", String(other.dataset.kind === kind && kind !== "")));
      apply();
    });
  });

  chips.forEach((chip, index) => {
    chip.addEventListener("click", () => {
      family = chip.dataset.familyId ?? "";
      chips.forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
      apply();
    });
    /* A horizontally scrollable row moves focus off-screen on Tab alone, so
       arrows walk it and pull the focused chip back into view. */
    chip.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = chips[(index + (event.key === "ArrowRight" ? 1 : -1) + chips.length) % chips.length];
      next?.focus();
      next?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSkillsFilter);
} else {
  initSkillsFilter();
}
