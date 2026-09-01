/* Turn a video skill's OWN finished clip into its marketplace cover, by pulling
 * frame one out of the mp4 — no new generation, no credits.
 *
 * WHY THIS EXISTS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Seven `kind: video` skills shipped with no `thumbnailUrl`, so SkillCard fell
 * back to `buildSkillThumbnail()` — the synthetic SVG doodle face from
 * SAMPLE_PRESETS. On the Skills wall's "Moves" filter that reads as a wall of
 * identical placeholder faces sitting next to the four skills that DO have real
 * art, which is the single worst thing the catalogue can look like: it implies
 * the skill produces that face.
 *
 * scripts/generate-video-skill-covers.ts solved this for two skills by rendering
 * a NEW still through /images/edit that merely resembles what the clip would
 * look like. This script does the honest version instead: the cover is a real
 * decoded frame of a real clip that skill actually produced. Frame one is the
 * right frame to take — it is literally where the animation starts, and for a
 * mode:'image' skill it is the supplied doodle itself, so cover and clip can
 * never disagree.
 *
 * THE PROVENANCE RULE, which is the whole point.
 * ─────────────────────────────────────────────────────────────────────────────
 * A cover may ONLY come from a clip that skill itself produced. src/data/
 * showcase-clips.json holds clips keyed by `skillId`, and three of its entries
 * (`pirate`, `ninja`, `tamer`) are the anime IMAGE skills — they were rendered
 * with a video builder borrowed from another skill plus an art-family hint, so
 * they are NOT output of the vertical video skills that happen to share their
 * display name (voyage / stealth / creature). Reusing them would put another
 * skill's art on those tiles, which every SKILL.md in this repo explicitly
 * forbids. So the mapping below is exact-match on the video skill's own id, and
 * a skill with no clip of its own is REPORTED, never substituted.
 *
 * WHAT IT DOES.
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Reads src/data/showcase-clips.json and keeps entries whose skillId is a
 *      real VIDEO skill id (src/lib/video/skills.ts) — the provenance gate.
 *   2. Downloads each mp4 and decodes frame one with ffmpeg.
 *   3. Blank-frame guard: a clip that fades in from black would yield a black
 *      cover, so the frame's mean luma is measured and the next candidate time
 *      is tried until one is not degenerate. Whatever time was used is written
 *      into the manifest — the cover is never claimed to be t=0 when it is not.
 *   4. Uploads the frame as a managed PicX asset, so it lands on
 *      cdn.picxstudio.com and inherits the Cloudflare image resizing that
 *      src/lib/cdn-image.ts depends on (a local /public file would not).
 *   5. Verifies the returned URL: HTTP 200, image/*, non-trivial bytes.
 *   6. Writes src/data/skill-video-covers.json (the provenance record) and, with
 *      --write, patches each SKILL.md's metadata.thumbnailUrl in place.
 *
 * COST: zero credits. Managed uploads are free; nothing is generated.
 *
 * RUN:
 *   node --experimental-strip-types scripts/extract-clip-first-frames.ts --dry-run
 *   node --experimental-strip-types scripts/extract-clip-first-frames.ts
 *   node --experimental-strip-types scripts/extract-clip-first-frames.ts --write
 *   node --experimental-strip-types scripts/extract-clip-first-frames.ts --write --force
 *
 *   --dry-run  decode locally, print what would be uploaded, upload nothing.
 *   --write    patch the SKILL.md files as well as the manifest.
 *   --force    re-cover a skill that already has a thumbnailUrl (default: skip,
 *              so a re-run is idempotent and never churns hand-picked art).
 *
 * Reads PICX_API_KEY from env or .dev.vars. Never prints it.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PicX } from "picx-ai";

const execFileAsync = promisify(execFile);

const CLIPS_PATH = new URL("../src/data/showcase-clips.json", import.meta.url);
const MANIFEST_PATH = new URL("../src/data/skill-video-covers.json", import.meta.url);
const SKILLS_DIR = new URL("../src/mastra/skills/", import.meta.url);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const WRITE_SKILLS = args.has("--write");
const FORCE = args.has("--force");

/* --only <skillId> narrows the run to one skill, so re-cutting a single bad
   cover does not re-upload the covers that are already right. */
const onlyArg = process.argv.slice(2).indexOf("--only");
const ONLY = onlyArg >= 0 ? process.argv.slice(2)[onlyArg + 1] : null;

/* Frame-one candidates, in order. The first is the actual first frame, which is
   what we want; the rest exist only for a clip that opens on an empty page,
   where "the first frame" is a truthful but useless cover. */
