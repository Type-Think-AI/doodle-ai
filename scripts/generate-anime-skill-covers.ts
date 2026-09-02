/* One-off: real marketplace covers for the three ANIME IMAGE skills that have
 * never been through the model and still fall back to the synthetic SVG —
 * pirate-voyage (id `pirate`), ninja-village (`ninja`) and monster-tamer
 * (`tamer`). One render each fixes both problems at once: the skill is finally
 * exercised end to end, and the tile gets a cover that shows what it produces.
 *
 * This follows the two-stage pattern of scripts/generate-video-skill-covers.ts
 * and scripts/generate-skill-thumbnails.ts so the mosaic stays coherent:
 *
 *   1. Synthesize a SUBJECT photo via /v1/images/generate. Synthetic on purpose
 *      — no real person's face lands on a public marketplace card.
 *   2. Turn that subject into the skill's cover via /v1/images/edit, using the
 *      skill's OWN prompt builder from src/lib/prompts/ (buildPirateVoyage,
 *      buildNinjaVillage, buildMonsterTamer) resolved through promptBuilderFor().
 *      This is the exact string generate-doodle.ts sends, so the cover TESTS
 *      what ships rather than a paraphrase of it.
 *
 * The palette dial is left OFF: we call resolveStyle("none") — the same
 * ResolvedStyle the runtime uses when no theme chip is selected — so each cover
 * is the skill's own craft signature (rubbery tropical pirate; earth-tone ninja
 * with one glowing accent; a rounded coin-readable creature) rather than a
 * theme-tinted version of it. The genre look IS the product here.
 *
 * GENRE, NEVER FRANCHISE, NEVER A REAL FACE. Every prompt string comes from the
 * skill builders, which name only the genre and the look — no series, studio,
 * artist or character. The subject is a synthetic invented person. Grep this
 * file and the builders for proper nouns before running.
 *
 * MODEL LOCK: openai/gpt-image-2 only (docs/doodle-to-video-plan.md). This is a
 * build-time asset script under scripts/, which check-media-models.mjs does not
 * scan — but the lock still holds, so the id below is the only media model here.
 *
 * SPEND: one subject + three covers = 4 image calls via openai/gpt-image-2 at
 * ~53 credits each = ~212 credits worst case; a fully-fresh run of all three
 * skills. An idempotent re-run skips any skill whose thumbnailUrl already
 * verifies, so the steady-state cost is 0. --dry-run spends nothing.
 *
 * Run:
 *   node --experimental-strip-types scripts/generate-anime-skill-covers.ts --dry-run
 *   node --experimental-strip-types scripts/generate-anime-skill-covers.ts
 *
 * Reads PICX_API_KEY from env or .dev.vars; never prints it. On a real run it
 * verifies every generated URL is HTTP 200 with real image bytes BEFORE writing
 * thumbnailUrl into a SKILL.md — a 404 cover renders identically to the
 * placeholder and would look like the work silently failed.
 */

import { readFileSync, writeFileSync } from "node:fs";
/* Import the three skill builders DIRECTLY from their own modules rather than
 * through src/lib/prompts/index.ts. The barrel imports its siblings
 * extensionless (`./chibi-mini-me`), which Vite resolves at build time but
 * Node's ESM loader does not — importing the barrel here throws
 * ERR_MODULE_NOT_FOUND. These are the exact same functions the barrel's
 * SKILL_PROMPT_BUILDERS registers, so the cover still tests what ships. */
import { buildPirateVoyage } from "../src/lib/prompts/pirate-voyage.ts";
import { buildNinjaVillage } from "../src/lib/prompts/ninja-village.ts";
import { buildMonsterTamer } from "../src/lib/prompts/monster-tamer.ts";
import type { PromptBuilder } from "../src/lib/prompts/index.ts";

/** The three skill builders, keyed by metadata.id — mirrors the subset of
 *  SKILL_PROMPT_BUILDERS this lane owns. */
const BUILDERS: Record<string, PromptBuilder> = {
  pirate: buildPirateVoyage,
  ninja: buildNinjaVillage,
  tamer: buildMonsterTamer,
};

/* The exact hint resolveStyle("none") returns — copied here rather than
 * imported because src/lib/style-choice.ts pulls in doodle-constants via an
 * extensionless import that Vite resolves but Node's ESM loader (this script's
 * runtime) does not. This IS the no-theme-chip path the runtime takes: the
 * genre craft is the product, so the covers ship with no palette theme layered
 * on top. Keep in sync with NONE_STYLE_HINT in src/lib/style-choice.ts. */
const NONE_STYLE_HINT =
  "Do not impose a themed colour palette. Keep colour minimal and natural, led by " +
  "the linework itself, with a plain neutral background.";

const API = "https://api.picxstudio.com/v1";

/** The only image model this repo is allowed to use (docs/doodle-to-video-plan.md). */
const IMAGE_MODEL = "openai/gpt-image-2";

const DRY_RUN = process.argv.includes("--dry-run");

/** Rough per-image credit cost, for the honest spend report only. */
const CREDITS_PER_IMAGE = 53;

