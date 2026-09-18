/* Show pack credit cost next to the composer when a multi-image skill is pinned. */

import { SKILLS } from "../../lib/skills";
import { creditCostForSkill, imageCountForSkill } from "../../lib/credits/costs";
import { packCreditHint } from "../../lib/growth/copy";

function hintForLabel(label: string): string | null {
  const name = label.trim();
  if (!name) return null;
  const skill = SKILLS.find((entry) => entry.name === name);
  if (!skill || skill.kind === "video") return null;
  try {
    return packCreditHint(skill.name, imageCountForSkill(skill.id), creditCostForSkill(skill.id));
  } catch {
    return null;
  }
}

function paint(root: HTMLElement): void {
  const prefix = root.dataset.id;
  if (!prefix) return;
  const chip = document.getElementById(`${prefix}SkillChip`);
  const label = document.getElementById(`${prefix}SkillChipLabel`);
  const hint = document.getElementById(`${prefix}CreditHint`);
  if (!chip || !label || !hint) return;
  const text = chip.hidden ? null : hintForLabel(label.textContent ?? "");
  hint.textContent = text ?? "";
  hint.hidden = !text;
}

function initComposerCreditHints(): void {
  document.querySelectorAll<HTMLElement>(".composer").forEach((root) => {
    const prefix = root.dataset.id;
    if (!prefix) return;
    const chip = document.getElementById(`${prefix}SkillChip`);
    const label = document.getElementById(`${prefix}SkillChipLabel`);
    if (!chip) return;
    paint(root);
    const observer = new MutationObserver(() => paint(root));
    observer.observe(chip, { attributes: true, attributeFilter: ["hidden"] });
    if (label) observer.observe(label, { childList: true, characterData: true, subtree: true });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initComposerCreditHints);
} else {
  initComposerCreditHints();
}
