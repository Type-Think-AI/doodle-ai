#!/usr/bin/env node
// @ts-check
/**
 * webmcp-spec-watch.mjs — Daily upstream WebMCP standard watcher (LANE C).
 *
 * Watches webmachinelearning/webmcp for changes to the WebMCP standard and
 * surfaces them as a REVIEWABLE proposal for this repo. It NEVER rewrites our
 * application code and NEVER auto-merges. A spec change is a human decision.
 * The most this script does is: diff the upstream state against a stored
 * baseline, classify the change, cross-check our code for drift (as
 * SUGGESTIONS only), and emit Markdown + JSON that a CI job can turn into a
 * single deduplicated GitHub issue.
 *
 * Dependency-free. Requires Node 22+ (uses global fetch, node:crypto,
 * node:fs/promises). No token needed for public reads; set GITHUB_TOKEN to
 * raise the REST API rate limit.
 *
 * Flags:
 *   --json          Emit only the machine-readable JSON report to stdout.
 *   --dry-run       Do everything except persist the baseline (implies no write).
 *   --write-state   Persist the fetched upstream state as the new baseline.
 *
 * Exit codes: 0 = ran successfully (change or not). 1 = fatal error (network,
 * parse, etc). CI treats a non-zero exit as a failed run, not as "no change".
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const UPSTREAM_OWNER = 'webmachinelearning';
const UPSTREAM_REPO = 'webmcp';
const UPSTREAM = `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

/** Files whose content we fingerprint to detect meaningful changes. */
const WATCHED_FILES = [
  'index.bs',
  'README.md',
  'declarative-api-explainer.md',
  'implementation-status.md',
  'security-privacy-questionnaire.md',
  'docs/service-workers.md',
];

/** The spec file that defines the actual API surface (breaking-change source). */
const SPEC_FILE = 'index.bs';

const STATE_DIR = join(REPO_ROOT, 'docs', 'webmcp-upstream');
const STATE_PATH = join(STATE_DIR, 'upstream-state.json');

/**
 * WebMCP API members OUR code relies on. If upstream renames/removes one of
 * these in index.bs, that is a potential breakage. Kept in sync with the
 * verified surface in docs/webmcp-agent-testing-brief.md.
 */
const RELIED_ON_MEMBERS = [
  'modelContext',
  'registerTool',
  'getTools',
  'executeTool',
  'inputSchema',
  'readOnlyHint',
  'untrustedContentHint',
  'toolchange',
  'exposedTo',
  'AbortSignal',
];

/**
 * Members that, IF upstream introduces them, represent an OPPORTUNITY for this
 * repo (not a breakage). Maps a member name to the file most likely to change.
 */
const OPPORTUNITY_MEMBERS = {
  outputSchema: 'src/components/agentic/tools-content.ts',
  elicitation: 'src/components/agentic/WebMcpTools.astro',
  progress: 'src/components/agentic/WebMcpTools.astro',
  skills: 'src/components/agentic/tools-content.ts',
  serviceWorker: 'src/components/agentic/WebMcpTools.astro',
};

/** Our files to grep for relied-on / opportunity members. */
const OUR_FILES = [
  'src/components/agentic/WebMcpTools.astro',
  'src/components/agentic/tools-content.ts',
  'scripts/webmcp-smoke.mjs',
];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const OPT = {
  json: args.has('--json'),
  dryRun: args.has('--dry-run'),
  writeState: args.has('--write-state'),
};

// ---------------------------------------------------------------------------
// GitHub REST helpers
// ---------------------------------------------------------------------------

const GH_API = 'https://api.github.com';

/** @param {string} path @param {Record<string,string>} [extraHeaders] */
async function ghFetch(path, extraHeaders = {}) {
  const url = path.startsWith('http') ? path : `${GH_API}${path}`;
  /** @type {Record<string,string>} */
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'doodle-ai-webmcp-spec-watch',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extraHeaders,
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res;
}

