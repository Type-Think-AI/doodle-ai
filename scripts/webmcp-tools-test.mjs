#!/usr/bin/env node
/**
 * WebMCP tool-expansion CONFORMANCE TEST — Lane F acceptance gate.
 *
 * WHAT THIS IS
 * ------------
 * The acceptance gate for the WebMCP tool-expansion wave (lanes A–E). It drives
 * a real Chrome Canary against the live dev server and asserts that the new
 * discovery / skill / site-map / pagination tools are registered, schema-valid,
 * budget-capped, executable, cancellable, route-scoped, and — the whole point of
 * the wave — that an agent can PAGINATE THROUGH A WHOLE ARTICLE in 1,500-char
 * pieces. See docs/webmcp-lane-brief.md for the tool contract and content facts.
 *
 * WHY A REAL BROWSER
 * ------------------
 * WebMCP tool registration only runs inside a browser that exposes
 * `document.modelContext`. Nothing in tsc / unit tests / the build exercises it,
 * so a regression ships silently. This test closes that gap.
 *
 * PLUMBING PROVENANCE
 * -------------------
 * The browser bootstrap (Canary spawned as Node's own child, throwaway profile
 * with the enable-webmcp-testing lab seeded into Local State, --remote-allow-
 * origins=* for Node's Origin-sending WebSocket, --no-sandbox/--disable-gpu for
 * the restricted macOS profile, zero npm deps) and the ENUMERATE_TOOLS /
 * EXECUTE_TOOL CDP helpers are copied VERBATIM from scripts/webmcp-smoke.mjs —
 * they already solve every hard part. This file adds the tool-expansion and
 * pagination assertions on top and does NOT import from or edit that file.
 *
 * TWO PROVEN CHROME QUIRKS honoured below:
 *  - executeTool's IDL says it takes an object, but Canary 154 JSON.parse()s
 *    what it gets, so a real object becomes JSON.parse('[object Object]') and
 *    every call fails. We send the PRE-STRINGIFIED JSON form first, then fall
 *    back to the object form.
 *  - executeTool resolves to a SERIALISED result and tools now return the MCP
 *    envelope { content: [{ type: 'text', text }] }. We parse one JSON layer and
 *    join content[].text before measuring; the 1,500-char budget is the TEXT,
 *    not the JSON punctuation. Canary also sometimes serialises inputSchema as a
 *    JSON string, so it is normalised before validation.
 *
 * USAGE
 * -----
 *   node scripts/webmcp-tools-test.mjs [baseUrl]        # default localhost:4321
 *   HEADFUL=1 node scripts/webmcp-tools-test.mjs        # watch it run
 *
 * Exits 0 when every assertion passes, 1 otherwise (with a FAIL list).
 * The new tools may not be wired into the page yet — a missing tool is a clear
 * named FAILURE, never a crash. A test failing for the right reason is the point.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ---------------------------------------------------------------- config -- */

const CANARY_BIN =
  process.env.CANARY_BIN ||
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';

const SCRATCH = process.env.KIROCREW_SCRATCH || tmpdir();
const PROFILE = join(SCRATCH, `canary-webmcp-tools-${process.pid}`);

const PORT = Number(process.env.WEBMCP_CDP_PORT || 9355);
const CDP = `http://127.0.0.1:${PORT}`;

const RAW_BASE = process.argv[2] || process.env.WEBMCP_BASE_URL || 'http://localhost:4321';
const BASE = RAW_BASE.replace(/\/+$/, '');
const HEADLESS = process.env.HEADFUL !== '1';

/** Google's ceiling for a single WebMCP tool output. Enforced on every result. */
const HARD_CAP = 1500;

/** Per-parameter description ceiling from the lane brief. */
const PARAM_DESC_CAP = 150;

/** The article we exercise pagination against (a large, section-rich guide). */
const PAGINATE_ARTICLE = '/photo-to-cartoon/';

/** Bound every walk so a broken tool cannot loop forever. */
const MAX_WALK_STEPS = 60;

/* ---- Expected surface (built in parallel by other lanes) ---------------- */

/*
 * Global tools — should register on every non-excluded route. Each entry is the
 * argument payload used to EXECUTE it (read-only tools only). open_doodle_page
 * is navigational, so it is enumerated but never executed here.
 */
const GLOBAL_TOOLS = {
  get_doodle_overview: { kind: 'read', args: '{}' },
  list_doodle_skills: { kind: 'read', args: '{"limit":8}' },
  get_doodle_skill: { kind: 'read', args: '{"id":"normal"}' },
  search_doodle_articles: { kind: 'read', args: '{"query":"cartoon"}' },
  get_doodle_article: { kind: 'read', args: '{"url":"/photo-to-cartoon/"}' },
  open_doodle_page: { kind: 'nav', args: '{"page":"home"}' },
  list_doodle_articles: { kind: 'read', args: '{}' },
  list_article_sections: { kind: 'read', args: `{"url":"${PAGINATE_ARTICLE}"}` },
  read_article_section: { kind: 'read', args: `{"url":"${PAGINATE_ARTICLE}","section":"__RESOLVE__"}` },
  read_article_page: { kind: 'read', args: `{"url":"${PAGINATE_ARTICLE}","page":1}` },
  find_doodle_answer: { kind: 'read', args: '{"query":"how do I turn a photo into a cartoon"}' },
  list_doodle_topics: { kind: 'read', args: '{}' },
  get_article_faq: { kind: 'read', args: '{"url":"/ai-cartoon-generator/"}' },
  get_prompt_pack: { kind: 'read', args: '{}' },
  list_doodle_pages: { kind: 'read', args: '{}' },
  browse_doodle_learn: { kind: 'read', args: '{}' },
};

