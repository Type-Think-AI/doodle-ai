/* After Google sign-in, nudge a zero-generation user toward a 1-credit first win. */

import { getSession } from "./auth-client";
import { whenSynced } from "./api-client";
import { listThreads } from "./chat-store";
import { getSkill } from "../../lib/skills";
import { creditCostForSkill } from "../../lib/credits/costs";
import { firstWinMessage } from "../../lib/growth/copy";
import {
  FIRST_WIN_DISMISS_KEY,
  resolveFirstWinSkillId,
  shouldShowFirstWinNudge,
  threadHasGeneration,
} from "../../lib/growth/first-win";

function readFlag(key: string): boolean {
  try {
    return Boolean(localStorage.getItem(key));
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode — dismiss lasts for this page only */
  }
}

function openPhotoPicker(): void {
  const prefix = document.querySelector<HTMLElement>(".composer")?.dataset.id ?? "home";
  document.getElementById(`${prefix}PlusBtn`)?.click();
  requestAnimationFrame(() => document.getElementById(`${prefix}AttachBtn`)?.focus());
}

function pinSkill(skillId: string): void {
  const tile = document.querySelector<HTMLElement>(`[data-skill-id="${skillId}"]`);
  if (tile) {
    tile.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    return;
  }
  const url = new URL("/", window.location.origin);
  url.searchParams.set("skill", skillId);
  window.location.href = url.href;
}

async function initFirstWinNudge(): Promise<void> {
  const root = document.getElementById("firstWinNudge");
  if (!root) return;
  const copy = document.getElementById("firstWinNudgeCopy");
  const go = document.getElementById("firstWinNudgeGo");
  const dismiss = document.getElementById("firstWinNudgeDismiss");

  await whenSynced();
  const user = await getSession();
  const skillId = resolveFirstWinSkillId(creditCostForSkill);
  const skill = getSkill(skillId);
  const credits = skill ? creditCostForSkill(skill.id) : 1;
  const show = shouldShowFirstWinNudge({
    signedIn: Boolean(user),
    hasGeneration: threadHasGeneration(listThreads()),
    dismissed: readFlag(FIRST_WIN_DISMISS_KEY),
  });

  if (!show || !skill) {
    root.hidden = true;
    return;
  }

  if (copy) copy.textContent = firstWinMessage(skill.name, credits);
  if (go) go.textContent = `Start with ${skill.name}`;
  root.hidden = false;

  go?.addEventListener("click", () => {
    pinSkill(skillId);
    openPhotoPicker();
  });
  dismiss?.addEventListener("click", () => {
    writeFlag(FIRST_WIN_DISMISS_KEY);
    root.hidden = true;
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initFirstWinNudge());
} else {
  void initFirstWinNudge();
}