/** Fetch raw file content from the default branch; returns null on 404. */
async function fetchRawFile(/** @type {string} */ path) {
  const url = `https://raw.githubusercontent.com/${UPSTREAM}/HEAD/${path}`;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  /** @type {Record<string,string>} */
  const headers = { 'User-Agent': 'doodle-ai-webmcp-spec-watch' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`raw fetch ${res.status} for ${path}`);
  return await res.text();
}

function sha256(/** @type {string} */ text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// WebIDL member extraction
// ---------------------------------------------------------------------------

/**
 * Extract a set of interface/dictionary/member identifiers from a bikeshed
 * (.bs) spec source. This is deliberately heuristic — it does not build a full
 * WebIDL AST. It pulls names from `interface X`, `dictionary X`, enum entries,
 * and member declarations inside idl blocks. The goal is a comparable name set,
 * not a spec-faithful parse.
 * @param {string} bs
 * @returns {string[]} sorted unique identifiers
 */
function extractIdlNames(bs) {
  if (!bs) return [];
  const names = new Set();

  // Grab everything inside <pre class="idl"> ... </pre> / <xmp> blocks; fall
  // back to whole doc if none found (bikeshed variants differ).
  const idlBlocks = [];
  const blockRe = /<(?:pre|xmp)[^>]*\bidl\b[^>]*>([\s\S]*?)<\/(?:pre|xmp)>/gi;
  let m;
  while ((m = blockRe.exec(bs)) !== null) idlBlocks.push(m[1]);
  const idlText = idlBlocks.length ? idlBlocks.join('\n') : bs;

  // interface / dictionary / enum / callback / namespace names
  const declRe = /\b(?:partial\s+)?(?:interface(?:\s+mixin)?|dictionary|enum|namespace|callback(?:\s+interface)?)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((m = declRe.exec(idlText)) !== null) names.add(m[1]);

  // Members are matched by the identifier that sits immediately before the
  // punctuation that ends its declaration — `(` for a method, `;` or `=` for an
  // attribute / dictionary member. We do NOT try to parse the return type: it
  // can nest generics arbitrarily (`Promise<sequence<RegisteredTool>>`), which
  // a type-anchored regex mishandles. Requiring at least one whitespace-and-word
  // of "type" before the name keeps bare parenthesised prose from matching.

  // methods: `<type...> name(`
  const methodRe = /(?:^|\n)\s*(?:\[[^\]]*\]\s*)?(?:static\s+)?[A-Za-z_][A-Za-z0-9_<>?, ]*?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  while ((m = methodRe.exec(idlText)) !== null) names.add(m[1]);

  // attributes: `attribute <type...> name;`
  const attrRe = /\battribute\s+(?:[A-Za-z_][A-Za-z0-9_<>?, ]*?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  while ((m = attrRe.exec(idlText)) !== null) names.add(m[1]);

  // dictionary members: `<type...> name;` or `... name = default;`
  const dictMemberRe = /(?:^|\n)\s*(?:required\s+)?[A-Za-z_][A-Za-z0-9_<>?, ]*?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|;)/g;
  while ((m = dictMemberRe.exec(idlText)) !== null) names.add(m[1]);

  // The event handler `attribute EventHandler ontoolchange;` implies a
  // `toolchange` event — our brief and code refer to the event name. Record it
  // so a rename of the event surfaces as an IDL delta.
  if (names.has('ontoolchange') || /\bontoolchange\b/.test(idlText)) names.add('toolchange');

  // Drop obvious WebIDL keywords / types that leaked through.
  const NOISE = new Set([
    'attribute', 'readonly', 'required', 'partial', 'interface', 'dictionary',
    'enum', 'namespace', 'callback', 'static', 'optional', 'Promise', 'sequence',
    'object', 'DOMString', 'USVString', 'boolean', 'undefined', 'Window',
    'EventHandler', 'EventTarget', 'long', 'unsigned', 'double', 'any', 'void',
    'true', 'false', 'null', 'record', 'FrozenArray', 'DOMException',
  ]);
  return [...names].filter((n) => !NOISE.has(n)).sort();
}

// ---------------------------------------------------------------------------
// Upstream state collection
// ---------------------------------------------------------------------------

