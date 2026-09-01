/* Generate the 3 REAL clips the /showcase surface plays — L1 of the
 * doodle-to-video wave (see docs/doodle-to-video-plan.md).
 *
 * WHY THIS SCRIPT POLLS WHILE THE PRODUCT DOES NOT.
 * ─────────────────────────────────────────────────────────────────────────────
 * The Doodle AI PRODUCT is webhook-only by owner decision: src/lib/video/submit.ts
 * submits a clip, records PicX's generation id, and lets the inbound webhook
 * (src/pages/api/webhooks/picx.ts) complete the row when PicX delivers. That is
 * correct for a Cloudflare Worker isolate, which must not block for the tens of
 * seconds a render takes. DO NOT "fix" either side to match the other.
 *
 * This file is a one-off, out-of-band ASSET script run from a developer laptop,
 * not the Worker runtime. It has no webhook to receive a delivery on, so it does
 * the legitimate thing an offline script does: submit WITHOUT a callback_url and
 * POLL GET /v1/generations/{id} until the clip is done. The picx-generation-api
 * contract explicitly blesses this ("Never treat the webhook as the only path to
 * a result … poll GET /v1/generations/{id} … as a fallback"). Adding a
 * callback_url here would be wrong — there is nothing to call back to — and
 * making the product poll would be wrong for the opposite reason. Two runtimes,
 * two correct answers.
 *
 * WHAT IT DOES.
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders 3 finished clips through the LIVE PicX API using minimax/h3-max at
 * 480p, 5s, sound on — the only tier reachable from the public schema today
 * (768p -> 422, 720p -> 400, both verified). It REUSES existing already-paid-for
 * doodle PNGs as source frames (pulled from the video skills' SKILL.md metadata)
 * so the only spend is the clips themselves: 30 credits/second => 150 per 5s
 * clip => 450 total for the default 3.
 *
 * One entry is mode "image" (the doodle itself animates) and one is mode
 * "reference" (a new shot starring the character) so the showcase demonstrates
 * the image/reference distinction that is the whole point of the two skills.
 *
 * The payload shape mirrors src/lib/video/submit.ts exactly (prompt, model, mode,
 * duration, resolution, sound, plus image_url for "image" / reference_urls for
 * "reference") — MINUS callback_url, per the note above.
 *
 * WAVE 4 — THE THREE ANIME ANIMATIONS.
 * ─────────────────────────────────────────────────────────────────────────────
 * On top of the 3 original doodle clips, this script now also renders one anime
 * animation per genre family (pirate-voyage, ninja-village, monster-tamer) — the
 * first anime animation the app has ever produced. Each is reference-mode over
 * ONE already-paid-for doodle PNG (zero image spend), and its prompt is COMPOSED
 * from the family's own styleHint (src/lib/art-families.ts) and a real video
 * builder (src/lib/video/prompts.ts), imported not retyped, so it proves the
 * exact prompt the product would send. See ANIME_FAMILY_SPECS below.
 *
 * SPEND GUARDS (money is real).
 * ─────────────────────────────────────────────────────────────────────────────
 *   --dry-run      spends NOTHING; prints exactly what it would submit and exits.
 *   idempotent     an entry whose cdnUrl already verifies (200 + video/mp4 +
 *                  non-trivial bytes) is NEVER re-rendered, so a re-run is free.
 *   money cap      more than 4 clips ACTUALLY submitted (after idempotency) is
 *                  refused without --force. The intended fresh run renders the 3
 *                  anime clips = 450 credits (the 3 originals verify and skip),
 *                  which is within the cap and needs no flag.
 *
 * VERIFICATION. Every produced URL is checked with a real request: HTTP 200,
 * Content-Type video/mp4, and a non-trivial byte count. A URL that fails is NOT
 * written to the JSON.
 *
 * RUN:
 *   node --experimental-strip-types scripts/generate-showcase-clips.ts --dry-run
 *   node --experimental-strip-types scripts/generate-showcase-clips.ts
 *   node --experimental-strip-types scripts/generate-showcase-clips.ts --limit 6
 *   node --experimental-strip-types scripts/generate-showcase-clips.ts --force
 *
 * Reads PICX_API_KEY from env or .dev.vars. Never prints it.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The anime showcase prompts are COMPOSED from the same two sources the product
// uses, imported not retyped, so this script proves what ships:
//   • the family's craft-signature styleHint  (src/lib/art-families.ts)
//   • a video prompt builder                  (src/lib/video/prompts.ts)
// resolveFamilyHint(familyId, "video") is exactly what the runtime feeds a clip
// prompt, and videoPromptBuilderFor(skillId) is the exact builder the runtime
// runs — so the animation rendered here is the animation the app would render
// for that family + skill, byte for byte in prompt terms.
import { resolveFamilyHint } from "../src/lib/art-families.ts";
import { videoPromptBuilderFor } from "../src/lib/video/prompts.ts";

const API = "https://api.picxstudio.com/v1";
const VIDEO_MODEL = "minimax/h3-max";
const RESOLUTION = "480p";
const SECONDS = 5;
const SOUND = true;
const CREDITS_PER_SECOND = 30; // PicX platform credits, 480p h3-max (plan §4)
const OUT_PATH = new URL("../src/data/showcase-clips.json", import.meta.url);

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS = 5 * 60 * 1_000; // 5 minutes
const MIN_VIDEO_BYTES = 10_000; // a real mp4 clip is far larger; guards against an error page

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
// --limit bounds how many SPECS are considered (from the top of CLIPS). It
// defaults to every spec so no clip is silently sliced off — the money guard
// that used to hang off this number now lives in main() and counts clips that
// will ACTUALLY be submitted after idempotency, which is the real spend. An
// idempotent re-run therefore submits nothing and needs no --force even though
// there are 6 specs.
const MAX_RENDER_WITHOUT_FORCE = 4;
const LIMIT = Math.max(1, Number(argValue("--limit") ?? Number.MAX_SAFE_INTEGER));

// ── Key (never printed) ──────────────────────────────────────────────────────
const key =
  process.env.PICX_API_KEY?.trim() ||
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="))
    ?.slice("PICX_API_KEY=".length)
    .trim();
if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");
const authHeaders = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// ── The 3 planned clips ──────────────────────────────────────────────────────
// Source frames are existing already-paid-for doodle PNGs pulled from the
// video skills' SKILL.md metadata (verified 200 before spend). No prompt names a
// character, series or studio (plan §2 guardrail).
interface ClipSpec {
  id: string;
  title: string;
  caption: string;
  skillId: string;
  mode: "image" | "reference";
  sourceImageUrl: string;
  prompt: string;
}

const CLIPS: ClipSpec[] = [
  {
    id: "motion-wave",
    title: "The doodle starts moving",
    caption: "Image-to-video: this exact drawing becomes frame one, then blinks, smiles and waves.",
    skillId: "motion",
    mode: "image",
    // doodle-motion sourceImageUrl — the exact drawing that animates.
    sourceImageUrl: "https://cdn.picxstudio.com/api/edited/image_68c82e2b-e269-4089-9155-728069958e04.png",
    prompt:
      "Animate this exact hand-drawn doodle character without redrawing it: keep the same marker line, " +
      "flat cheerful colours and simplified face. A small springy blink-and-smile, then a friendly wave, " +
      "with hair drifting slightly. Near-still camera, calm flat background. 2D hand-drawn look, never " +
      "photorealism, no on-screen text, no watermark, no logo.",
  },
  {
    id: "reel-street",
    title: "A brand-new shot starring the character",
    caption: "Reference-to-video: same face and colours, a scene that was never drawn.",
    skillId: "reel",
    mode: "reference",
    // doodle-motion thumbnailUrl — a clean full view, used as the character reference.
    sourceImageUrl: "https://cdn.picxstudio.com/api/edited/image_d9fb91bd-db63-4840-92ae-18814f2e8ddc.png",
    prompt:
      "Using this doodle character's face, hair, colours and outfit as the reference for who the " +
      "character is, film a new wide scene: the character walks into frame on a simple flat-colour " +
      "street, waves at the viewer, full body visible with generous empty space. One gentle continuous " +
      "camera drift. Same character, brand new shot. 2D hand-drawn look, flat cheerful fills, never " +
      "photorealism, no on-screen text, no watermark, no logo.",
  },
  {
    id: "motion-avatar-nod",
    title: "Even a plain avatar comes alive",
    caption: "Image-to-video on a simple avatar doodle: a warm nod and a soft smile.",
    skillId: "motion",
    mode: "image",
    // doodle-avatar thumbnailUrl — a third real, already-paid-for doodle.
    sourceImageUrl: "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png",
    prompt:
      "Animate this exact hand-drawn doodle avatar without redrawing it: keep the same bold outlines, " +
      "flat colours and warm-white background. A gentle nod and a warm smile, eyes blinking once, hair " +
      "drifting a touch. Near-still camera. 2D hand-drawn look, never photorealism, no on-screen text, " +
      "no watermark, no logo.",
  },
];

// ── The 3 anime-family animations (wave 4, lane 2) ───────────────────────────
// The payoff of the whole anime effort: one moving proof per genre family. No
// anime animation existed before this. Each is a REFERENCE-mode clip — the
// doodle says who the character is, the family restyles them, and the shot is
// new — so it reuses ONE already-paid-for doodle PNG (doodle-avatar's verified
// thumbnailUrl, the canonical default doodle) as the reference and spends ZERO
// image credits. Only the three clips cost anything: 150 credits each, 450 total.
//
// PROMPT COMPOSITION (imported, never retyped):
//   familyHint = resolveFamilyHint("<family>", "video")  — the family's own
//                craft-signature styleHint from src/lib/art-families.ts.
//   builder    = videoPromptBuilderFor("<video-skill>")  — the exact runtime
//                builder from src/lib/video/prompts.ts.
// themeHint/styleHint are left empty on purpose: that is the no-selection doodle
// base the builders are written for, so the FAMILY carries the look rather than
// a themed palette competing with it — the same composition the product uses
// when a family chip is chosen with no theme.
//
// skillId is the anime IMAGE skill's own id (pirate / ninja / tamer), so the
// showcase tile labels it correctly (title-cased fallback in ClipTile.astro) and
// its "Make one like this" CTA (/?skill=<id>) pins that anime skill. The three
// anime skills are image skills, so they do not carry a clip on their own /skills
// tile (SkillCard renders a clip only for kind==='video'); the moving proof lives
// on /showcase and links back to the skill. No franchise noun appears anywhere —
// the style vocabulary is the family's, which is already grep-clean.
//
// Family → builder mapping (reference-mode builders only, since the source is a
// character reference not a first frame):
//   pirate-voyage  → dash   (kinetic adventure action across frame)
//   ninja-village  → intro  (kinetic beats settling on a focused hero pose —
//                            the hands-together focus beat reads as the settle)
//   monster-tamer  → reel   (a friendly new scene of the character)
interface AnimeFamilySpec {
  id: string;
  title: string;
  caption: string;
  /** Skill id used for the tile label + CTA (the anime image skill's own id). */
  skillId: string;
  /** Art-family id in src/lib/art-families.ts. */
  familyId: string;
  /** Video prompt builder id in src/lib/video/prompts.ts (reference-mode). */
  builderSkillId: "reel" | "dash" | "intro";
}