const CANDIDATE_TIMES = [0, 0.3, 0.6, 1.2, 2.5] as const;
/* Mean-luma window. A YAVG of 16 is essentially black and 248 essentially blown
   out; both are what a fade looks like. */
const MIN_LUMA = 18;
const MAX_LUMA = 248;
/**
 * The guard that actually matters, measured rather than guessed.
 *
 * dash-run opens on a BLANK cream page — the character runs in a few frames
 * later. That frame is bright (YAVG 222) and would sail past any brightness
 * check, but YMAX-YMIN is 13: there is nothing drawn on it. Every frame with a
 * doodle in it measured 238-255 of spread, so anything under this floor is a
 * blank page, not a picture.
 */
const MIN_CONTRAST = 60;

/**
 * Per-skill frame-time overrides, in seconds.
 *
 * The automatic guard only answers "is anything drawn on this frame". It cannot
 * answer "is this a good cover", and for an action skill those come apart: the
 * `dash` clip's first DRAWN frame (t=0.3s) catches the runner half-entering at
 * the edge of frame with most of the picture still empty page. It passes the
 * spread test honestly and still makes a poor tile.
 *
 * So a skill may name its own beat. Every entry needs a reason, and the reason
 * is written into the SKILL.md cover comment, because a cover taken from 3.5s is
 * NOT frame one and the file must not claim it is.
 */
const FRAME_TIME_OVERRIDES: Record<string, { seconds: number; why: string }> = {
  dash: {
    seconds: 3.5,
    why:
      "the clip opens on an empty page and the runner only enters around 0.5s; " +
      "3.5s is the apex of the leap, legs extended inside a full radial speed-line burst",
  },
  /* The 15s vertical skills spend roughly 0-4s on the ESTABLISH beat by design
     (see THREE_BEATS in src/lib/video/prompts.ts), so frame one is deliberately
     the calmest moment in the clip — a portrait before anything happens. For a
     genre tile that is the weakest frame available, and for `creature` it is
     actively wrong: the companion the skill is named for has not appeared yet. */
  voyage: {
    seconds: 9,
    why:
      "frame one is a plain portrait before the action starts; 9s is mid rope-swing " +
      "over the water toward the ship, with the motion arc drawn in, and it is full-bleed 9:16",
  },
  creature: {
    seconds: 10,
    why:
      "the companion creature does not exist on screen until the mid beat, so frame one " +
      "shows a character alone and misrepresents the skill; 10s has the creature landed " +
      "beside them with its signature silhouette readable at tile size",
  },
};

function readApiKey(): string {
  const fromEnv = process.env.PICX_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const line = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("PICX_API_KEY="));
  const key = line?.slice("PICX_API_KEY=".length).trim();
  if (!key) throw new Error("PICX_API_KEY not found in env or .dev.vars");
  return key;
}

interface ShowcaseClip {
  id: string;
  skillId?: string;
  cdnUrl?: string;
  sourceImageUrl?: string;
  mode?: string;
  picxGenerationId?: string;
}

interface CoverRecord {
  /** Video skill id the cover belongs to. */
  skillId: string;
  /** SKILL.md directory that was (or would be) patched. */
  packageName: string;
  /** The cover: a real decoded frame, uploaded as a managed PicX asset. */
  thumbnailUrl: string;
  /** The clip the frame came from — this is the provenance claim. */
  clipUrl: string;
  clipId: string;
  picxGenerationId?: string;
  /** The doodle the clip was made from, for the skill page's before/after pair. */
  sourceImageUrl?: string;
  /** Seconds into the clip the frame was decoded at. 0 unless the guard moved it. */
  frameTime: number;
  width: number;
  height: number;
  bytes: number;
  extractedAt: string;
}

/**
 * `id` → { directory, kind } for every SKILL.md package.
 *
 * Read from the SKILL.md files rather than imported from src/lib/video/skills.ts
 * on purpose: SKILL.md IS the authoring source of truth for what a skill is (the
 * loader parses these same files at build time), and the runtime module's
 * extensionless relative imports do not resolve under node's type-stripping
 * loader, which is what this script runs on.
 */