async function collectUpstreamState() {
  // Latest commit on default branch.
  const commitsRes = await ghFetch(`/repos/${UPSTREAM}/commits?per_page=1`);
  const commits = await commitsRes.json();
  const head = commits[0];
  const latestCommit = {
    sha: head?.sha ?? null,
    message: (head?.commit?.message ?? '').split('\n')[0].slice(0, 200),
    date: head?.commit?.author?.date ?? head?.commit?.committer?.date ?? null,
    url: head?.html_url ?? null,
  };

  // Watched file content hashes (+ IDL names for the spec file).
  /** @type {Record<string,{hash:string|null,exists:boolean,bytes:number}>} */
  const files = {};
  /** @type {string[]} */
  let idlNames = [];
  for (const path of WATCHED_FILES) {
    const content = await fetchRawFile(path);
    files[path] = content == null
      ? { hash: null, exists: false, bytes: 0 }
      : { hash: sha256(content), exists: true, bytes: Buffer.byteLength(content, 'utf8') };
    if (path === SPEC_FILE && content != null) idlNames = extractIdlNames(content);
  }

  // Issues + PRs updated in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const issuesRes = await ghFetch(
    `/repos/${UPSTREAM}/issues?state=open&sort=updated&direction=desc&since=${since}&per_page=50`,
  );
  const issuesRaw = await issuesRes.json();
  const recentIssues = [];
  const recentPRs = [];
  for (const it of issuesRaw) {
    const entry = { number: it.number, title: (it.title || '').slice(0, 200), url: it.html_url, updated_at: it.updated_at };
    if (it.pull_request) recentPRs.push(entry);
    else recentIssues.push(entry);
  }

  // Release / tag counts (some repos use neither).
  let releases = [];
  try {
    const relRes = await ghFetch(`/repos/${UPSTREAM}/releases?per_page=10`);
    const rel = await relRes.json();
    releases = rel.map((/** @type {any} */ r) => ({ tag: r.tag_name, name: r.name, url: r.html_url, published_at: r.published_at }));
  } catch { /* releases endpoint may 404 on some repos */ }

  let latestTag = null;
  try {
    const tagRes = await ghFetch(`/repos/${UPSTREAM}/tags?per_page=1`);
    const tags = await tagRes.json();
    latestTag = tags[0]?.name ?? null;
  } catch { /* no tags */ }

  // Coarse open counts (Search API total, best-effort — not critical).
  let openIssuesCount = null;
  let openPRsCount = null;
  try {
    const s1 = await ghFetch(`/search/issues?q=repo:${UPSTREAM}+type:issue+state:open&per_page=1`);
    openIssuesCount = (await s1.json()).total_count ?? null;
    const s2 = await ghFetch(`/search/issues?q=repo:${UPSTREAM}+type:pr+state:open&per_page=1`);
    openPRsCount = (await s2.json()).total_count ?? null;
  } catch { /* search rate limited without token — tolerated */ }

  return {
    schema: 1,
    upstream: UPSTREAM,
    fetched_at: new Date().toISOString(),
    latestCommit,
    files,
    idlNames,
    latestTag,
    releaseCount: releases.length,
    releases,
    openIssuesCount,
    openPRsCount,
    // recent activity is transient (24h window) — informational, not baselined
    recentIssues,
    recentPRs,
  };
}

// ---------------------------------------------------------------------------
// Baseline persistence
// ---------------------------------------------------------------------------

