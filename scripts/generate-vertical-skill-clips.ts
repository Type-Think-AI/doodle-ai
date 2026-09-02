/* Render one REAL 9:16 vertical clip for each of the four vertical genre video
 * skills, so they stop showing the synthetic SVG placeholder.
 *
 * WHY THESE FOUR AND WHY A NEW SCRIPT.
 * ─────────────────────────────────────────────────────────────────────────────
 * voyage / stealth / creature / gadget are the only `kind: video` skills with no
 * clip of their own on file. scripts/extract-clip-first-frames.ts can turn a
 * clip into a cover for free, but it refuses to borrow another skill's clip, so
 * these four are stuck on the placeholder until a clip they actually produced
 * exists. This script produces it.
 *
 * They could not ride along in scripts/generate-showcase-clips.ts because that
 * script never sends `aspect_ratio` — every clip it made is square or landscape,
 * which is precisely wrong here. A vertical genre clip that comes back 16:9 is
 * useless as a 9:16 cover, and the whole reason these four skills use reference
 * mode is that H3 Max IGNORES aspect_ratio in image mode (see the block comment
 * on VIDEO_SKILLS in src/lib/video/skills.ts).
 *
 * PROMPT PROVENANCE — the reason these covers will be honest.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each prompt is COMPOSED from the two runtime sources, imported not retyped:
 *   familyHint = resolveFamilyHint(<family>, "video")   src/lib/art-families.ts
 *   builder    = videoPromptBuilderFor(<skill>)         src/lib/video/prompts.ts
 * That is byte-for-byte what the product sends when a user runs the skill with
 * that family chip and no theme, so the clip really is this skill's own output
 * and its first frame really is this skill's cover.
 *
 * NO FRANCHISE NOUNS. The look comes from each family's craft signature (line
 * weight, palette discipline, shading, silhouette rules). No series, studio,
 * character or artist name appears here or in any file this imports. Grep before
 * running.
 *
 * DEVIATION FROM THE SKILL DEFAULT, stated plainly: these skills default to
 * MAX_VIDEO_SECONDS (15s) but this renders 5s. A 5s clip is the same builder,
 * the same family and the same 9:16 frame — enough to harvest a truthful first
 * frame and to loop on a tile — at a third of the cost (150 vs 450 credits).
 *
 * SPEND GUARDS (money is real):
 *   --dry-run   spends NOTHING; prints the exact payloads and exits.
 *   idempotent  a skill whose clip already verifies is never re-rendered.
 *   money cap   more than MAX_SUBMITS actually submitted is refused without
 *               --force.
 *
 * VERIFICATION: every URL is checked with a real GET — 200, video/mp4,
 * non-trivial bytes. A URL that fails is NOT written to the JSON.
 *
 * RUN:
 *   node --experimental-strip-types scripts/generate-vertical-skill-clips.ts --dry-run
 *   node --experimental-strip-types scripts/generate-vertical-skill-clips.ts
 *
 * Then cut the covers (free):
 *   node --experimental-strip-types scripts/extract-clip-first-frames.ts --write
 *
 * Reads PICX_API_KEY from env or .dev.vars. Never prints it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveFamilyHint } from "../src/lib/art-families.ts";
import { videoPromptBuilderFor } from "../src/lib/video/prompts.ts";

const API = "https://api.picxstudio.com/v1";
const VIDEO_MODEL = "minimax/h3-max";
/* 480p is the only tier the PUBLIC /v1 schema exposes that H3 Max also prices —
   its native 768P is unreachable through the public resolution enum. */
const RESOLUTION = "480p";
/**
 * 15s, matching MAX_VIDEO_SECONDS and each of these four skills' own
 * defaultSeconds — NOT an arbitrary choice, and NOT reducible for free.
 *
 * The prompt builders in src/lib/video/prompts.ts hardcode a three-beat
 * structure in words: "about fifteen seconds in three beats: roughly 0-4s
 * establish, roughly 4-10s the main action at full energy, roughly 10-15s settle
 * onto one strong final pose and HOLD it". Submitting 5s against that text asks
 * the model to compress three timed beats into a third of the runtime, and the
 * most likely casualty is the settle-and-hold — which is the single frame a
 * cover most wants. So the duration and the prompt have to agree.
 *
 * --seconds overrides this, and warns, because a mismatch is a quality bug
 * rather than a saving.
 */