const key =
  process.env.PICX_API_KEY?.trim() ||
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="))
    ?.slice("PICX_API_KEY=".length)
    .trim();
if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");

const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

/** The three anime image skills this script covers. `skillId` is the builder key
 *  (metadata.id); `dir` is the SKILL.md package directory. */
const SKILLS = [
  { skillId: "pirate", dir: "pirate-voyage" },
  { skillId: "ninja", dir: "ninja-village" },
  { skillId: "tamer", dir: "monster-tamer" },
] as const;

const skillFilePath = (dir: string) => new URL(`../src/mastra/skills/${dir}/SKILL.md`, import.meta.url);

const PHOTOREAL =
  "Sharp photorealistic photograph, natural daylight, shallow depth of field, real skin texture, " +
  "shot on a 50mm lens. Not an illustration, not a cartoon, not a 3D render.";

/* A synthetic subject, distinct from the other covers' subjects on purpose so
   three genre cards do not all wear the avatar tiles' face. Invented person. */
const SUBJECT =
  `Candid photographic portrait of one cheerful young woman with shoulder-length dark-brown hair ` +
  `and a few freckles, wearing a plain rust-orange crew-neck tee, standing against a plain warm-grey ` +
  `wall, head and shoulders visible, relaxed confident smile. ${PHOTOREAL}`;

/** Build the exact instruction generate-doodle.ts would send for this skill,
 *  with no theme chip selected (resolveStyle("none")). */
function coverInstructionFor(skillId: string): string {
  const builder = BUILDERS[skillId];
  if (!builder) throw new Error(`no prompt builder registered for skill "${skillId}"`);
  // resolveStyle("none") sets both themeHint and styleHint to NONE_STYLE_HINT.
  return builder({ themeHint: NONE_STYLE_HINT, styleHint: NONE_STYLE_HINT });
}

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { url?: string; detail?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(`${path} ${res.status}: ${data.detail || data.message || "no url"}`);
  }
  return data.url;
}

/** Fetch the URL and confirm it is a real image body, not a 404 or HTML error page. */
async function verifyImage(
  url: string,
): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  const contentType = res.headers.get("content-type") || "";
  const bytes = buf.byteLength;
  const ok = res.ok && contentType.startsWith("image/") && bytes > 1024;
  return { ok, status: res.status, contentType, bytes };
}

/** Existing thumbnailUrl in a SKILL.md's frontmatter, or null. */
function existingThumbnail(md: string): string | null {
  const m = md.match(/^\s*thumbnailUrl:\s*["']?([^"'\n]+)["']?\s*$/m);
  return m ? m[1]!.trim() : null;
}

/**
 * Write thumbnailUrl (and sourceImageUrl) into the metadata block. Idempotent:
 * if a thumbnailUrl line already exists it is replaced in place; otherwise the
 * placeholder comment block is replaced, and if that is gone the lines are
 * inserted right after the `sampleIndex:` line. Only ever touches these two
 * keys — no other line in the file changes.
 */
function writeThumbnail(md: string, thumbnailUrl: string, sourceImageUrl: string): string {
  const block =
    `  thumbnailUrl: "${thumbnailUrl}"\n` +
    `  sourceImageUrl: "${sourceImageUrl}"`;

  // 1. Already present -> replace the thumbnailUrl line (+ any adjacent sourceImageUrl).
  if (/^\s*thumbnailUrl:.*$/m.test(md)) {
    let next = md.replace(/^\s*thumbnailUrl:.*$/m, `  thumbnailUrl: "${thumbnailUrl}"`);
    if (/^\s*sourceImageUrl:.*$/m.test(next)) {
      next = next.replace(/^\s*sourceImageUrl:.*$/m, `  sourceImageUrl: "${sourceImageUrl}"`);
    } else {
      next = next.replace(/^(\s*thumbnailUrl:.*)$/m, `$1\n  sourceImageUrl: "${sourceImageUrl}"`);
    }
    return next;
  }

  // 2. The placeholder comment block the three skills ship with -> replace it.
  const placeholder =
    /\s*# No real cover exists for this skill yet[\s\S]*?covers are a separate job\.\n/;
  if (placeholder.test(md)) {
    return md.replace(placeholder, `\n${block}\n`);
  }

  // 3. Fallback: insert after sampleIndex.
  if (/^\s*sampleIndex:.*$/m.test(md)) {
    return md.replace(/^(\s*sampleIndex:.*)$/m, `$1\n${block}`);
  }

  throw new Error("could not find thumbnailUrl, placeholder comment, or sampleIndex to anchor the write");
}

