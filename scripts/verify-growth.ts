/**
 * Contract checks for the homepage / onboarding conversion slice.
 *
 * These are the invariants the UI is not allowed to drift on: Start-here skill
 * ids, first-win cost targeting, pack credit copy, and hero strings.
 *
 * Run: node scripts/run-verify-growth.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  HERO_HEADLINE,
  HERO_PRIMARY_CTA,
  HERO_SECONDARY_CTA,
  HERO_SUBHEAD,
  CREDITS_TESTING_NOTE,
  firstWinMessage,
  heroProofLine,
  packCreditHint,
} from "../src/lib/growth/copy";
import { START_HERE_SKILL_IDS, resolveStartHereSkills } from "../src/lib/growth/start-here";
import {
  FIRST_WIN_FALLBACK_ID,
  FIRST_WIN_PREFERRED_ID,
  resolveFirstWinSkillId,
  shouldShowFirstWinNudge,
  threadHasGeneration,
} from "../src/lib/growth/first-win";
import { creditCostForSkill, SIGNUP_GRANT_CREDITS } from "../src/lib/credits/costs";

let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

check("Start-here ids are sticker, couple, pet, festival in that order", () => {
  assert.deepEqual([...START_HERE_SKILL_IDS], ["stickers", "couple", "pet", "festival"]);
});

check("resolveStartHereSkills keeps order and drops missing ids", () => {
  const catalog = [
    { id: "festival", name: "Festival Pack" },
    { id: "normal", name: "Doodle Avatar" },
    { id: "stickers", name: "Sticker Pack" },
    { id: "pet", name: "Pet Portrait" },
    { id: "couple", name: "Couple Doodle" },
  ];
  assert.deepEqual(
    resolveStartHereSkills(catalog).map((s) => s.id),
    ["stickers", "couple", "pet", "festival"],
  );
  assert.deepEqual(
    resolveStartHereSkills([{ id: "stickers" }, { id: "pet" }]).map((s) => s.id),
    ["stickers", "pet"],
  );
});

check("Sticker Pack is 1 credit so first-win prefers it", () => {
  assert.equal(creditCostForSkill("stickers"), 1);
  assert.equal(resolveFirstWinSkillId(creditCostForSkill), FIRST_WIN_PREFERRED_ID);
});

check("first-win falls back to Doodle Avatar when stickers is not 1 credit", () => {
  assert.equal(resolveFirstWinSkillId(() => 6), FIRST_WIN_FALLBACK_ID);
  assert.equal(resolveFirstWinSkillId(() => {
    throw new Error("unpriced");
  }), FIRST_WIN_FALLBACK_ID);
});

check("nudge only for signed-in zero-generation users who have not dismissed", () => {
  assert.equal(shouldShowFirstWinNudge({ signedIn: true, hasGeneration: false, dismissed: false }), true);
  assert.equal(shouldShowFirstWinNudge({ signedIn: false, hasGeneration: false, dismissed: false }), false);
  assert.equal(shouldShowFirstWinNudge({ signedIn: true, hasGeneration: true, dismissed: false }), false);
  assert.equal(shouldShowFirstWinNudge({ signedIn: true, hasGeneration: false, dismissed: true }), false);
});

check("a thread thumbnail is treated as a successful generation", () => {
  assert.equal(threadHasGeneration([]), false);
  assert.equal(threadHasGeneration([{ thumbnailUrl: null }, {}]), false);
  assert.equal(threadHasGeneration([{ thumbnailUrl: "https://cdn.example/x.png" }]), true);
});

check("pack credit hint is silent for single-image skills", () => {
  assert.equal(packCreditHint("Sticker Pack", 1, 1), null);
  assert.equal(
    packCreditHint("Festival Pack", 6, 6),
    "Festival Pack uses 6 credits · 6 images",
  );
});

check("hero copy states photo-to-doodle without video or paid-plan claims", () => {
  assert.equal(HERO_HEADLINE, "Turn your photo into a hand-drawn doodle");
  assert.match(HERO_SUBHEAD, /Stickers, couple portraits, pet doodles, and festival packs/);
  assert.doesNotMatch(HERO_HEADLINE + HERO_SUBHEAD, /video|paid plan|commercial rights/i);
  assert.equal(
    heroProofLine(SIGNUP_GRANT_CREDITS),
    `${SIGNUP_GRANT_CREDITS} free credits on signup · no card · results stay private`,
  );
  assert.equal(SIGNUP_GRANT_CREDITS, 10);
  assert.equal(HERO_PRIMARY_CTA, "Upload a photo");
  assert.equal(HERO_SECONDARY_CTA, "Browse skills");
  assert.match(CREDITS_TESTING_NOTE, /Credit packs are coming/);
  assert.match(firstWinMessage("Sticker Pack", 1), /1-credit first doodle/);
});

check("public pages do not hardcode a 5-credit signup grant", () => {
  const roots = ["src/content", "src/pages", "src/layouts", "src/components", "README.md"];
  const stale = /5 signup credits|5-credit signup grant|5 free credits on signup/;
  const hits: string[] = [];
  const walk = (target: string): void => {
    const st = statSync(target);
    if (st.isDirectory()) {
      for (const name of readdirSync(target)) walk(join(target, name));
      return;
    }
    if (!/\.(md|ts|astro|txt)$/.test(target)) return;
    const text = readFileSync(target, "utf8");
    if (stale.test(text)) hits.push(target);
  };
  for (const root of roots) walk(root);
  assert.deepEqual(hits, [], `stale 5-credit signup copy in ${hits.join(", ")}`);
});

if (failed) {
  console.log(`\n${failed} growth check(s) failed.`);
  process.exit(1);
}
console.log("\nall growth checks passed");