async function readBaseline() {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {Record<string, any>} state */
async function writeBaseline(state) {
  await mkdir(STATE_DIR, { recursive: true });
  // Store only durable fields — drop the 24h transient activity so the baseline
  // does not churn every run.
  const { recentIssues, recentPRs, ...durable } = state;
  await writeFile(STATE_PATH, JSON.stringify(durable, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Our-code drift cross-check (SUGGESTIONS only)
// ---------------------------------------------------------------------------

/** @param {string[]} idlNames */
async function crossCheckOurCode(idlNames) {
  /** @type {Record<string,string>} */
  const memberContents = {};
  for (const rel of OUR_FILES) {
    try {
      memberContents[rel] = await readFile(join(REPO_ROOT, rel), 'utf8');
    } catch {
      memberContents[rel] = '';
    }
  }
  const allOurCode = Object.values(memberContents).join('\n');

  // Which relied-on members do we actually reference?
  const usedByUs = RELIED_ON_MEMBERS.filter((mem) => allOurCode.includes(mem));

  // Of the members we use, which are ABSENT from the current upstream IDL name
  // set? (Only meaningful when idlNames is non-empty.) This is the drift signal.
  const idlSet = new Set(idlNames);
  const missingUpstream = idlNames.length
    ? usedByUs.filter((mem) => !idlSet.has(mem) && !allOurCode.includes(`// non-idl:${mem}`))
      // AbortSignal is a platform type, not a WebMCP member — never flag it.
      .filter((mem) => mem !== 'AbortSignal')
    : [];

  // Opportunities: upstream member present that we do not yet use.
  const opportunities = [];
  for (const [mem, file] of Object.entries(OPPORTUNITY_MEMBERS)) {
    const upstreamHasIt = idlSet.has(mem) || (idlNames.length === 0 ? false : idlNames.some((/** @type {string} */ n) => n.toLowerCase() === mem.toLowerCase()));
    const weUseIt = allOurCode.includes(mem);
    if (upstreamHasIt && !weUseIt) opportunities.push({ member: mem, file });
  }

  return { usedByUs, missingUpstream, opportunities };
}

// ---------------------------------------------------------------------------
// Diff + classification
// ---------------------------------------------------------------------------

/**
 * @param {any} baseline
 * @param {any} current
 * @param {{missingUpstream:string[],opportunities:{member:string,file:string}[]}} drift
 */
function classify(baseline, current, drift) {
  if (!baseline) {
    return {
      status: 'NEW_BASELINE',
      changed: false,
      summary: 'First run — establishing baseline. No comparison performed.',
      fileChanges: [],
      commitChanged: false,
      idlAdded: [],
      idlRemoved: [],
      categories: [],
    };
  }

  const commitChanged = baseline.latestCommit?.sha !== current.latestCommit?.sha;

  const fileChanges = [];
  for (const path of WATCHED_FILES) {
    const before = baseline.files?.[path]?.hash ?? null;
    const after = current.files?.[path]?.hash ?? null;
    if (before !== after) {
      fileChanges.push({
        path,
        before,
        after,
        kind: before == null ? 'added' : after == null ? 'removed' : 'modified',
      });
    }
  }

  const beforeIdl = new Set(baseline.idlNames ?? []);
  const afterIdl = new Set(current.idlNames ?? []);
  const idlAdded = [...afterIdl].filter((n) => !beforeIdl.has(n)).sort();
  const idlRemoved = [...beforeIdl].filter((n) => !afterIdl.has(n)).sort();

  const categories = [];
  const specChanged = fileChanges.some((f) => f.path === SPEC_FILE);
  const implChanged = fileChanges.some((f) => f.path === 'implementation-status.md');
  const declChanged = fileChanges.some((f) => f.path === 'declarative-api-explainer.md');
  const docsChanged = fileChanges.some(
    (f) => f.path !== SPEC_FILE && f.path !== 'implementation-status.md' && f.path !== 'declarative-api-explainer.md',
  );

  if (specChanged) categories.push('SPEC_CHANGE');
  if (implChanged) categories.push('IMPL_STATUS_CHANGE');
  if (declChanged) categories.push('DECLARATIVE_API_GUIDANCE');
  if (docsChanged) categories.push('DOCS_ONLY');
  if (drift.missingUpstream.length) categories.push('POSSIBLE_BREAKAGE');
  if (drift.opportunities.length) categories.push('OPPORTUNITY');

  const changed = commitChanged || fileChanges.length > 0;

  let status;
  if (!changed) status = 'NO_CHANGE';
  else if (specChanged) status = 'SPEC_CHANGE';
  else if (implChanged || declChanged) status = 'GUIDANCE_CHANGE';
  else if (docsChanged) status = 'DOCS_ONLY';
  else status = 'COMMIT_ONLY'; // new commit(s) but none of our watched files moved

  return { status, changed, fileChanges, commitChanged, idlAdded, idlRemoved, categories };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, any>} current
 * @param {Record<string, any>} cls
 * @param {Record<string, any>} drift
 */
function renderMarkdown(current, cls, drift) {
  const L = [];
  const c = current.latestCommit;
  L.push(`# [webmcp-watch] Upstream status: ${cls.status}`);
  L.push('');
  L.push(`Watched repo: [${UPSTREAM}](https://github.com/${UPSTREAM}) · fetched \`${current.fetched_at}\``);
  L.push('');
  L.push(`- Latest commit: \`${c.sha ? c.sha.slice(0, 12) : 'n/a'}\` — ${c.message || '(no message)'}`);
  L.push(`  - date: ${c.date ?? 'n/a'}${c.url ? ` · [view](${c.url})` : ''}`);
  L.push(`- Open issues: ${current.openIssuesCount ?? 'n/a'} · open PRs: ${current.openPRsCount ?? 'n/a'}`);
  L.push(`- Latest tag: ${current.latestTag ?? 'none'} · releases: ${current.releaseCount}`);
  L.push('');

  if (cls.status === 'NEW_BASELINE') {
    L.push('## New baseline established');
    L.push('');
    L.push('This is the first run. The current upstream state has been recorded as the');
    L.push('baseline. Future runs will diff against it. Nothing changed, nothing to act on.');
    L.push('');
    L.push(`Fingerprinted ${WATCHED_FILES.length} files; extracted ${current.idlNames.length} IDL identifiers from \`${SPEC_FILE}\`.`);
    return L.join('\n');
  }

  if (!cls.changed) {
    L.push('## No change');
    L.push('');
    L.push('Head commit and all watched file hashes match the baseline. No action needed.');
    return L.join('\n');
  }

  L.push(`## Classification: ${cls.categories.join(', ') || cls.status}`);
  L.push('');

  if (cls.fileChanges.length) {
    L.push('### Changed watched files');
    L.push('');
    L.push('| File | Change |');
    L.push('|---|---|');
    for (const f of cls.fileChanges) L.push(`| \`${f.path}\` | ${f.kind} |`);
    L.push('');
  }

  if (cls.categories.includes('SPEC_CHANGE')) {
    L.push('### ⚠️ SPEC CHANGE — `index.bs` moved');
    L.push('');
    L.push('The normative spec source changed. Review the WebIDL delta below against the');
    L.push('surface we depend on before touching any of our tool code.');
    L.push('');
    if (cls.idlAdded.length) {
      L.push('**IDL identifiers added upstream:**');
      L.push('');
      L.push(cls.idlAdded.map((/** @type {string} */ n) => `\`${n}\``).join(', '));
      L.push('');
    }
    if (cls.idlRemoved.length) {
      L.push('**IDL identifiers removed upstream:**');
      L.push('');
      L.push(cls.idlRemoved.map((/** @type {string} */ n) => `\`${n}\``).join(', '));
      L.push('');
    }
    if (!cls.idlAdded.length && !cls.idlRemoved.length) {
      L.push('_No IDL identifier names added or removed — the change is likely prose,');
      L.push('examples, or member semantics rather than a rename. Read the diff manually._');
      L.push('');
    }
  }

  if (drift.missingUpstream.length) {
    L.push('### 🚨 Possible breakage — members we rely on are absent from current IDL');
    L.push('');
    L.push('These identifiers appear in OUR code but were not found in the current upstream');
    L.push('`index.bs` IDL name set. Heuristic — verify manually before acting:');
    L.push('');
    for (const mem of drift.missingUpstream) L.push(`- \`${mem}\``);
    L.push('');
  }

  if (drift.opportunities.length) {
    L.push('### 💡 Opportunities — upstream members we do not use yet');
    L.push('');
    for (const o of drift.opportunities) L.push(`- \`${o.member}\` → would likely be adopted in \`${o.file}\``);
    L.push('');
  }

  if (current.recentIssues.length || current.recentPRs.length) {
    L.push('### Upstream activity in the last 24h');
    L.push('');
    for (const it of current.recentIssues.slice(0, 15)) L.push(`- issue #${it.number}: [${it.title}](${it.url})`);
    for (const pr of current.recentPRs.slice(0, 15)) L.push(`- PR #${pr.number}: [${pr.title}](${pr.url})`);
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('## Proposed action checklist (human decision — nothing is automated)');
  L.push('');
  L.push('- [ ] Read the upstream diff for the changed files listed above.');
  if (cls.categories.includes('SPEC_CHANGE')) {
    L.push('- [ ] Confirm no member in `docs/webmcp-agent-testing-brief.md` was renamed/removed.');
    L.push('- [ ] If a relied-on member changed, update `src/components/agentic/WebMcpTools.astro` and `tools-content.ts` — MANUALLY, in a reviewed PR.');
    L.push('- [ ] Re-run `scripts/webmcp-smoke.mjs` against Canary after any code change.');
  }
  if (cls.categories.includes('IMPL_STATUS_CHANGE')) {
    L.push('- [ ] Check whether browser support moved (Chrome stable? other engines?) and update our docs/claims.');
  }
  if (cls.categories.includes('DECLARATIVE_API_GUIDANCE')) {
    L.push('- [ ] Review declarative form guidance vs our `submit_doodle_feedback` / `create_doodle_board` forms.');
  }
  if (drift.opportunities.length) {
    L.push('- [ ] Evaluate each opportunity member — adopt only if it earns its keep.');
  }
  L.push('- [ ] Update `docs/webmcp-agent-testing-brief.md` if the verified surface changed.');
  L.push('- [ ] Close this issue once reviewed; the baseline advances automatically on the next scheduled run.');
  L.push('');
  L.push('> This watcher NEVER edits application code and NEVER merges. It only reports.');

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const baseline = await readBaseline();
  const current = await collectUpstreamState();
  const drift = await crossCheckOurCode(current.idlNames);
  const cls = classify(baseline, current, drift);

  const markdown = renderMarkdown(current, cls, drift);

  const report = {
    status: cls.status,
    changed: cls.changed,
    categories: cls.categories,
    upstream: UPSTREAM,
    fetched_at: current.fetched_at,
    latestCommit: current.latestCommit,
    openIssuesCount: current.openIssuesCount,
    openPRsCount: current.openPRsCount,
    latestTag: current.latestTag,
    releaseCount: current.releaseCount,
    fileChanges: cls.fileChanges,
    idlAdded: cls.idlAdded,
    idlRemoved: cls.idlRemoved,
    idlNameCount: current.idlNames.length,
    drift,
    recentIssues: current.recentIssues,
    recentPRs: current.recentPRs,
    // The stable issue title CI dedupes on.
    issueTitle: `[webmcp-watch] Upstream WebMCP change: ${cls.status}`,
    markdown,
    // Tell CI whether an issue should exist. NEW_BASELINE and NO_CHANGE => none.
    shouldFileIssue: cls.changed === true,
    // Declared here (not bolted on later) so the object's shape is complete at
    // construction; it is set to the real value once the baseline write runs.
    stateWritten: false,
    baselineExisted: baseline != null,
  };

  // Persist baseline only when explicitly asked AND not a dry run.
  let stateWritten = false;
  if (OPT.writeState && !OPT.dryRun) {
    await writeBaseline(current);
    stateWritten = true;
  }
  report.stateWritten = stateWritten;

  if (OPT.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(markdown + '\n');
    if (OPT.dryRun) process.stderr.write('\n[dry-run] baseline NOT written.\n');
    else if (stateWritten) process.stderr.write(`\n[state] baseline written to ${STATE_PATH}\n`);
    else process.stderr.write('\n[state] baseline unchanged (pass --write-state to advance).\n');
  }
}

main().catch((err) => {
  process.stderr.write(`webmcp-spec-watch: FATAL ${err?.stack || err}\n`);
  process.exit(1);
});
