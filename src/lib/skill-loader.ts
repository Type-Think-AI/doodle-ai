/* Single source of truth for Doodle AI's skills.

   Every skill lives in its own package directory under src/mastra/skills/,
   in the Agent Skills format (https://agentskills.io) that Mastra implements:

     src/mastra/skills/<skill-name>/
     ├── SKILL.md          # required: frontmatter metadata + instructions
     └── references/       # optional: supporting docs the agent can read

   Both consumers read from here, so a skill is edited in exactly one place:
   - src/mastra/skills/index.ts turns runnable entries into Mastra skills
     (createSkill) for the agent.
   - src/lib/skills.ts turns every entry into the UI catalog used by the
     skills marketplace, the composer's "/" picker, and the sitemap.

   Loading strategy: Vite's import.meta.glob inlines the markdown at BUILD
   time. Mastra also supports passing filesystem paths to an agent's `skills`
   config, but that reads SKILL.md from disk at runtime via Node's fs, which
   does not exist on Cloudflare Workers — where this app deploys. Bundling
   instead keeps one authoring format that works in dev, in the build, and on
   the Worker. (It also matches what Mastra's own file-based agents do: skills
   are "added to the generated bundle at build time".) */

import { GENERATION_MODES } from "./doodle-constants";
import { parseSkillFile, type Frontmatter, type FrontmatterScalar } from "./skill-frontmatter";

export type SkillCategory = "avatars" | "collages" | "freeform";

export interface SkillDefinition {
  /* ---- Agent-facing (Agent Skills spec fields) ---- */
  /** Skill name from frontmatter — lowercase/hyphenated, e.g. "doodle-avatar". */
  name: string;
  /** When to use this skill. Shown to the model for skill selection. */
  description: string;
  /** The SKILL.md body: the full instructions the model loads on demand. */
  instructions: string;
  /** references/*.md contents, keyed by filename, readable via skill_read. */
  references: Record<string, string>;
  license?: string;
  userInvocable: boolean;

  /* ---- App-facing (frontmatter `metadata:` block) ---- */
  /** Generation-mode id shared by the UI routes and the generateDoodle tool. */
  id: string;
  /** Human-readable name for the UI (the agent-facing `name` is kebab-case). */
  displayName: string;
  tagline: string;
  desc: string;
  longDesc: string;
  category: SkillCategory;
  tags: string[];
  /** false = a roadmap preview: shown in the UI, never attached to the agent. */
  runnable: boolean;
  requiresPhoto: boolean;
  aspectRatio: "1:1" | "3:2";
  /** Index into SAMPLE_PRESETS (doodle-constants.ts), for a synthetic preview thumbnail. */
  sampleIndex: number;
  /**
   * A real generated PicX output, used as the card thumbnail instead of the
   * synthetic SVG when present. Set this to an actual `generateDoodle`
   * result for the skill — never a placeholder or unrelated image — so the
   * marketplace shows what the skill genuinely produces.
   */
  thumbnailUrl?: string;
  /**
   * The input photo `thumbnailUrl` was generated FROM, when it was produced by
   * a photo skill. Lets a skill page show a real before/after pair instead of
   * only the result — the most direct way to evidence likeness, which is the
   * single loudest complaint about photo-to-cartoon tools (see
   * docs/skills-research-2026-08.md). Must be the genuine source image for
   * that thumbnail, never an unrelated stock photo.
   */
  sourceImageUrl?: string;
  /** Display order across the UI. */
  order: number;
}