// The one already-paid-for doodle every anime clip references. Verified 200
// before any spend by the same verifySource() gate the other clips use.
const ANIME_REFERENCE_DOODLE = "https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png";

const ANIME_FAMILY_SPECS: AnimeFamilySpec[] = [
  {
    id: "anime-pirate-voyage",
    title: "The pirate crew sets sail",
    caption: "The same doodle, reimagined mid-adventure on the open sea.",
    skillId: "pirate",
    familyId: "pirate-voyage",
    builderSkillId: "dash",
  },
  {
    id: "anime-ninja-village",
    title: "The ninja gathers their power",
    caption: "The same doodle, focused for a glowing technique.",
    skillId: "ninja",
    familyId: "ninja-village",
    builderSkillId: "intro",
  },
  {
    id: "anime-monster-tamer",
    title: "You and your little creature",
    caption: "The same doodle, out adventuring with a creature of their own.",
    skillId: "tamer",
    familyId: "monster-tamer",
    builderSkillId: "reel",
  },
];

for (const a of ANIME_FAMILY_SPECS) {
  const familyHint = resolveFamilyHint(a.familyId, "video");
  if (!familyHint) {
    throw new Error(`anime family "${a.familyId}" resolved to an empty video styleHint — check src/lib/art-families.ts`);
  }
  // Empty theme/style hints == the doodle no-selection base; familyHint carries
  // the look. Exactly how the product composes a family choice with no theme.
  const prompt = videoPromptBuilderFor(a.builderSkillId)({
    themeHint: "",
    styleHint: "",
    familyHint,
  });
  CLIPS.push({
    id: a.id,
    title: a.title,
    caption: a.caption,
    skillId: a.skillId,
    mode: "reference",
    sourceImageUrl: ANIME_REFERENCE_DOODLE,
    prompt,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ClipEntry {
  id: string;
  title: string;
  caption: string;
  skillId: string;
  mode: "image" | "reference";
  seconds: number;
  resolution: string;
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

/** Verify a URL is a real, non-trivial mp4. Returns the verification detail. */
async function verifyVideo(url: string): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> {
  // GET (not HEAD) so byte count and content-type are both real; PicX CDN
  // sometimes omits Content-Length on HEAD.
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, status: 0, contentType: "", bytes: 0 };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const buf = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0);
  const bytes = buf.byteLength;
  const ok = res.ok && contentType.includes("video/mp4") && bytes >= MIN_VIDEO_BYTES;
  return { ok, status: res.status, contentType, bytes };
}

async function verifySource(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Submit one clip. Mirrors src/lib/video/submit.ts, minus callback_url. */
async function submit(spec: ClipSpec): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    prompt: spec.prompt,
    model: VIDEO_MODEL,
    mode: spec.mode,
    duration: SECONDS,
    resolution: RESOLUTION,
    sound: SOUND,
  };
  if (spec.mode === "image") payload.image_url = spec.sourceImageUrl;
  if (spec.mode === "reference") payload.reference_urls = [spec.sourceImageUrl];

  const res = await fetch(`${API}/videos/generate`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; detail?: string; message?: string };
  if (res.status !== 202 || !data.id) {
    throw new Error(`submit ${res.status}: ${data.detail || data.message || "no id"}`);
  }
  return { id: data.id };
}

interface PollResult {
  status: string;
  outputUrl: string | null;
  createdAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  creditsUsed: number | null;
}

/** The subset of a PicX generation row this script reads.
 *
 *  Declared rather than using `Record<string, any>` so the fields feeding
 *  PollResult keep real types — `any` silently allowed a number into
 *  `outputUrl` and would not have flagged a renamed field. `data` is optional
 *  and self-referential because some deployments nest the row one level down. */
interface PicxGenerationRow {
  status?: string | null;
  output_url?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  credits_used?: number | null;
  data?: PicxGenerationRow;
}

/** Poll GET /v1/generations/{id} until terminal or timeout. */
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
    const raw = (await res.json().catch(() => ({}))) as PicxGenerationRow;
    // The row's fields sit at the top level; some deployments nest under `data`.
    const d = raw.data ?? raw;
    const status = String(d.status ?? raw.status ?? "unknown");
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return {
        status,
        outputUrl: d.output_url ?? raw.output_url ?? null,
        createdAt: d.created_at ?? raw.created_at ?? null,
        completedAt: d.completed_at ?? raw.completed_at ?? null,
        errorMessage: d.error_message ?? raw.error_message ?? null,
        creditsUsed: d.credits_used ?? raw.credits_used ?? null,
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
      /* fall through to empty */
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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const specs = CLIPS.slice(0, LIMIT);
  console.log(`\nShowcase clip generator — ${DRY_RUN ? "DRY RUN (spends nothing)" : "LIVE (spends credits)"}`);
  console.log(`  model ${VIDEO_MODEL}  resolution ${RESOLUTION}  duration ${SECONDS}s  sound ${SOUND}`);
  console.log(`  limit ${LIMIT}${FORCE ? " (--force)" : ""}  output ${OUT_PATH.pathname}\n`);

  const existing = loadExisting();
  const byId = new Map(existing.clips.map((c) => [c.id, c]));

  // Idempotency: an entry whose cdnUrl still verifies is kept as-is, never re-rendered.
  const toRender: ClipSpec[] = [];
  for (const spec of specs) {
    const prior = byId.get(spec.id);
    if (prior?.cdnUrl) {
      const v = await verifyVideo(prior.cdnUrl);
      if (v.ok) {
        console.log(`  = ${spec.id}: already rendered and verifies (${v.bytes} bytes) — skipping (free)`);
        continue;
      }
      console.log(`  ~ ${spec.id}: prior cdnUrl no longer verifies (status ${v.status}) — will re-render`);
    }
    toRender.push(spec);
  }

  // Money guard, on the REAL spend: the number of clips that will actually be
  // submitted after idempotency, not the spec count. The intended run renders 3
  // anime clips (the 3 originals verify and skip for free) = 450 credits, which
  // is within the cap. A larger surprise batch still refuses without --force.
  if (toRender.length > MAX_RENDER_WITHOUT_FORCE && !FORCE) {
    console.error(
      `Refusing to render ${toRender.length} clips (>${MAX_RENDER_WITHOUT_FORCE}) without --force. ` +
        `That is ${toRender.length * SECONDS * CREDITS_PER_SECOND} credits.`,
    );
    process.exit(2);
  }

  if (DRY_RUN) {
    console.log(`\n  Would submit ${toRender.length} clip(s):`);
    for (const spec of toRender) {
      const inputField = spec.mode === "image" ? "image_url" : "reference_urls";
      console.log(
        `\n    ${spec.id}  [${spec.mode}]  skill=${spec.skillId}\n` +
          `      payload: { prompt: <${spec.prompt.length} chars>, model: "${VIDEO_MODEL}", mode: "${spec.mode}", ` +
          `duration: ${SECONDS}, resolution: "${RESOLUTION}", sound: ${SOUND}, ${inputField}: "${spec.sourceImageUrl}" }\n` +
          `      would spend: ${SECONDS * CREDITS_PER_SECOND} credits`,
      );
    }
    const spend = toRender.length * SECONDS * CREDITS_PER_SECOND;
    console.log(`\n  Total would-spend: ${spend} credits across ${toRender.length} clip(s). Nothing submitted.\n`);
    return;
  }

  // Verify every source frame before spending a credit.
  for (const spec of toRender) {
    const ok = await verifySource(spec.sourceImageUrl);
    if (!ok) throw new Error(`source frame for ${spec.id} did not return 200: ${spec.sourceImageUrl}`);
  }
  if (toRender.length > 0) console.log(`  All ${toRender.length} source frame(s) verified 200.\n`);

  const results: ClipEntry[] = [];
  let totalCredits = 0;

  for (const spec of toRender) {
    console.log(`  → ${spec.id} [${spec.mode}]: submitting…`);
    const { id } = await submit(spec);
    console.log(`    submitted, generation id ${id} — polling every ${POLL_INTERVAL_MS / 1000}s (max ${POLL_MAX_MS / 60000}m)`);
    const wallStart = Date.now();
    const p = await poll(id);
    const wallSeconds = Math.round(((Date.now() - wallStart) / 1000) * 10) / 10;

    if (p.status !== "completed" || !p.outputUrl) {
      console.log(`    ✗ ${spec.id}: ${p.status}${p.errorMessage ? ` — ${p.errorMessage}` : ""} — NOT written`);
      continue;
    }

    const v = await verifyVideo(p.outputUrl);
    if (!v.ok) {
      console.log(`    ✗ ${spec.id}: output failed verification (status ${v.status}, type ${v.contentType || "?"}, ${v.bytes} bytes) — NOT written`);
      continue;
    }

    const providerSeconds = renderSecondsFrom(p.createdAt, p.completedAt);
    const creditsSpent = SECONDS * CREDITS_PER_SECOND;
    totalCredits += creditsSpent;
    console.log(
      `    ✓ ${spec.id}: ${v.status} ${v.contentType} ${v.bytes} bytes | ` +
        `render ${providerSeconds ?? "?"}s (provider) / ${wallSeconds}s (wall) | ${creditsSpent} credits`,
    );

    results.push({
      id: spec.id,
      title: spec.title,
      caption: spec.caption,
      skillId: spec.skillId,
      mode: spec.mode,
      seconds: SECONDS,
      resolution: RESOLUTION,
      sourceImageUrl: spec.sourceImageUrl,
      cdnUrl: p.outputUrl,
      picxGenerationId: id,
      renderSeconds: providerSeconds,
      createdAt: p.createdAt ?? new Date().toISOString(),
      creditsSpent,
    });
  }

  // Merge: new results replace same-id entries; verified priors are preserved in id order.
  const merged = new Map<string, ClipEntry>();
  for (const c of existing.clips) merged.set(c.id, c);
  for (const c of results) merged.set(c.id, c);
  // Keep only entries whose spec still exists, in spec order, then any extras.
  const ordered: ClipEntry[] = [];
  for (const spec of CLIPS) {
    const c = merged.get(spec.id);
    if (c) {
      ordered.push(c);
      merged.delete(spec.id);
    }
  }
  for (const c of merged.values()) ordered.push(c);

  const out: ShowcaseFile = { generatedAt: new Date().toISOString(), model: VIDEO_MODEL, clips: ordered };
  // Create src/data/ if it does not exist yet — this script owns its output path
  // and must not depend on a sibling lane having created the directory first.
  mkdirSync(dirname(fileURLToPath(OUT_PATH)), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`\n  Wrote ${ordered.length} verified clip(s) to ${OUT_PATH.pathname}`);
  console.log(`  Credits spent this run: ${totalCredits}\n`);
}

await main();