function readSkillIndex(): Map<string, { packageName: string; kind: string }> {
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const map = new Map<string, { packageName: string; kind: string }>();
  for (const dir of dirs) {
    const file = join(SKILLS_DIR.pathname, dir.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const body = readFileSync(file, "utf8");
    const id = body.match(/^\s{2}id:\s*(\S+)\s*$/m)?.[1]?.replace(/['"]/g, "");
    const kind = body.match(/^\s{2}kind:\s*['"]?(\w+)/m)?.[1] ?? "image";
    if (id) map.set(id, { packageName: dir.name, kind });
  }
  return map;
}

function hasThumbnail(packageName: string): boolean {
  const body = readFileSync(join(SKILLS_DIR.pathname, packageName, "SKILL.md"), "utf8");
  /* Only an ACTIVE key counts. Four of these files carry a commented-out
     "do not point thumbnailUrl at another skill's art" note, and treating that
     as an existing cover would make the script a no-op on exactly the skills it
     exists to fix. */
  return /^\s{2}thumbnailUrl:\s*['"]?https?:/m.test(body);
}

async function ffprobeSize(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x",
    file,
  ]);
  const [w, h] = stdout.trim().split("x").map(Number);
  return { width: w || 0, height: h || 0 };
}

interface FrameStats {
  /** Mean luma, 0-255. */
  avg: number;
  /** Darkest and brightest luma present; their gap is the "is anything drawn on
      this?" measurement. */
  min: number;
  max: number;
}

/** Luma statistics for a still, via ffmpeg's own signalstats filter. */
async function frameStats(file: string): Promise<FrameStats> {
  const { stderr } = await execFileAsync("ffmpeg", [
    "-v", "info",
    "-i", file,
    "-vf", "signalstats,metadata=print",
    "-f", "null", "-",
  ]);
  const read = (key: string): number => {
    const match = stderr.match(new RegExp(`lavfi\\.signalstats\\.${key}=([\\d.]+)`));
    return match ? Number(match[1]) : Number.NaN;
  };
  return { avg: read("YAVG"), min: read("YMIN"), max: read("YMAX") };
}

function isUsable(stats: FrameStats): boolean {
  /* Unreadable stats must not veto a frame — a missing measurement is our
     problem, not evidence about the picture. */
  if (!Number.isFinite(stats.avg)) return true;
  if (stats.avg < MIN_LUMA || stats.avg > MAX_LUMA) return false;
  if (Number.isFinite(stats.min) && Number.isFinite(stats.max)) {
    return stats.max - stats.min >= MIN_CONTRAST;
  }
  return true;
}

/**
 * Decode one usable frame from the front of a clip. Returns the bytes and the
 * timestamp actually used, which the manifest records verbatim.
 */
async function extractFrame(
  videoPath: string,
  workDir: string,
  label: string,
): Promise<{ bytes: ArrayBuffer; frameTime: number; stats: FrameStats }> {
  let last: FrameStats | null = null;

  /* An explicit override wins outright: a human looked at the clip and chose the
     beat. It still goes through the blank guard, so a mistyped time that lands on
     an empty frame is caught rather than shipped. */
  const override = FRAME_TIME_OVERRIDES[label];
  const times: number[] = override
    ? [override.seconds, ...CANDIDATE_TIMES.filter((t) => t !== override.seconds)]
    : [...CANDIDATE_TIMES];
  if (override) console.log(`    override t=${override.seconds}s — ${override.why}`);

  for (const time of times) {
    const out = join(workDir, `${label}-${time}.jpg`);
    /* -ss BEFORE -i is an input seek: ffmpeg jumps to the keyframe rather than
       decoding the whole file. At t=0 that is exactly frame one. -q:v 2 is
       near-visually-lossless JPEG; the cover is resized by the CDN anyway, so
       there is no reason to ship a heavier PNG. */
    await execFileAsync("ffmpeg", [
      "-y", "-v", "error",
      "-ss", String(time),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "2",
      out,
    ]);
    /* Detached from Buffer's shared pool: a Buffer's `.buffer` is a slab shared
       with unrelated reads, so uploading it directly would send the wrong bytes. */
    const raw = readFileSync(out);
    const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const stats = await frameStats(out);
    last = stats;
    if (isUsable(stats)) return { bytes, frameTime: time, stats };
    console.log(
      `    t=${time}s rejected — luma ${stats.avg.toFixed(1)}, spread ${stats.max - stats.min}: ` +
        `an empty page, not a picture`,
    );
  }

  /* Every candidate was degenerate. Returning one anyway would put a blank tile
     on the wall, which is worse than the synthetic fallback it replaces. */
  throw new Error(
    `no drawn frame at any candidate time ${times.join("/")}s (last spread ${last ? last.max - last.min : "n/a"})`,
  );
}

async function verifyImage(url: string): Promise<{ ok: boolean; status: number; contentType: string; bytes: number }> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  const contentType = res.headers.get("content-type") ?? "";
  return {
    ok: res.ok && contentType.startsWith("image/") && buf.byteLength > 1024,
    status: res.status,
    contentType,
    bytes: buf.byteLength,
  };
}

/**
 * Put `thumbnailUrl` (and `sourceImageUrl`, when the clip has one) into a
 * SKILL.md's metadata block, replacing the "no real cover exists yet" comment
 * that was standing in for it.
 *
 * Deliberately a targeted text edit rather than a YAML round-trip: these files
 * are hand-authored prose with comments that carry the reasoning, and
 * re-emitting the frontmatter would strip every one of them.
 */
function patchSkillFile(packageName: string, record: CoverRecord): boolean {
  const path = join(SKILLS_DIR.pathname, packageName, "SKILL.md");
  const original = readFileSync(path, "utf8");
  let body = original;

  /* Say exactly which frame this is. `frameTime > 0` means the clip opened on a
     blank page and the guard walked forward to the first frame with something
     drawn on it — claiming "frame one" there would be a small lie in a file
     whose whole convention is that the cover is provably the skill's own output. */
  const override = FRAME_TIME_OVERRIDES[record.skillId];
  const which =
    record.frameTime === 0
      ? "frame one of this skill's own finished clip"
      : override && override.seconds === record.frameTime
        ? `the frame at t=${record.frameTime}s of this skill's own finished clip, chosen deliberately because ${override.why},`
        : `the first drawn frame (t=${record.frameTime}s — the clip opens on an empty page) of this skill's own finished clip`;

  const provenance =
    `  # Cover: ${which}\n` +
    `  # (${record.clipId}), decoded from the mp4 and uploaded as a managed asset by\n` +
    `  # scripts/extract-clip-first-frames.ts — a real frame of a real render, not a\n` +
    `  # lookalike still. Clip, frame time and dimensions are recorded in\n` +
    `  # src/data/skill-video-covers.json, so this cover is re-derivable.\n`;

  const lines = [
    provenance,
    `  thumbnailUrl: "${record.thumbnailUrl}"\n`,
    record.sourceImageUrl ? `  sourceImageUrl: "${record.sourceImageUrl}"\n` : "",
  ].join("");

  /* The placeholder note these files carry, in both wordings that exist. */
  const placeholder =
    /^\s{2}# No real cover( exists)? (for this skill )?yet[\s\S]*?(?=^\s{2}order:)/m;

  /* A previous run's own provenance block, so a re-cut replaces the WHOLE claim
     rather than just the URL. Without this, re-cutting `dash` from 0.3s to 3.5s
     swapped the image but left a comment still saying 0.3s — a file whose
     comment contradicts its own value is worse than no comment. */
  const priorProvenance = /^\s{2}# Cover: [\s\S]*?(?=^\s{2}thumbnailUrl:)/m;

  if (placeholder.test(body)) {
    body = body.replace(placeholder, lines);
  } else if (/^\s{2}thumbnailUrl:\s*['"]?https?:/m.test(body)) {
    if (priorProvenance.test(body)) body = body.replace(priorProvenance, "");
    body = body.replace(/^\s{2}thumbnailUrl:.*$/m, `${provenance}  thumbnailUrl: "${record.thumbnailUrl}"`);
  } else {
    /* No placeholder and no existing key: insert just above `order:`, which every
       one of these metadata blocks ends with. */
    body = body.replace(/^(\s{2}order:)/m, `${lines}$1`);
  }

  if (body === original) return false;
  writeFileSync(path, body);
  return true;
}

async function main() {
  const clipsFile = JSON.parse(readFileSync(CLIPS_PATH, "utf8")) as { clips?: ShowcaseClip[] };
  const clips = clipsFile.clips ?? [];
  const index = readSkillIndex();
  const videoIds = new Set([...index].filter(([, v]) => v.kind === "video").map(([id]) => id));

  /* Provenance gate: exact id match only. First clip wins for a skill with
     several, which is the order the showcase itself presents them in. */
  const chosen = new Map<string, ShowcaseClip>();
  for (const clip of clips) {
    if (!clip.skillId || !clip.cdnUrl) continue;
    if (!videoIds.has(clip.skillId)) continue;
    if (!chosen.has(clip.skillId)) chosen.set(clip.skillId, clip);
  }

  console.log(`${clips.length} clips on file; ${chosen.size} of them belong to a video skill.\n`);

  const missing = [...videoIds].filter((id) => !chosen.has(id));
  const targets: { skillId: string; clip: ShowcaseClip; packageName: string }[] = [];
  for (const [skillId, clip] of chosen) {
    if (ONLY && skillId !== ONLY) continue;
    const packageName = index.get(skillId)?.packageName;
    if (!packageName) {
      console.log(`  ${skillId}: no SKILL.md found — skipped`);
      continue;
    }
    if (!FORCE && hasThumbnail(packageName)) {
      console.log(`  ${skillId}: already has a real cover — skipped (pass --force to replace)`);
      continue;
    }
    targets.push({ skillId, clip, packageName });
  }

  if (targets.length === 0) {
    console.log("\nNothing to do.");
    if (missing.length) console.log(`Still uncovered (no clip of their own): ${missing.join(", ")}`);
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "clip-frames-"));
  const picx = DRY_RUN ? null : new PicX(readApiKey());
  const records: CoverRecord[] = [];
  const failures: { skillId: string; reason: string }[] = [];

  try {
    for (const { skillId, clip, packageName } of targets) {
      console.log(`\n${skillId} <- ${clip.id}`);
      try {
        const res = await fetch(clip.cdnUrl!);
        if (!res.ok) throw new Error(`clip fetch ${res.status}`);
        const videoPath = join(workDir, `${skillId}.mp4`);
        writeFileSync(videoPath, new Uint8Array(await res.arrayBuffer()));

        const { width, height } = await ffprobeSize(videoPath);
        const frame = await extractFrame(videoPath, workDir, skillId);
        console.log(
          `    frame t=${frame.frameTime}s  ${width}x${height}  ${frame.bytes.byteLength}B  ` +
            `luma ${frame.stats.avg.toFixed(1)}  spread ${frame.stats.max - frame.stats.min}`,
        );

        if (DRY_RUN) {
          console.log("    dry run — not uploaded");
          continue;
        }

        const asset = await picx!.assets.create({
          file: new Blob([frame.bytes], { type: "image/jpeg" }),
          filename: `${skillId}-first-frame.jpg`,
          metadata: {
            purpose: "skill-cover",
            skillId,
            clipId: clip.id,
            clipUrl: clip.cdnUrl,
            frameTime: frame.frameTime,
          },
        });

        const check = await verifyImage(asset.url);
        console.log(`    uploaded: ${asset.url}`);
        console.log(`    verified: HTTP ${check.status} ${check.contentType} ${check.bytes}B ${check.ok ? "OK" : "*** INVALID ***"}`);
        if (!check.ok) throw new Error(`uploaded cover did not verify (HTTP ${check.status} ${check.contentType})`);

        records.push({
          skillId,
          packageName,
          thumbnailUrl: asset.url,
          clipUrl: clip.cdnUrl!,
          clipId: clip.id,
          picxGenerationId: clip.picxGenerationId,
          sourceImageUrl: clip.sourceImageUrl,
          frameTime: frame.frameTime,
          width,
          height,
          bytes: frame.bytes.byteLength,
          extractedAt: new Date().toISOString(),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.log(`    FAILED — ${reason}`);
        failures.push({ skillId, reason });
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  if (records.length > 0) {
    mkdirSync(new URL("./", MANIFEST_PATH).pathname, { recursive: true });
    /* Merge, so covering two skills in two runs does not drop the first. */
    let existing: CoverRecord[] = [];
    try {
      existing = (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { covers?: CoverRecord[] }).covers ?? [];
    } catch {
      /* No manifest yet. */
    }
    const merged = [...existing.filter((e) => !records.some((r) => r.skillId === e.skillId)), ...records].sort(
      (a, b) => a.skillId.localeCompare(b.skillId),
    );
    writeFileSync(
      MANIFEST_PATH,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), covers: merged }, null, 2)}\n`,
    );
    console.log(`\nmanifest: src/data/skill-video-covers.json (${merged.length} covers)`);

    if (WRITE_SKILLS) {
      for (const record of records) {
        const patched = patchSkillFile(record.packageName, record);
        console.log(`  ${patched ? "patched" : "UNCHANGED"} src/mastra/skills/${record.packageName}/SKILL.md`);
      }
    } else {
      console.log("\nSKILL.md files untouched — re-run with --write to patch them.");
    }
  }

  if (missing.length) {
    console.log(
      `\nStill uncovered, because no clip on file was produced BY that skill: ${missing.join(", ")}.` +
        `\nThese need a real clip of their own first (scripts/generate-showcase-clips.ts); borrowing` +
        `\nanother skill's frame is exactly what the SKILL.md notes forbid.`,
    );
  }
  if (failures.length) {
    console.error(`\n${failures.length} failed: ${failures.map((f) => `${f.skillId} (${f.reason})`).join("; ")}`);
    process.exit(1);
  }
}

await main();