/** Tools scoped to a single skill page (/skills/<id>), NOT the /skills/ index. */
const SKILL_PAGE_TOOLS = ['get_doodle_skill_guide', 'compare_doodle_skills'];

/** Declarative forms (DOM tools, not modelContext.registerTool). */
const HOMEPAGE_DECLARATIVE = ['submit_doodle_feedback'];
const BOARDS_DECLARATIVE = ['create_doodle_board'];

/** A concrete skill page to test route scoping on. */
const SKILL_PAGE_ROUTE = '/skills/normal/';

/* --------------------------------------------------------------- helpers -- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const notes = [];
let passed = 0;
function check(ok, message) {
  if (ok) {
    passed += 1;
    console.log(`  \u2713 ${message}`);
  } else {
    console.log(`  \u2717 ${message}`);
    failures.push(message);
  }
  return ok;
}
function note(message) {
  console.log(`  \u00b7 ${message}`);
  notes.push(message);
}

/* ------------------------------------------------------------ browser ---- */
/* Copied verbatim from scripts/webmcp-smoke.mjs — see PLUMBING PROVENANCE. */

function startBrowser() {
  if (!existsSync(CANARY_BIN)) {
    throw new Error(
      `Chrome Canary not found at:\n  ${CANARY_BIN}\n` +
        'Install Google Chrome Canary, or set CANARY_BIN to its executable path.',
    );
  }
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  writeFileSync(
    join(PROFILE, 'Local State'),
    JSON.stringify({ browser: { enabled_labs_experiments: ['enable-webmcp-testing@1'] } }),
  );

  const args = [
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-crash-reporter',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank',
  ];
  if (HEADLESS) args.unshift('--headless=new');

  const child = spawn(CANARY_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {});
  return child;
}