const SKILL_FILES = import.meta.glob("../mastra/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const REFERENCE_FILES = import.meta.glob("../mastra/skills/*/references/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CATEGORIES: SkillCategory[] = ["avatars", "collages", "freeform"];
const ASPECT_RATIOS = ["1:1", "3:2"] as const;

function requireBlock(frontmatter: Frontmatter, key: string, path: string): Record<string, FrontmatterScalar> {
  const value = frontmatter[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} — frontmatter is missing the \`${key}:\` block`);
  }
  return value;
}

function requireString(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} — \`${key}\` must be a non-empty string`);
  }
  return value;
}

function optionalString(source: Record<string, unknown>, key: string, path: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} — \`${key}\` must be a non-empty string when present`);
  }
  return value;
}

function requireBoolean(source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") throw new Error(`${path} — \`${key}\` must be true or false`);
  return value;
}

function requireNumber(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} — \`${key}\` must be a number`);
  }
  return value;
}

function requireStringArray(source: Record<string, unknown>, key: string, path: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} — \`${key}\` must be a non-empty inline array, e.g. [a, b]`);
  }
  return value;
}

function requireOneOf<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
): T {
  const value = requireString(source, key, path);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${path} — \`${key}\` must be one of: ${allowed.join(", ")} (got "${value}")`);
  }
  return value as T;
}

/** references/ files for one skill directory, keyed by filename. */
function referencesFor(directory: string): Record<string, string> {
  const references: Record<string, string> = {};
  for (const [path, contents] of Object.entries(REFERENCE_FILES)) {
    const segments = path.split("/");
    if (segments[segments.length - 3] !== directory) continue;
    references[segments[segments.length - 1]] = contents;
  }
  return references;
}

function loadSkillDefinitions(): SkillDefinition[] {
  const definitions = Object.entries(SKILL_FILES).map(([path, raw]) => {
    const segments = path.split("/");
    const directory = segments[segments.length - 2];
    const { frontmatter, body } = parseSkillFile(raw, path);

    const name = requireString(frontmatter, "name", path);
    if (name !== directory) {
      throw new Error(`${path} — \`name\` ("${name}") must match its directory name ("${directory}")`);
    }
    if (!/^[a-z0-9-]{1,64}$/.test(name)) {
      throw new Error(`${path} — \`name\` must be 1-64 lowercase letters, numbers, or hyphens`);
    }
    if (!body) throw new Error(`${path} — the body below the frontmatter (the instructions) is empty`);

    const metadata = requireBlock(frontmatter, "metadata", path);

    return {
      name,
      description: requireString(frontmatter, "description", path),
      instructions: body,
      references: referencesFor(directory),
      license: optionalString(frontmatter, "license", path),
      userInvocable: frontmatter["user-invocable"] === undefined ? true : requireBoolean(frontmatter, "user-invocable", path),

      id: requireString(metadata, "id", path),
      displayName: requireString(metadata, "displayName", path),
      tagline: requireString(metadata, "tagline", path),
      desc: requireString(metadata, "desc", path),
      longDesc: requireString(metadata, "longDesc", path),
      category: requireOneOf(metadata, "category", CATEGORIES, path),
      tags: requireStringArray(metadata, "tags", path),
      runnable: requireBoolean(metadata, "runnable", path),
      requiresPhoto: requireBoolean(metadata, "requiresPhoto", path),
      aspectRatio: requireOneOf(metadata, "aspectRatio", ASPECT_RATIOS, path),
      sampleIndex: requireNumber(metadata, "sampleIndex", path),
      thumbnailUrl: optionalString(metadata, "thumbnailUrl", path),
      sourceImageUrl: optionalString(metadata, "sourceImageUrl", path),
      order: requireNumber(metadata, "order", path),
    } satisfies SkillDefinition;
  });

  if (definitions.length === 0) {
    throw new Error("No SKILL.md files found under src/mastra/skills/*/ — the skills catalog would be empty");
  }
  assertUnique(definitions, "id");
  assertUnique(definitions, "order");
  assertRunnableIdsMatchGenerationModes(definitions);

  return definitions.sort((a, b) => a.order - b.order);
}

/**
 * A skill marked `runnable: true` promises the generateDoodle tool can
 * execute its `metadata.id`. Check both directions at load time so adding a
 * runnable skill without a matching generation mode (or retiring a mode and
 * leaving the skill behind) fails the build instead of erroring mid-chat.
 */
function assertRunnableIdsMatchGenerationModes(definitions: SkillDefinition[]): void {
  const runnableIds = definitions.filter((d) => d.runnable).map((d) => d.id);
  const missingMode = runnableIds.filter((id) => !(GENERATION_MODES as readonly string[]).includes(id));
  if (missingMode.length > 0) {
    throw new Error(
      `Runnable skill id(s) ${missingMode.join(", ")} have no generation mode in doodle-constants.ts ` +
        `(GENERATION_MODES: ${GENERATION_MODES.join(", ")})`,
    );
  }
  const missingSkill = GENERATION_MODES.filter((mode) => !runnableIds.includes(mode));
  if (missingSkill.length > 0) {
    throw new Error(
      `Generation mode(s) ${missingSkill.join(", ")} have no runnable SKILL.md package under src/mastra/skills/`,
    );
  }
}

function assertUnique(definitions: SkillDefinition[], key: "id" | "order"): void {
  const seen = new Map<unknown, string>();
  for (const definition of definitions) {
    const value = definition[key];
    const previous = seen.get(value);
    if (previous) {
      throw new Error(`Duplicate skill ${key} "${value}" in both ${previous} and ${definition.name}`);
    }
    seen.set(value, definition.name);
  }
}

/** Every skill package, UI order. Parsed once at build time. */
export const SKILL_DEFINITIONS: SkillDefinition[] = loadSkillDefinitions();

/** Only the skills the agent can actually run (roadmap previews excluded). */
export const RUNNABLE_SKILL_DEFINITIONS: SkillDefinition[] = SKILL_DEFINITIONS.filter((s) => s.runnable);
