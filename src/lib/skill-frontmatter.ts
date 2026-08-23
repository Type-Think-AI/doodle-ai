/* Minimal YAML-frontmatter parser for SKILL.md files.

   Deliberately supports only the small, unambiguous subset our skill
   packages actually use, and throws a descriptive error on anything else
   rather than silently mis-parsing. Because src/lib/skill-loader.ts parses
   every SKILL.md eagerly at module load (build time), a malformed skill
   fails `astro build` loudly instead of shipping broken metadata.

   Supported value forms:
     key: bare string          -> string
     key: "quoted"             -> string  (\" and \\ escapes)
     key: 'quoted'             -> string  ('' escapes a single quote)
     key: true | false         -> boolean
     key: 42 | 1.5 | -3        -> number
     key: [a, b, "c"]          -> string[]
     key:                      -> nested block, one level deep only
       subkey: ...

   Not supported (throws): tabs, block scalars (| and >), "- " sequences,
   nesting more than one level, and inline maps.

   A YAML library would handle more, but this keeps the parser dependency-free
   in the client bundle — src/lib/skills.ts (which feeds the composer's "/"
   picker) imports this too, not just the server-side agent. */

export type FrontmatterScalar = string | number | boolean | string[];
export type FrontmatterValue = FrontmatterScalar | Record<string, FrontmatterScalar>;
export type Frontmatter = Record<string, FrontmatterValue>;

export interface ParsedSkillFile {
  frontmatter: Frontmatter;
  /** Everything after the closing `---`, trimmed — the skill's instructions. */
  body: string;
}

function fail(filePath: string, lineNumber: number, message: string): never {
  throw new Error(`${filePath}:${lineNumber} — ${message}`);
}

function unquote(raw: string, filePath: string, lineNumber: number): string {
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2) fail(filePath, lineNumber, "unterminated double-quoted string");
    return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) fail(filePath, lineNumber, "unterminated single-quoted string");
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

function parseScalar(raw: string, filePath: string, lineNumber: number): FrontmatterScalar {
  const value = raw.trim();
  if (value.startsWith("|") || value.startsWith(">")) {
    fail(filePath, lineNumber, "block scalars (| and >) are not supported — use a quoted single-line string");
  }
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) fail(filePath, lineNumber, "unterminated inline array");
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((entry) => unquote(entry.trim(), filePath, lineNumber));
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return unquote(value, filePath, lineNumber);
}

/**
 * Split a SKILL.md into its frontmatter map and its markdown body.
 *
 * @param raw      Full file contents.
 * @param filePath Only used to make error messages point at the right file.
 */
export function parseSkillFile(raw: string, filePath: string): ParsedSkillFile {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${filePath} — must start with a \`---\` frontmatter block`);
  }
  const closingIndex = normalized.indexOf("\n---", 3);
  if (closingIndex === -1) {
    throw new Error(`${filePath} — frontmatter block is never closed with \`---\``);
  }

  const frontmatterText = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 4).trim();

  const frontmatter: Frontmatter = {};
  let currentBlock: Record<string, FrontmatterScalar> | null = null;

  frontmatterText.split("\n").forEach((line, index) => {
    // +2: frontmatter body starts on file line 2.
    const lineNumber = index + 2;
    if (!line.trim() || line.trim().startsWith("#")) return;
    if (line.includes("\t")) fail(filePath, lineNumber, "tabs are not allowed in frontmatter — use spaces");

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) fail(filePath, lineNumber, "`- ` sequences are not supported — use an inline array");

    const separator = trimmed.indexOf(":");
    if (separator === -1) fail(filePath, lineNumber, "expected `key: value`");
    const key = trimmed.slice(0, separator).trim();
    const rest = trimmed.slice(separator + 1).trim();
    if (!key) fail(filePath, lineNumber, "missing key before `:`");

    if (indent === 0) {
      if (!rest) {
        currentBlock = {};
        frontmatter[key] = currentBlock;
        return;
      }
      currentBlock = null;
      frontmatter[key] = parseScalar(rest, filePath, lineNumber);
      return;
    }

    if (!currentBlock) fail(filePath, lineNumber, "indented line does not belong to a parent key");
    if (!rest) fail(filePath, lineNumber, "nesting deeper than one level is not supported");
    currentBlock[key] = parseScalar(rest, filePath, lineNumber);
  });

  return { frontmatter, body };
}