const DEFAULT_SECONDS = 15;
const SOUND = true;
const ASPECT_RATIO = "9:16";
const MIN_VIDEO_BYTES = 40_000;
const POLL_INTERVAL_MS = 4_000;
const POLL_MAX_MS = 8 * 60_000;
const MAX_SUBMITS = 4;

const OUT_PATH = new URL("../src/data/showcase-clips.json", import.meta.url);

const argv = process.argv.slice(2);
const args = new Set(argv);
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");

const secondsArg = argv.indexOf("--seconds");
const SECONDS = secondsArg >= 0 ? Number(argv[secondsArg + 1]) : DEFAULT_SECONDS;
if (!Number.isFinite(SECONDS) || SECONDS < 5 || SECONDS > 15) {
  throw new Error(`--seconds must be between 5 and 15 (got ${argv[secondsArg + 1]})`);
}
if (SECONDS !== DEFAULT_SECONDS) {
  console.warn(
    `WARNING: rendering ${SECONDS}s against a prompt whose beat structure is written for ` +
      `${DEFAULT_SECONDS}s. The final settle-and-hold beat is the likely casualty, and that is ` +
      `the frame the cover is cut from.\n`,
  );
}

/** Credits per second of video, from the provider's standard rate. */
const CREDITS_PER_SECOND = 30;

const key =
  process.env.PICX_API_KEY?.trim() ||
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="))
    ?.slice("PICX_API_KEY=".length)
    .trim();
if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");
const authHeaders = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* The one already-paid-for doodle every clip references — doodle-avatar's
   verified thumbnailUrl, the canonical default doodle. Reference mode means this
   fixes WHO the character is; the composition is built fresh and vertical. Zero
   image spend. */
const REFERENCE_DOODLE =
  "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png";

interface VerticalSpec {
  /** Showcase entry id. */
  id: string;
  /** The VIDEO skill id. SkillCard matches on this exactly, so it must be the
      skill's own id or the clip never reaches its tile. */
  skillId: "voyage" | "stealth" | "creature" | "gadget";
  title: string;
  caption: string;
  /** Art-family id in src/lib/art-families.ts. */
  familyId: string;
}

const SPECS: VerticalSpec[] = [
  {
    id: "vertical-voyage",
    skillId: "voyage",
    title: "Your doodle sets sail",
    caption: "A tall adventure shot on the open sea, made for a phone screen.",
    familyId: "pirate-voyage",
  },
  {
    id: "vertical-stealth",
    skillId: "stealth",
    title: "Your doodle gathers their focus",
    caption: "A quiet hands-together beat, then one glowing burst.",
    familyId: "ninja-village",
  },
  {
    id: "vertical-creature",
    skillId: "creature",
    title: "Your doodle and a little creature",
    caption: "An invented companion pops in, bounces once, and lands beside them.",
    familyId: "monster-tamer",
  },
  {
    id: "vertical-gadget",
    skillId: "gadget",
    title: "Your doodle's gadget misfires",
    caption: "A proud reveal, a harmless pop of smoke, one flat-mouthed reaction.",
    familyId: "gag-comic",
  },
];

interface ClipEntry {
  id: string;
  title: string;
  caption: string;
  skillId: string;
  mode: "image" | "reference";
  seconds: number;
  resolution: string;
  aspectRatio?: string;
  sourceImageUrl: string;
  cdnUrl: string;
  picxGenerationId: string;
  renderSeconds: number | null;
  createdAt: string;
  creditsSpent: number;
}

interface ShowcaseFile {
  generatedAt: string;
  model: string;
  clips: ClipEntry[];
}