async function waitForCdp(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${CDP}/json/version`);
      if (r.ok) return (await r.json()).Browser;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  throw new Error(`CDP never became reachable on ${CDP} (is Canary starting up?)`);
}

async function pageTarget() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error(`no page target: ${JSON.stringify(targets.map((t) => t.type))}`);
  return page;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params }));
          return new Promise((res, rej) => pending.set(msgId, { res, rej }));
        },
        close: () => ws.close(),
      }),
    );
    ws.addEventListener('error', () => reject(new Error('websocket error connecting to DevTools')));
    ws.addEventListener('close', (e) => {
      const err = new Error(`devtools socket closed (code ${e.code})`);
      for (const p of pending.values()) p.rej(err);
      pending.clear();
      reject(err);
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = msg.id && pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
      }
    });
  });
}

async function ev(client, expression) {
  const r = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await sleep(4000);
}

/* -------------------------------------------------- in-page CDP helpers -- */
/* ENUMERATE_TOOLS and EXECUTE_TOOL copied verbatim from webmcp-smoke.mjs, incl.
   the inputSchema normaliser and the MCP-envelope unwrap. Per-param description
   lengths are added to enumeration for this lane's schema depth assertion. */

const ENUMERATE_TOOLS = `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { api: false, tools: [] };
  const raw = await mc.getTools();
  const parseSchema = (s) => {
    if (s && typeof s === 'object') return s;
    if (typeof s === 'string') { try { return JSON.parse(s); } catch { return null; } }
    return null;
  };
  const tools = raw.map((t) => {
    const schema = parseSchema(t.inputSchema);
    const props = schema && schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const paramDescs = Object.keys(props).map((k) => ({
      name: k,
      descLen: (props[k] && typeof props[k].description === 'string' ? props[k].description : '').length,
    }));
    return {
      name: t.name,
      nameLen: (t.name || '').length,
      description: t.description || '',
      descLen: (t.description || '').length,
      schemaType: schema ? schema.type : null,
      hasProps: !!(schema && schema.properties && typeof schema.properties === 'object'),
      requiredIsArray: !!(schema && Array.isArray(schema.required)),
      required: schema && Array.isArray(schema.required) ? schema.required : null,
      paramDescs,
      readOnly: !!(t.annotations && t.annotations.readOnlyHint),
      untrusted: !!(t.annotations && t.annotations.untrustedContentHint),
    };
  });
  return { api: true, tools, names: tools.map((t) => t.name) };
})()`;

/**
 * Execute one tool by name in-page. Honours the two Chrome quirks:
 * sends pre-stringified JSON args first, falls back to the object form, and
 * unwraps the MCP content envelope before measuring length.
 */
const EXECUTE_TOOL = (name, argsJson) => `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { ok: false, error: 'NO_API' };
  const tool = (await mc.getTools()).find((t) => t.name === ${JSON.stringify(name)});
  if (!tool) return { ok: false, error: 'NOT_FOUND' };
  const argStr = ${JSON.stringify(argsJson)};
  let obj; try { obj = JSON.parse(argStr); } catch { obj = {}; }
  const run = async (payload) => mc.executeTool(tool, payload);
  let r;
  try {
    // Quirk 1: Canary JSON.parse()s what it gets, so the string form is primary.
    r = await run(argStr);
  } catch (e1) {
    try { r = await run(obj); }
    catch (e2) { return { ok: false, error: String(e2 || e1).slice(0, 160) }; }
  }
  try {
    const wire = typeof r === 'string' ? r : JSON.stringify(r);
    // Quirk 2: unwrap the MCP content envelope; budget is measured on TEXT.
    let text = wire;
    let enveloped = false;
    try {
      const parsed = typeof r === 'string' ? JSON.parse(r) : r;
      if (parsed && Array.isArray(parsed.content)) {
        enveloped = true;
        text = parsed.content.map((c) => c.text != null ? c.text : JSON.stringify(c)).join('\\n');
      }
    } catch { /* bare string result, measured as-is */ }
    return {
      ok: true,
      len: text.length,
      wireLen: wire.length,
      enveloped,
      valueType: typeof r,
      full: text,
      head: text.slice(0, 120).replace(/\\s+/g, ' '),
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
})()`;

/** Execute with an AbortSignal firing at 1ms; the call must SETTLE, not hang. */
const EXECUTE_TOOL_ABORTED = (name, argsJson) => `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  const tool = (await mc.getTools()).find((t) => t.name === ${JSON.stringify(name)});
  if (!tool) return { settled: false, error: 'NOT_FOUND' };
  const ac = new AbortController();
  const started = Date.now();
  const argStr = ${JSON.stringify(argsJson)};
  const call = (async () => {
    try { return await mc.executeTool(tool, argStr, { signal: ac.signal }); }
    catch (e1) {
      let obj; try { obj = JSON.parse(argStr); } catch { obj = {}; }
      return mc.executeTool(tool, obj, { signal: ac.signal });
    }
  })();
  setTimeout(() => ac.abort(), 1);
  const timeout = new Promise((r) => setTimeout(() => r('__TIMEOUT__'), 8000));
  try {
    const r = await Promise.race([call, timeout]);
    if (r === '__TIMEOUT__') return { settled: false, ms: Date.now() - started };
    return { settled: true, ms: Date.now() - started, outcome: 'resolved' };
  } catch (e) {
    return { settled: true, ms: Date.now() - started, outcome: 'rejected:' + (e && e.name ? e.name : 'Error') };
  }
})()`;

/** Collect declarative form toolnames present in the DOM. */
const DECLARATIVE_FORMS = `JSON.stringify(
  [...document.querySelectorAll('form[toolname]')].map((f) => f.getAttribute('toolname'))
)`;

/* ---------------------------------------------------- shared helpers ------ */

/** Enumerate the current route's tools; returns { api, tools, names, byName }. */
async function enumerate(client) {
  const r = await ev(client, ENUMERATE_TOOLS);
  const tools = r.tools ?? [];
  return { api: r.api === true, tools, names: r.names ?? [], byName: new Map(tools.map((t) => [t.name, t])) };
}

/** Execute a read-only tool and return the parsed result object. */
async function exec(client, name, argsJson) {
  return ev(client, EXECUTE_TOOL(name, argsJson));
}

/* ------------------------------------------------------------------ main -- */

const child = startBrowser();
let code = 0;

try {
  const browser = await waitForCdp();
  console.log(`browser  : ${browser}${HEADLESS ? ' (headless=new)' : ' (headful)'}`);
  console.log(`base URL : ${BASE}`);

  const client = await connect((await pageTarget()).webSocketDebuggerUrl);
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  /* ============================ HOMEPAGE ============================ */
  console.log(`\n=== homepage (${BASE}/) ===`);
  await navigate(client, `${BASE}/`);

  let title;
  try {
    title = await ev(client, 'document.title');
  } catch (e) {
    throw new Error(`Could not read the homepage — is a dev server running at ${BASE}? (${e.message})`);
  }
  note(`title: ${title}`);

  const apiType = await ev(client, 'typeof (document.modelContext || navigator.modelContext)');
  check(apiType === 'object', 'document.modelContext (or navigator.modelContext) exists');
  if (apiType !== 'object') {
    throw new Error('WebMCP API absent — enable-webmcp-testing flag not active in this Canary build.');
  }

  const home = await enumerate(client);
  check(home.api === true, 'modelContext exposes getTools() on homepage');
  note(`homepage tools (${home.names.length}): ${home.names.join(', ') || '(none)'}`);

  /* -- (7) no duplicate tool names on this route -- */
  const homeDupes = home.names.filter((n, i) => home.names.indexOf(n) !== i);
  check(homeDupes.length === 0, `homepage has no duplicate tool names (dupes: ${homeDupes.join(', ') || 'none'})`);

  /* -- global tools all present -- */
  console.log('\n  -- global tool surface present on homepage --');
  for (const name of Object.keys(GLOBAL_TOOLS)) {
    check(home.byName.has(name), `homepage registers global tool: ${name}`);
  }

  /* -- skill-page-only tools MUST NOT appear on the homepage (route scoping) -- */
  for (const name of SKILL_PAGE_TOOLS) {
    check(!home.byName.has(name), `homepage does NOT register skill-page tool: ${name}`);
  }

  /* -- (1) per-tool schema + name/description/param-description budgets -- */
  console.log('\n  -- (1) per-tool schema & length budgets --');
  for (const t of home.tools) {
    check(t.nameLen >= 1 && t.nameLen <= 30, `${t.name}: name length ${t.nameLen} within 1..30`);
    check(t.descLen >= 1 && t.descLen <= 500, `${t.name}: description length ${t.descLen} within 1..500`);
    check(
      t.schemaType === 'object' && t.hasProps && t.requiredIsArray,
      `${t.name}: inputSchema is object w/ properties object + array 'required'`,
    );
    const longParam = t.paramDescs.find((p) => p.descLen > PARAM_DESC_CAP);
    check(
      !longParam,
      `${t.name}: every parameter description <= ${PARAM_DESC_CAP}${longParam ? ` (${longParam.name}=${longParam.descLen})` : ''}`,
    );
  }

  /* -- (2) every read-only tool executes, returns envelope, text <= 1500 -- */
  console.log('\n  -- (2) read-only tools execute, envelope, output <= 1500 --');
  // Resolve a real section slug once, so read_article_section can be executed.
  let firstSlug = null;
  if (home.byName.has('list_article_sections')) {
    const secRes = await exec(client, 'list_article_sections', GLOBAL_TOOLS.list_article_sections.args);
    if (secRes.ok) {
      // Parse ONLY numbered outline lines: `N. <slug> -- <Title>`. Never scrape
      // the trailing guidance line (it mentions read_article_section, not a slug).
      const line = secRes.full.split(/\r?\n/).find((l) => /^\s*\d+\.\s+[a-z0-9]+(?:-[a-z0-9]+)*\b/i.test(l));
      const m = line && line.match(/^\s*\d+\.\s+([a-z0-9]+(?:-[a-z0-9]+)*)\b/i);
      firstSlug = m ? m[1] : null;
    }
  }
  for (const [name, spec] of Object.entries(GLOBAL_TOOLS)) {
    if (!home.byName.has(name)) continue;
    if (spec.kind !== 'read') {
      note(`skip execution of ${name} (navigational)`);
      continue;
    }
    let args = spec.args;
    if (args.includes('__RESOLVE__')) {
      if (!firstSlug) {
        note(`skip ${name}: could not resolve a section slug from list_article_sections`);
        continue;
      }
      args = args.replace('__RESOLVE__', firstSlug);
    }
    const res = await exec(client, name, args);
    if (!res.ok) {
      check(false, `${name}: executes without error (got: ${res.error})`);
      continue;
    }
    check(res.len <= HARD_CAP, `${name}: output ${res.len} chars <= ${HARD_CAP}`);
    if (res.len <= HARD_CAP) note(`${name}: ${res.len} chars (${res.wireLen} wire) | ${res.head}`);
  }

  /* -- (3) PAGINATION: traverse a whole article two ways -- */
  console.log(`\n  -- (3) pagination: traverse the whole article ${PAGINATE_ARTICLE} --`);

  // 3a. Ground truth: fetch the full article from the frozen data contract so
  //     we can measure what fraction of it the walks actually recover, and
  //     cross-check the section count three ways.
  let fullArticleChars = 0;
  let fullArticleText = '';
  let groundTruthSectionCount = null;
  let sectionCharSizes = [];
  try {
    const fetched = await ev(
      client,
      `(async () => { try {
        const r = await fetch(new URL('/api/agent/article.json?path=${PAGINATE_ARTICLE}', location.origin));
        if (!r.ok) return { ok: false, status: r.status };
        const j = await r.json();
        const secs = j.sections || [];
        const text = secs.map((s) => s.text || '').join('\\n');
        return { ok: true, chars: text.length, wordCount: j.wordCount, sectionCount: secs.length, sectionSizes: secs.map((s) => (s.text || '').length), text };
      } catch (e) { return { ok: false, error: String(e) }; } })()`,
    );
    if (fetched.ok) {
      fullArticleChars = fetched.chars;
      fullArticleText = fetched.text;
      groundTruthSectionCount = fetched.sectionCount;
      sectionCharSizes = fetched.sectionSizes || [];
      note(`ground truth: ${fetched.sectionCount} sections, ${fetched.wordCount} words, ${fetched.chars} chars of body text`);
    } else {
      note(`ground-truth article fetch unavailable (${fetched.status || fetched.error}); coverage measured against sum-of-pages instead`);
    }
  } catch (e) {
    note(`ground-truth article fetch threw: ${String(e).slice(0, 120)}`);
  }

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * A response is GUIDANCE (a "here's what to do next" fallback) rather than
   * real article CONTENT if it looks like one of the tool's never-throw
   * recovery strings. The section walk previously counted these ~96-char
   * "unknown slug" strings as if they were section bodies, so ~1% coverage
   * read as a pass. Reject anything that looks like guidance.
   */
  const looksLikeGuidance = (text) => {
    const t = (text || '').trim();
    if (!t) return true;
    if (/^(missing\b|no article\b|no section\b|no such\b|unknown\b|section .* is out of range|that page is out of range|page .* is out of range)/i.test(t)) {
      return true;
    }
    // "out of range" / "this article has N page(s)" can appear mid-string in
    // range guidance (e.g. "This article has 28 page(s); page 29 is out of range…").
    if (/\bis out of range\b|this article has \d+\s+page/i.test(t)) {
      return true;
    }
    if (/call\s+list_article_sections|call\s+list_doodle_articles|read one with read_article_section/i.test(t)) {
      return true;
    }
    return false;
  };

  /** Minimum length a genuine article section body must clear. */
  const MIN_SECTION_CHARS = 120;

  /**
   * Parse section slugs from ONLY the numbered outline lines of
   * list_article_sections. Each line looks like `1. introduction -- Introduction`.
   * The trailing guidance line ("Read one with read_article_section { url,
   * section }, ...") is NOT numbered, so it never matches — which is exactly the
   * defect this fixes: it used to be scraped as a 17th "slug".
   */
  const parseOutlineSlugs = (text) => {
    const slugs = [];
    for (const line of (text || '').split(/\r?\n/)) {
      // `<n>. <slug> -- <Title>` — anchor on the leading "N. " and take the
      // first slug-shaped token as the slug. Em dash or double hyphen separator.
      const m = line.match(/^\s*\d+\.\s+([a-z0-9]+(?:-[a-z0-9]+)*)\b/i);
      if (m) slugs.push(m[1]);
    }
    return slugs;
  };

  // 3b. Section walk: list_article_sections -> read_article_section for EVERY slug.
  let sectionCoverageText = '';
  let sectionSlugs = [];
  let sectionOk = 0;
  if (check(home.byName.has('list_article_sections'), 'list_article_sections is registered') &&
      check(home.byName.has('read_article_section'), 'read_article_section is registered')) {
    const secList = await exec(client, 'list_article_sections', GLOBAL_TOOLS.list_article_sections.args);
    if (check(secList.ok, `list_article_sections executes (${secList.error ?? 'ok'})`)) {
      check(secList.len <= HARD_CAP, `list_article_sections output ${secList.len} <= ${HARD_CAP}`);

      // Parse slugs ONLY from numbered outline lines (ignore header + guidance).
      sectionSlugs = parseOutlineSlugs(secList.full);
      check(sectionSlugs.length > 0, `list_article_sections yields section slugs from numbered lines (${sectionSlugs.length})`);

      // The tool states its own section count in its header/guidance ("All N
      // sections."). Extract it so we can cross-check parse vs tool vs truth.
      const statedM = secList.full.match(/\bAll\s+(\d+)\s+sections?\b/i) ||
                      secList.full.match(/\b(\d+)\s+sections?\b/i);
      const statedCount = statedM ? Number(statedM[1]) : null;

      // Three-way cross-check: parsed slugs === count the tool states ===
      // ground-truth `sections` array length. A drift in ANY of the three
      // must fail — this is the assertion that catches the 16-vs-17 defect.
      if (statedCount != null) {
        check(
          sectionSlugs.length === statedCount,
          `parsed slug count (${sectionSlugs.length}) matches the count the tool states (${statedCount})`,
        );
      } else {
        check(false, `list_article_sections states its own section count (none found in output)`);
      }
      if (groundTruthSectionCount != null) {
        check(
          sectionSlugs.length === groundTruthSectionCount,
          `parsed slug count (${sectionSlugs.length}) matches ground-truth sections[] length (${groundTruthSectionCount})`,
        );
        if (statedCount != null) {
          check(
            statedCount === groundTruthSectionCount,
            `tool-stated count (${statedCount}) matches ground-truth sections[] length (${groundTruthSectionCount})`,
          );
        }
      } else {
        note('ground-truth section count unavailable — three-way cross-check degraded to parse-vs-tool only');
      }

      const walkSlugs = sectionSlugs.slice(0, MAX_WALK_STEPS);
      for (const slug of walkSlugs) {
        const res = await exec(client, 'read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":"${slug}"}`);
        if (!res.ok) { check(false, `read_article_section(${slug}) executes (${res.error})`); continue; }
        if (res.len > HARD_CAP) { check(false, `read_article_section(${slug}) output ${res.len} <= ${HARD_CAP}`); continue; }
        // Must be CONTENT, not a never-throw guidance string, and long enough
        // to plausibly be a real section body.
        if (looksLikeGuidance(res.full)) {
          check(false, `read_article_section(${slug}) returns CONTENT, not guidance (got: ${res.head})`);
          continue;
        }
        if (res.len < MIN_SECTION_CHARS) {
          check(false, `read_article_section(${slug}) content >= ${MIN_SECTION_CHARS} chars (got ${res.len})`);
          continue;
        }
        sectionOk += 1;
        sectionCoverageText += '\n' + res.full;
      }
      check(sectionOk === walkSlugs.length, `every section slug read as real content within budget (${sectionOk}/${walkSlugs.length})`);
      check(walkSlugs.length < MAX_WALK_STEPS, `section walk terminated under the ${MAX_WALK_STEPS}-step cap (${walkSlugs.length})`);

      // Numeric section index: read_article_section { section: 2 } must return
      // the SAME text as the slug at position 2 in the outline. (Another lane
      // is fixing this exact bug; if it still fails, that is a real finding.)
      if (sectionSlugs.length >= 2) {
        const slugAt2 = sectionSlugs[1]; // position 2, 1-indexed
        const byIndex = await exec(client, 'read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":2}`);
        const bySlug = await exec(client, 'read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":"${slugAt2}"}`);
        if (!byIndex.ok) {
          check(false, `read_article_section(section:2) executes (${byIndex.error})`);
        } else if (looksLikeGuidance(byIndex.full)) {
          check(false, `read_article_section(section:2) returns CONTENT, not guidance (got: ${byIndex.head})`);
        } else {
          check(
            bySlug.ok && byIndex.full === bySlug.full,
            `read_article_section(section:2) equals read_article_section(slug:"${slugAt2}")`,
          );
        }
      }

      // Stability: reading the same section twice returns identical text.
      if (walkSlugs.length > 0) {
        const s = walkSlugs[0];
        const a = await exec(client, 'read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":"${s}"}`);
        const b = await exec(client, 'read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":"${s}"}`);
        check(a.ok && b.ok && a.full === b.full, `read_article_section(${s}) is STABLE across two identical calls`);
      }
    }
  }

  // 3c. Page walk: read_article_page from page 1, following the real
  //     `-- page N of M.` marker until N === M. The previous next-page
  //     detection did not match this format, which is why it stopped at 17/28
  //     and reported a misleading 72%.
  let pageCoverageText = '';
  let pageWalkPages = [];
  let totalPagesM = null;
  let lastPageRes = null;
  if (check(home.byName.has('read_article_page'), 'read_article_page is registered')) {
    let page = 1;
    let terminated = false;
    let allNonEmpty = true;
    let allStateContinuation = true;

    // Extract "page N of M" -> { n, m }. Tolerant of surrounding punctuation.
    const parseMarker = (text) => {
      const m = (text || '').match(/page\s+(\d+)\s+of\s+(\d+)/i);
      return m ? { n: Number(m[1]), m: Number(m[2]) } : null;
    };

    for (let step = 0; step < MAX_WALK_STEPS; step += 1) {
      const res = await exec(client, 'read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":${page}}`);
      if (!res.ok) { check(false, `read_article_page(${page}) executes (${res.error})`); break; }
      if (res.len > HARD_CAP) { check(false, `read_article_page(${page}) output ${res.len} <= ${HARD_CAP}`); break; }
      if (res.len === 0) { allNonEmpty = false; }

      const marker = parseMarker(res.full);
      // Every content page must state where it is in the article.
      if (!marker) allStateContinuation = false;
      if (marker && totalPagesM == null) totalPagesM = marker.m;

      pageCoverageText += '\n' + res.full;
      pageWalkPages.push({ page, text: res.full, marker });
      lastPageRes = res;

      // Terminal condition: the marker says this is the last page (N === M).
      if (marker && marker.n === marker.m) { terminated = true; break; }
      // Or a next-page offer is genuinely absent while a marker existed.
      if (marker && !/read_article_page\s*\{[^}]*page\s*:\s*\d+/i.test(res.full) && !/next:/i.test(res.full)) {
        terminated = true;
        break;
      }
      page += 1;
    }

    check(pageWalkPages.length > 0, `read_article_page returned at least one content page (${pageWalkPages.length})`);
    check(allNonEmpty, 'every content page from read_article_page is non-empty');
    check(terminated, `read_article_page walk TERMINATED (did not hit the ${MAX_WALK_STEPS}-step cap)`);
    check(allStateContinuation, 'each content page states its position ("page N of M")');
    check(totalPagesM != null && totalPagesM > 1, `read_article_page declares a total page count M (${totalPagesM ?? 'none'})`);

    // Reached the true last page: walked N should equal M.
    if (totalPagesM != null) {
      const reachedLast = pageWalkPages.length > 0 && pageWalkPages[pageWalkPages.length - 1].page === totalPagesM;
      check(reachedLast, `page walk reached the final page (${pageWalkPages.length ? pageWalkPages[pageWalkPages.length - 1].page : 0} of ${totalPagesM})`);
    }

    // Final page states it is the last and offers NO next call.
    if (lastPageRes && totalPagesM != null) {
      const lower = lastPageRes.full.toLowerCase();
      const marker = lastPageRes.full.match(/page\s+(\d+)\s+of\s+(\d+)/i);
      const isLastMarker = marker && Number(marker[1]) === Number(marker[2]);
      const offersNext = /read_article_page\s*\{[^}]*page\s*:\s*\d+/i.test(lastPageRes.full) || /\bnext:/i.test(lower);
      check(isLastMarker, `final page states it is the last ("page ${totalPagesM} of ${totalPagesM}")`);
      check(!offersNext, `final page offers NO next read_article_page call`);
    }

    // Page M+1 must return recoverable range guidance, not an empty string.
    if (totalPagesM != null) {
      const beyond = await exec(client, 'read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":${totalPagesM + 1}}`);
      if (!beyond.ok) {
        check(false, `read_article_page(${totalPagesM + 1}) returns guidance, not a throw (${beyond.error})`);
      } else {
        check(
          beyond.len > 0 && beyond.len <= HARD_CAP && looksLikeGuidance(beyond.full),
          `read_article_page(${totalPagesM + 1}) returns range guidance, not an empty page (${beyond.len} chars: ${beyond.head})`,
        );
      }
    }

    // Stability: page 1 read twice returns identical text.
    if (pageWalkPages.length > 0) {
      const a = await exec(client, 'read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":1}`);
      const b = await exec(client, 'read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":1}`);
      check(a.ok && b.ok && a.full === b.full, 'read_article_page(1) is STABLE across two identical calls');
    }
  }

  /* -- coverage: concatenated walk must recover a large majority of the body -- */
  const measureCoverage = (walkText, label) => {
    if (!walkText) { note(`${label}: nothing recovered`); return 0; }
    if (fullArticleChars > 0) {
      // Token-overlap coverage against ground truth (robust to reformatting).
      const truthTokens = norm(fullArticleText).split(' ').filter(Boolean);
      const walkSet = new Set(norm(walkText).split(' ').filter(Boolean));
      if (truthTokens.length === 0) return 0;
      let hit = 0;
      const truthSet = new Set(truthTokens);
      for (const tk of truthSet) if (walkSet.has(tk)) hit += 1;
      const pct = Math.round((hit / truthSet.size) * 100);
      note(`${label}: recovered ~${pct}% of the article's distinct words (${walkText.length} chars walked vs ${fullArticleChars} ground-truth)`);
      return pct;
    }
    // No ground truth: report chars walked as a floor.
    note(`${label}: ${walkText.length} chars walked (no ground truth for a percentage)`);
    return walkText.length > 20000 ? 90 : Math.round((walkText.length / 30000) * 100);
  };

  const sectionCoveragePct = measureCoverage(sectionCoverageText, 'section-walk coverage');
  const pageCoveragePct = measureCoverage(pageCoverageText, 'page-walk coverage');

  // The PAGE walk is the whole-article path: it slices on the 1,500-char budget,
  // not on section boundaries, so it must recover the article near-totally.
  check(
    pageCoveragePct >= 95,
    `page walk recovers >=95% of the article (measured: ${pageCoveragePct}%)`,
  );

  // The SECTION walk is one read_article_section call per section, each capped
  // at 1,500 chars. When sections are LARGER than the cap (11 of 16 here, up to
  // 3,400 chars) a single call truncates them, so one-call-per-section CANNOT be
  // near-total by construction — that is the design, not a defect, and the page
  // walk exists precisely to cover the rest. So instead of a flat >=95% (which
  // would encode a false expectation), assert the section walk recovers what the
  // cap ACTUALLY allows: the ground-truth ceiling sum(min(sectionChars,1500)) /
  // totalChars, within a tolerance. This still fails on a real regression —
  // materially UNDER the ceiling means truncation/parse breakage; materially
  // OVER means the cap is being breached.
  if (sectionCharSizes.length > 0 && fullArticleChars > 0) {
    const cappedRecoverable = sectionCharSizes.reduce((a, c) => a + Math.min(c, HARD_CAP), 0);
    const ceilingPct = Math.round((cappedRecoverable / fullArticleChars) * 100);
    const anyOverCap = sectionCharSizes.some((c) => c > HARD_CAP);
    note(
      `section-walk ceiling: ${sectionCharSizes.filter((c) => c > HARD_CAP).length}/${sectionCharSizes.length} sections exceed the ${HARD_CAP}-char cap; ` +
      `one-call-per-section can recover at most ~${ceilingPct}% of the body`,
    );
    if (anyOverCap) {
      // Sections exceed the cap: the section walk is INHERENTLY partial. Require
      // it to reach within 8 points BELOW the computed ceiling (measurement is
      // word-overlap, the ceiling is chars, so a small gap is expected), and
      // never materially ABOVE it (that would mean the per-section cap leaked).
      check(
        sectionCoveragePct >= ceilingPct - 8 && sectionCoveragePct <= ceilingPct + 5,
        `section walk recovers ~its cap-bounded ceiling (measured ${sectionCoveragePct}% vs computed ~${ceilingPct}% for one-call-per-section)`,
      );
      note(
        `NOTE: read_article_section alone cannot deliver a full article whose sections exceed ${HARD_CAP} chars; ` +
        `read_article_page is the complete path (measured ${pageCoveragePct}%).`,
      );
    } else {
      // Every section fits under the cap: the section walk CAN be near-total.
      check(
        sectionCoveragePct >= 95,
        `section walk recovers >=95% of the article (measured: ${sectionCoveragePct}%; all sections fit under the ${HARD_CAP}-char cap)`,
      );
    }
  } else {
    // No ground-truth section sizes: fall back to the strong bar.
    check(
      sectionCoveragePct >= 95,
      `section walk recovers >=95% of the article (measured: ${sectionCoveragePct}%; no per-section ground truth)`,
    );
  }

  /* -- (4) bad input returns recoverable guidance, never throws -- */
  console.log('\n  -- (4) bad input returns recoverable guidance, never throws --');
  const ERROR_CASES = [
    ['get_doodle_article', '{"url":"/no-such-article-exists/"}', 'unknown article url'],
    ['read_article_section', `{"url":"${PAGINATE_ARTICLE}","section":"not-a-real-section"}`, 'unknown section slug'],
    ['read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":9999}`, 'out-of-range page'],
    ['read_article_page', `{"url":"${PAGINATE_ARTICLE}","page":-3}`, 'negative page'],
    ['get_doodle_article', '{"url":"https://example.com/evil"}', 'off-origin url'],
    ['read_article_section', '{"url":"https://example.com/evil","section":"introduction"}', 'off-origin section url'],
    ['get_doodle_skill', '{"id":"definitely-not-a-skill"}', 'unknown skill id'],
    ['get_doodle_skill', '{}', 'empty required arg'],
    ['get_doodle_skill', '{"id":12345}', 'wrong-typed arg'],
    ['read_article_section', `{"url":"${PAGINATE_ARTICLE}"}`, 'missing required section'],
  ];
  for (const [name, args, label] of ERROR_CASES) {
    if (!home.byName.has(name)) { note(`skip error case (${label}): ${name} not registered`); continue; }
    const res = await exec(client, name, args);
    if (!res.ok) {
      check(false, `${name} [${label}]: returns guidance instead of throwing (threw: ${res.error})`);
      continue;
    }
    check(
      res.len > 0 && res.len <= HARD_CAP,
      `${name} [${label}]: recoverable guidance, 1..${HARD_CAP} chars (${res.len})`,
    );
  }

  /* -- (5) cancellation: aborted call must settle, not hang -- */
  console.log('\n  -- (5) AbortSignal at 1ms settles (does not hang) --');
  for (const name of ['get_doodle_article', 'search_doodle_articles', 'read_article_page']) {
    if (!home.byName.has(name)) { note(`skip cancellation: ${name} not registered`); continue; }
    const args =
      name === 'read_article_page' ? `{"url":"${PAGINATE_ARTICLE}","page":1}` : GLOBAL_TOOLS[name].args;
    const res = await ev(client, EXECUTE_TOOL_ABORTED(name, args));
    check(
      res.settled === true,
      `${name}: a cancelled call settles rather than hanging (${res.outcome ?? `timeout after ${res.ms}ms`})`,
    );
  }

  /* -- declarative feedback form on the homepage -- */
  console.log('\n  -- declarative forms (homepage) --');
  const homepageForms = JSON.parse(await ev(client, DECLARATIVE_FORMS));
  note(`homepage declarative forms: ${homepageForms.length ? homepageForms.join(', ') : '(none)'}`);
  for (const name of HOMEPAGE_DECLARATIVE) {
    check(homepageForms.includes(name), `homepage carries declarative form: ${name}`);
  }

  /* ============ (6) ROUTE SCOPING: skill page + admin exclusion ========= */
  console.log(`\n=== (6) route scoping ===`);

  // 6a. A single skill page registers get_doodle_skill_guide + compare_doodle_skills.
  console.log(`\n  -- skill page ${SKILL_PAGE_ROUTE} --`);
  await navigate(client, `${BASE}${SKILL_PAGE_ROUTE}`);
  const skillPage = await enumerate(client);
  note(`skill-page tools (${skillPage.names.length}): ${skillPage.names.join(', ') || '(none)'}`);
  const skillDupes = skillPage.names.filter((n, i) => skillPage.names.indexOf(n) !== i);
  check(skillDupes.length === 0, `${SKILL_PAGE_ROUTE} has no duplicate tool names (${skillDupes.join(', ') || 'none'})`);
  for (const name of SKILL_PAGE_TOOLS) {
    check(skillPage.byName.has(name), `${SKILL_PAGE_ROUTE} registers skill-page tool: ${name}`);
  }
  // Global core still present on the skill page.
  check(
    skillPage.byName.has('get_doodle_overview') && skillPage.byName.has('list_doodle_skills'),
    `${SKILL_PAGE_ROUTE} still carries the global core tools`,
  );
  // Per-tool budgets on the skill-page-only tools too.
  for (const name of SKILL_PAGE_TOOLS) {
    const t = skillPage.byName.get(name);
    if (!t) continue;
    check(t.nameLen >= 1 && t.nameLen <= 30, `${name}: name length ${t.nameLen} within 1..30`);
    check(t.descLen >= 1 && t.descLen <= 500, `${name}: description length ${t.descLen} within 1..500`);
    check(
      t.schemaType === 'object' && t.hasProps && t.requiredIsArray,
      `${name}: inputSchema object w/ properties + array required`,
    );
    const longParam = t.paramDescs.find((p) => p.descLen > PARAM_DESC_CAP);
    check(!longParam, `${name}: every parameter description <= ${PARAM_DESC_CAP}`);
  }

  // 6b. An /admin route registers ZERO tools (EXCLUDED_PREFIXES). Admin
  //     redirects when signed out, so assert on the resulting document rather
  //     than assuming we land under /admin.
  console.log('\n  -- /admin exclusion --');
  await navigate(client, `${BASE}/admin/`);
  const landedPath = await ev(client, 'location.pathname');
  const admin = await enumerate(client);
  note(`/admin/ landed at: ${landedPath} | tools: ${admin.names.length}`);
  if (landedPath.startsWith('/admin')) {
    check(admin.names.length === 0, `/admin registers ZERO tools (got ${admin.names.length})`);
  } else {
    // Redirected out (signed out). Assert the redirect happened AND that no
    // admin-only tool leaked onto whatever page we landed on.
    check(landedPath !== '/admin/' && landedPath !== '/admin', `/admin redirected when unauthenticated (-> ${landedPath})`);
    note('signed out: /admin redirected, so ZERO-tools is asserted only where an /admin document actually loads');
  }

  /* ============================= /boards ============================= */
  console.log(`\n=== boards (${BASE}/boards) — declarative create_doodle_board ===`);
  await navigate(client, `${BASE}/boards`);
  const boardsForms = JSON.parse(await ev(client, DECLARATIVE_FORMS));
  note(`boards declarative forms: ${boardsForms.length ? boardsForms.join(', ') : '(none)'}`);
  for (const name of BOARDS_DECLARATIVE) {
    check(boardsForms.includes(name), `/boards carries declarative form: ${name}`);
  }
  const boards = await enumerate(client);
  const boardsDupes = boards.names.filter((n, i) => boards.names.indexOf(n) !== i);
  check(boardsDupes.length === 0, `/boards has no duplicate tool names (${boardsDupes.join(', ') || 'none'})`);

  client.close();
} catch (e) {
  console.error(`\nFAILED (harness error, not an assertion): ${e.message}`);
  code = 1;
} finally {
  child.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- verdict */

console.log('\n' + '\u2500'.repeat(60));
const total = passed + failures.length;
if (code === 0 && failures.length === 0) {
  console.log(`PASS \u2014 all ${total} WebMCP tool-expansion assertions held on ${BASE}.`);
} else {
  code = 1;
  console.error(`FAIL \u2014 ${failures.length} of ${total} assertion(s) failed:`);
  for (const f of failures) console.error(`  \u2717 ${f}`);
}
process.exit(code);
