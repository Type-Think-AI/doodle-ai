/* Skills marketplace: client-side filter over the static grid. */

function initSkillsSearch(): void {
  const input = document.getElementById("skillsSearch") as HTMLInputElement | null;
  const grid = document.getElementById("skillsGrid");
  const empty = document.getElementById("skillsEmpty");
  const emptyTerm = document.getElementById("skillsEmptyTerm");
  if (!input || !grid) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    grid.querySelectorAll<HTMLElement>(".skills-grid-item").forEach((item) => {
      const match = !q || (item.dataset.search || "").includes(q);
      item.hidden = !match;
      if (match) visible += 1;
    });
    if (empty) empty.hidden = visible > 0 || !q;
    if (emptyTerm) emptyTerm.textContent = q;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSkillsSearch);
} else {
  initSkillsSearch();
}