async function verifyVideo(url: string): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, status: 0, contentType: "", bytes: 0 };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const buf = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0);
  const bytes = buf.byteLength;
  return {
    ok: res.ok && contentType.includes("video/mp4") && bytes >= MIN_VIDEO_BYTES,
    status: res.status,
    contentType,
    bytes,
  };
}

async function submit(prompt: string): Promise<string> {
  const payload = {
    prompt,
    model: VIDEO_MODEL,
    mode: "reference",
    duration: SECONDS,
    resolution: RESOLUTION,
    sound: SOUND,
    aspect_ratio: ASPECT_RATIO,
    reference_urls: [REFERENCE_DOODLE],
  };
  const res = await fetch(`${API}/videos/generate`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    detail?: string;
    message?: string;
  };
  if (res.status !== 202 || !data.id) {
    throw new Error(`submit ${res.status}: ${data.detail || data.message || "no id"}`);
  }
  return data.id;
}

interface PollResult {
  status: string;
  outputUrl: string | null;
  createdAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

/**
 * Poll until terminal. This script has no webhook to receive a delivery on, so
 * polling is the correct offline answer — the product stays webhook-only for the
 * opposite and equally correct reason (a Worker isolate must not block for a
 * render). Do not "fix" either to match the other.
 */
async function poll(id: string): Promise<PollResult> {
  const start = Date.now();
  for (;;) {
    let res: Response;
    try {
      res = await fetch(`${API}/generations/${id}`, { headers: authHeaders });
    } catch (err) {
      if (Date.now() - start > POLL_MAX_MS) {
        // Keep the original network error as `cause` — the timeout is the
        // symptom, and without it the actual fetch failure is unrecoverable.
        throw new Error(`poll timed out (network): ${(err as Error).message}`, { cause: err });
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const d = (raw.data ?? raw) as Record<string, unknown>;
    const status = String(d.status ?? "unknown");
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return {
        status,
        outputUrl: (d.output_url as string) ?? null,
        createdAt: (d.created_at as string) ?? null,
        completedAt: (d.completed_at as string) ?? null,
        errorMessage: (d.error_message as string) ?? null,
      };
    }
    if (Date.now() - start > POLL_MAX_MS) {
      throw new Error(`poll timed out after ${Math.round((Date.now() - start) / 1000)}s (last status: ${status})`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function loadExisting(): ShowcaseFile {
  if (existsSync(OUT_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(OUT_PATH, "utf8")) as ShowcaseFile;
      if (Array.isArray(parsed.clips)) return parsed;
    } catch {
      /* fall through */
    }
  }
  return { generatedAt: new Date().toISOString(), model: VIDEO_MODEL, clips: [] };
}

function renderSecondsFrom(createdAt: string | null, completedAt: string | null): number | null {
  if (!createdAt || !completedAt) return null;
  const a = Date.parse(createdAt);
  const b = Date.parse(completedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(((b - a) / 1000) * 10) / 10;
}

async function main() {
  const file = loadExisting();

  /* Compose every prompt from the runtime sources first, so a broken family id
     or missing builder fails BEFORE any money moves. */
  const planned = SPECS.map((spec) => {
    const familyHint = resolveFamilyHint(spec.familyId, "video");
    if (!familyHint) {
      throw new Error(`family "${spec.familyId}" resolved to an empty video styleHint — check src/lib/art-families.ts`);
    }
    const prompt = videoPromptBuilderFor(spec.skillId)({ themeHint: "", styleHint: "", familyHint });
    return { spec, prompt };
  });

  console.log(`Reference doodle: ${REFERENCE_DOODLE}`);
  const refOk = (await fetch(REFERENCE_DOODLE)).ok;
  console.log(`  reachable: ${refOk ? "yes" : "NO — refusing to spend"}\n`);
  if (!refOk) process.exit(1);

  /* Idempotency: a skill whose existing clip still verifies is skipped, so a
     re-run after a partial failure costs only the missing ones. */
  const todo: typeof planned = [];
  for (const item of planned) {
    const existing = file.clips.find((c) => c.skillId === item.spec.skillId && c.cdnUrl);
    if (existing && !FORCE) {
      const v = await verifyVideo(existing.cdnUrl);
      if (v.ok) {
        console.log(`${item.spec.skillId}: already has a verified clip — skipped`);
        continue;
      }
      console.log(`${item.spec.skillId}: existing clip failed verification (HTTP ${v.status}) — will re-render`);
    }
    todo.push(item);
  }

  if (todo.length === 0) {
    console.log("\nNothing to render.");
    return;
  }

  console.log(`\n${todo.length} clip(s) to render at ${SECONDS}s ${RESOLUTION} ${ASPECT_RATIO}.`);
  console.log(`Estimated spend: ${todo.length * SECONDS * CREDITS_PER_SECOND} credits (${CREDITS_PER_SECOND}/second).\n`);

  if (todo.length > MAX_SUBMITS && !FORCE) {
    console.error(`Refusing to submit ${todo.length} clips (cap ${MAX_SUBMITS}). Pass --force if this is intended.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    for (const { spec, prompt } of todo) {
      console.log(`── ${spec.skillId} (${spec.familyId})`);
      console.log(`${prompt}\n`);
    }
    console.log("Dry run — nothing submitted, no credits spent.");
    return;
  }

  const results: ClipEntry[] = [];
  const failures: { skillId: string; reason: string }[] = [];

  /* Serial, not Promise.all: each submit is a real charge, and a serial loop
     means a mid-run failure stops the spend instead of firing all four. */
  for (const { spec, prompt } of todo) {
    console.log(`── ${spec.skillId}`);
    try {
      const generationId = await submit(prompt);
      console.log(`   submitted: ${generationId}`);
      const outcome = await poll(generationId);
      if (outcome.status !== "completed" || !outcome.outputUrl) {
        throw new Error(`${outcome.status}: ${outcome.errorMessage ?? "no output_url"}`);
      }
      const v = await verifyVideo(outcome.outputUrl);
      console.log(`   ${outcome.outputUrl}`);
      console.log(`   verified: HTTP ${v.status} ${v.contentType} ${v.bytes}B ${v.ok ? "OK" : "*** INVALID ***"}`);
      if (!v.ok) throw new Error(`clip did not verify (HTTP ${v.status} ${v.contentType} ${v.bytes}B)`);

      results.push({
        id: spec.id,
        title: spec.title,
        caption: spec.caption,
        skillId: spec.skillId,
        mode: "reference",
        seconds: SECONDS,
        resolution: RESOLUTION,
        aspectRatio: ASPECT_RATIO,
        sourceImageUrl: REFERENCE_DOODLE,
        cdnUrl: outcome.outputUrl,
        picxGenerationId: generationId,
        renderSeconds: renderSecondsFrom(outcome.createdAt, outcome.completedAt),
        createdAt: outcome.createdAt ?? new Date().toISOString(),
        creditsSpent: SECONDS * CREDITS_PER_SECOND,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`   FAILED — ${reason}`);
      failures.push({ skillId: spec.skillId, reason });
    }
  }

  if (results.length > 0) {
    /* Replace any prior entry for the same skill, keep everything else. */
    const kept = file.clips.filter((c) => !results.some((r) => r.skillId === c.skillId && r.id === c.id));
    const merged = [...kept, ...results];
    writeFileSync(
      OUT_PATH,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), model: VIDEO_MODEL, clips: merged }, null, 2)}\n`,
    );
    console.log(`\nwrote src/data/showcase-clips.json (${merged.length} clips, ${results.length} new)`);
    console.log(`spent: ${results.length * SECONDS * CREDITS_PER_SECOND} credits`);
    console.log("\nNext (free): node --experimental-strip-types scripts/extract-clip-first-frames.ts --write");
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failed: ${failures.map((f) => `${f.skillId} (${f.reason})`).join("; ")}`);
    process.exit(1);
  }
}

await main();