async function main() {
  console.log(`generate-anime-skill-covers — ${DRY_RUN ? "DRY RUN (spends nothing)" : "LIVE (spends real credits)"}`);
  console.log(`  model: ${IMAGE_MODEL}\n`);

  // Idempotency pass: skip any skill whose current thumbnailUrl already verifies.
  const plan: { skillId: string; dir: string; md: string; skip: boolean; reason?: string }[] = [];
  for (const { skillId, dir } of SKILLS) {
    const md = readFileSync(skillFilePath(dir), "utf8");
    const current = existingThumbnail(md);
    if (current) {
      const v = await verifyImage(current);
      if (v.ok) {
        console.log(`  ${dir}: already has a verified cover (HTTP ${v.status} ${v.contentType} ${v.bytes}B) — skipping`);
        plan.push({ skillId, dir, md, skip: true, reason: "verified thumbnail already present" });
        continue;
      }
      console.log(`  ${dir}: has a thumbnailUrl but it did NOT verify (HTTP ${v.status}) — will re-render`);
    }
    plan.push({ skillId, dir, md, skip: false });
  }

  const todo = plan.filter((p) => !p.skip);
  if (todo.length === 0) {
    console.log("\nAll three covers already verify. Nothing to do.");
    return;
  }

  const plannedImages = 1 + todo.length; // 1 subject + 1 cover per skill
  console.log(
    `\n${todo.length} skill(s) to render: ${todo.map((t) => t.skillId).join(", ")}. ` +
      `Planned image calls: ${plannedImages} (~${plannedImages * CREDITS_PER_IMAGE} credits).`,
  );
  if (plannedImages > 5) {
    console.log(`  NOTE: ${plannedImages} images exceeds the 5-image budget guard for this lane.`);
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: the exact instruction each skill's own builder produces ---");
    console.log(`\nSTAGE 1 subject prompt:\n${SUBJECT}\n`);
    for (const t of todo) {
      console.log(`\n=== ${t.skillId} (${t.dir}) — /images/edit instruction ===`);
      console.log(coverInstructionFor(t.skillId));
    }
    console.log("\nDry run complete. No credits spent, no files written.");
    return;
  }

  // Stage 1 — one synthetic subject shared by all three covers.
  console.log("\nStage 1 — synthesizing the subject photo...");
  const subject = await post("/images/generate", { prompt: SUBJECT, size: "1K", aspect_ratio: "1:1" });
  console.log(`  subject: ${subject}`);

  const subjectCheck = await verifyImage(subject);
  console.log(
    `  subject verify: HTTP ${subjectCheck.status} ${subjectCheck.contentType} ${subjectCheck.bytes}B ` +
      `${subjectCheck.ok ? "OK" : "*** NOT A VALID IMAGE ***"}`,
  );
  if (!subjectCheck.ok) throw new Error("subject photo failed to generate/verify — aborting before spending on covers");

  // Stage 2 — each skill's own builder, run against the subject, in parallel.
  console.log("\nStage 2 — rendering each cover through the skill's OWN prompt builder...");
  const results = await Promise.all(
    todo.map(async (t) => {
      try {
        const url = await post("/images/edit", {
          model: IMAGE_MODEL,
          instruction: coverInstructionFor(t.skillId),
          image_urls: [subject],
          size: "1K",
          aspect_ratio: "1:1",
        });
        console.log(`  ${t.skillId}: ${url}`);
        return { ...t, url };
      } catch (err) {
        console.log(`  ${t.skillId}: FAILED — ${(err as Error).message}`);
        return { ...t, url: null as string | null };
      }
    }),
  );

  // Verify every cover BEFORE writing any file.
  console.log("\nVerifying every cover is a real image (HTTP 200, image/*, >1KB)...");
  const verified: Record<string, { status: number; contentType: string; bytes: number; ok: boolean }> = {};
  for (const r of results) {
    if (!r.url) {
      console.log(`  ${r.skillId}: no url (generation failed)`);
      continue;
    }
    const v = await verifyImage(r.url);
    verified[r.skillId] = v;
    console.log(
      `  ${r.skillId}: HTTP ${v.status} ${v.contentType} ${v.bytes}B ${v.ok ? "OK" : "*** NOT A VALID IMAGE ***"}`,
    );
  }

  // Write thumbnailUrl only for the covers that verified. A failed one keeps the
  // placeholder so a re-run retries it — never a broken URL on a live card.
  console.log("\nWriting verified covers into their SKILL.md files...");
  let written = 0;
  for (const r of results) {
    if (!r.url || !verified[r.skillId]?.ok) {
      console.log(`  ${r.dir}: SKIPPED write (did not verify) — placeholder kept, re-run to retry`);
      continue;
    }
    const next = writeThumbnail(r.md, r.url, subject);
    writeFileSync(skillFilePath(r.dir), next, "utf8");
    console.log(`  ${r.dir}: wrote thumbnailUrl + sourceImageUrl`);
    written++;
  }

  const spentImages = plannedImages; // subject + every cover attempt
  console.log(
    `\n${JSON.stringify(
      {
        subject,
        covers: results.map((r) => ({ skillId: r.skillId, dir: r.dir, url: r.url })),
        verified,
        written,
        approxCreditsSpent: spentImages * CREDITS_PER_IMAGE,
      },
      null,
      2,
    )}`,
  );

  const allOk = results.every((r) => r.url && verified[r.skillId]?.ok);
  if (!allOk) {
    console.error("\nOne or more covers failed to generate or verify — their SKILL.md keeps the placeholder.");
    process.exit(1);
  }
  console.log("\nAll covers verified and written.");
}

await main();
