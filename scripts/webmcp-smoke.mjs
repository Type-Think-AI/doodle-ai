#!/usr/bin/env node
/**
 * WebMCP smoke test — asserts Doodle AI's WebMCP surface is registered and sane
 * in a real Chrome Canary build with the origin-trial flag on.
 *
 * WHY THIS EXISTS
 * ---------------
 * WebMCP (W3C Community Group Draft) hands an agentic browser a set of callable
 * tools instead of making it scrape the DOM. The registration lives in
 * client-side script (`src/components/agentic/WebMcpTools.astro` +
 * `tools-content.ts`) and in declarative `toolname`/`tooldescription` form
 * attributes (`FeedbackDialog.astro`, `/boards`). Nothing in the normal build,
 * typecheck, or unit tests actually runs that script inside a browser that
 * exposes `document.modelContext`, so a regression there ships silently. This
 * test closes that gap: it drives a real Canary, loads the live page, and
 * asserts the tools are there, valid, budgeted, and executable.
 *
 * DESIGN NOTES (learned the hard way in /tmp/webmcp-verify.mjs)
 * ------------------------------------------------------------
 *  - Node spawns Canary as its OWN child and stays in the foreground, so the
 *    browser is not reaped by the shell's process-group cleanup before checks
 *    run. Backgrounding it / `open -na` both defeated that.
 *  - Node 22+ ships a native WebSocket, so this file has ZERO dependencies and
 *    intentionally does NOT touch package.json.
 *  - Chrome rejects a DevTools WebSocket that carries an Origin header, and
 *    Node's native WebSocket always sends one — `--remote-allow-origins=*` is
 *    mandatory or every CDP command hangs unanswered.
 *  - The `enable-webmcp-testing@1` lab is injected via a throwaway profile's
 *    `Local State`, so the user's real profile is never touched.
 *  - `--no-sandbox` is required under restricted macOS profiles where Chrome
 *    cannot create its code-sign clone (sandbox init aborts with SIGTRAP).
 *    Throwaway profile, localhost only, so this is safe here.
 *
 * USAGE
 * -----
 *   node scripts/webmcp-smoke.mjs [baseUrl]
 *   WEBMCP_BASE_URL=http://localhost:4321 node scripts/webmcp-smoke.mjs
 *   HEADFUL=1 node scripts/webmcp-smoke.mjs        # watch it run
 *
 * Exits 0 when every assertion passes, nonzero (with useful errors) otherwise.
 * Does NOT run lint/typecheck/build and does NOT edit package.json.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ---------------------------------------------------------------- config -- */

const CANARY_BIN =
  process.env.CANARY_BIN ||
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';

/* Scratch profile: prefer the session scratch dir when present, else the OS
   temp dir. Never the user's real profile. */
const SCRATCH = process.env.KIROCREW_SCRATCH || tmpdir();
const PROFILE = join(SCRATCH, `canary-webmcp-smoke-${process.pid}`);

const PORT = Number(process.env.WEBMCP_CDP_PORT || 9333);
const CDP = `http://127.0.0.1:${PORT}`;

const RAW_BASE = process.argv[2] || process.env.WEBMCP_BASE_URL || 'http://localhost:4321';
const BASE = RAW_BASE.replace(/\/+$/, ''); // strip trailing slash(es)
const HEADLESS = process.env.HEADFUL !== '1';

/** Google's ceiling for a single WebMCP tool output. Enforced on every result. */
const HARD_CAP = 1500;

/* The imperative tools that must be registered on the homepage. Read-only ones
   are executed; navigational/mutating ones are enumerated but not executed. */
const HOMEPAGE_IMPERATIVE = {
  list_doodle_skills: { kind: 'read', args: '{"limit":8}' },
  get_doodle_skill: { kind: 'read', args: '{"id":"normal"}' },
  get_doodle_overview: { kind: 'read', args: '{}' },
  open_doodle_page: { kind: 'nav', args: '{"page":"home"}' }, // navigates — never executed
  search_doodle_articles: { kind: 'read', args: '{"query":"cartoon"}' },
  get_doodle_article: { kind: 'read', args: '{"url":"/photo-to-cartoon/"}' },
};

/* Declarative annotations expected in the DOM (forms, not modelContext tools). */
const HOMEPAGE_DECLARATIVE = ['submit_doodle_feedback'];
const BOARDS_DECLARATIVE = ['create_doodle_board'];

/* --------------------------------------------------------------- helpers -- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const notes = [];
let passed = 0;
function check(ok, message) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    console.log(`  ✗ ${message}`);
    failures.push(message);
  }
  return ok;
}
function note(message) {
  console.log(`  · ${message}`);
  notes.push(message);
}

/* ------------------------------------------------------------ browser ---- */

function startBrowser() {
  if (!existsSync(CANARY_BIN)) {
    throw new Error(
      `Chrome Canary not found at:\n  ${CANARY_BIN}\n` +
        'Install Google Chrome Canary, or set CANARY_BIN to its executable path.',
    );
  }
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  /* chrome://flags settings live here; Chrome converts them to switches at
     startup. This is how we inherit "WebMCP for testing" without touching the
     user's real profile. */
  writeFileSync(
    join(PROFILE, 'Local State'),
    JSON.stringify({ browser: { enabled_labs_experiments: ['enable-webmcp-testing@1'] } }),
  );

  const args = [
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    // Node's native WebSocket always sends an Origin header; Chrome rejects a
    // DevTools socket that carries one unless origins are allowed.
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-crash-reporter',
    // Sandbox init aborts (SIGTRAP) under restricted macOS profiles. Throwaway
    // profile + localhost only, so disabling is safe here.
    '--no-sandbox',
    '--disable-gpu',
    'about:blank',
  ];
  if (HEADLESS) args.unshift('--headless=new');

  const child = spawn(CANARY_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {}); // swallow crashpad noise
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
      // Fail fast: a socket Chrome closes after handshake would otherwise leave
      // every command awaiting forever (an "unsettled top-level await").
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
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      }
    });
  });
}

/** Evaluate an expression in the page and return its value (or throw on JS error). */
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
  // Wait for load, then give the client script time to register tools.
  await sleep(4000);
}

/* -------------------------------------------------- normalization helper -- */

/*
 * Canary sometimes serialises `inputSchema` as a JSON STRING rather than an
 * object. This normaliser (evaluated in-page as part of the enumeration below)
 * parses it back so schema validation sees a real object either way.
 *
 * The page-side function returns a plain, structured-clonable array so it can
 * cross the CDP boundary with returnByValue.
 */
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
    return {
      name: t.name,
      nameLen: (t.name || '').length,
      description: t.description || '',
      descLen: (t.description || '').length,
      schemaType: schema ? schema.type : null,
      hasProps: !!(schema && schema.properties && typeof schema.properties === 'object'),
      requiredIsArray: !!(schema && Array.isArray(schema.required)),
      required: schema && Array.isArray(schema.required) ? schema.required : null,
      readOnly: !!(t.annotations && t.annotations.readOnlyHint),
      untrusted: !!(t.annotations && t.annotations.untrustedContentHint),
    };
  });
  return { api: true, tools };
})()`;

/** Execute one tool by name in-page and return { ok, len, kind, value }. */
const EXECUTE_TOOL = (name, argsJson) => `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { ok: false, error: 'NO_API' };
  const tool = (await mc.getTools()).find((t) => t.name === ${JSON.stringify(name)});
  if (!tool) return { ok: false, error: 'NOT_FOUND' };
  try {
    const r = await mc.executeTool(tool, ${JSON.stringify(argsJson)});
    const wire = typeof r === 'string' ? r : JSON.stringify(r);
    /* Tools return the spec's MCP content envelope
       ({ content: [{ type: 'text', text }] }) and Chrome resolves executeTool to
       a SERIALISED result, so the raw string is JSON. The 1,500-char budget is
       about what a model reads, so unwrap to the text before measuring — charging
       the tool for JSON punctuation would fail a compliant response. */
    let text = wire;
    let enveloped = false;
    try {
      const parsed = typeof r === 'string' ? JSON.parse(r) : r;
      if (parsed && Array.isArray(parsed.content)) {
        enveloped = true;
        text = parsed.content.map((c) => c.text ?? JSON.stringify(c)).join('\\n');
      }
    } catch { /* not JSON — a bare string result, measured as-is */ }
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

/** Collect declarative form toolnames present in the DOM. */
const DECLARATIVE_FORMS = `JSON.stringify(
  [...document.querySelectorAll('form[toolname]')].map((f) => f.getAttribute('toolname'))
)`;

/**
 * Structural integrity of each declarative form.
 *
 * A declarative form without `toolautosubmit` MUST contain a real
 * `type="submit"` control — Chrome throws "No submit button was found" when an
 * agent invokes one whose only button is `type="button"`. That exact bug shipped
 * once and was only caught by a live browser run, so it is asserted here.
 *
 * Also verifies the annotations are BARE (`toolname`, not `data-toolname`): the
 * `data-` prefix is a React/JSX TypeScript workaround that the browser ignores
 * entirely, so a data-prefixed form registers nothing.
 */
const DECLARATIVE_DETAIL = `JSON.stringify(
  [...document.querySelectorAll('form[toolname]')].map((f) => ({
    name: f.getAttribute('toolname'),
    hasDescription: !!(f.getAttribute('tooldescription') || '').trim(),
    descLen: (f.getAttribute('tooldescription') || '').length,
    autosubmit: f.hasAttribute('toolautosubmit'),
    hasSubmit: !!f.querySelector('button[type="submit"], input[type="submit"], button:not([type])'),
    named: [...f.querySelectorAll('[name]')].map((el) => ({
      name: el.getAttribute('name'),
      described: !!(el.getAttribute('toolparamdescription') || '').trim(),
      required: el.hasAttribute('required'),
    })),
  }))
) + '||' + JSON.stringify(
  [...document.querySelectorAll('[data-toolname]')].map((f) => f.getAttribute('data-toolname'))
)`;

/**
 * Execute a tool with an AbortSignal that fires immediately.
 *
 * Tools forward `context.signal` into every `fetch`, so a cancelled call must
 * SETTLE — either rejecting with AbortError or returning the tool's own
 * cancellation guidance. What it must not do is hang, which would leave an
 * agent's stop button doing nothing.
 */
const EXECUTE_TOOL_ABORTED = (name, argsJson) => `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  const tool = (await mc.getTools()).find((t) => t.name === ${JSON.stringify(name)});
  if (!tool) return { settled: false, error: 'NOT_FOUND' };
  const ac = new AbortController();
  const started = Date.now();
  const call = mc.executeTool(tool, ${JSON.stringify(argsJson)}, { signal: ac.signal });
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

/** Read the page's own registration diagnostics (window.__doodleWebMcp). */
const READ_DIAGNOSTICS = `JSON.stringify(window.__doodleWebMcp || null)`;

/**
 * Bad-input cases. Every WebMCP tool in this codebase is written to RETURN short
 * recoverable guidance rather than throw, because a thrown error gives an agent
 * nothing to act on. Each case asserts: the call succeeded (no throw), stayed
 * within budget, and the text contains the substring that tells the agent what
 * to do next.
 */
const ERROR_CASES = [
  ['get_doodle_skill', '{"id":"definitely-not-a-skill"}', 'list_doodle_skills'],
  ['get_doodle_skill', '{}', 'list_doodle_skills'],
  ['get_doodle_skill', '{"id":12345}', 'list_doodle_skills'],
  ['get_doodle_article', '{"url":"https://example.com/evil"}', 'search_doodle_articles'],
  ['get_doodle_article', '{"url":"/no-such-article-exists/"}', 'search_doodle_articles'],
  ['get_doodle_article', '{}', 'search_doodle_articles'],
  ['search_doodle_articles', '{"query":"zzzzqqqxxnomatch"}', 'No Doodle AI articles match'],
  ['list_doodle_skills', '{"limit":9999}', ''],
  ['list_doodle_skills', '{"limit":-5}', ''],
  /* Safe to execute: an unknown page must be REFUSED, not navigated to. */
  ['open_doodle_page', '{"page":"not-a-real-page"}', 'Valid values'],
];

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
    throw new Error(`Could not read the homepage — is a dev server running at ${BASE}? (${e.message})`, { cause: e });
  }
  note(`title: ${title}`);

  const apiType = await ev(client, 'typeof (document.modelContext || navigator.modelContext)');
  check(apiType === 'object', 'document.modelContext (or navigator.modelContext) exists');

  const { api, tools } = await ev(client, ENUMERATE_TOOLS);
  check(api === true, 'modelContext exposes getTools()');
  if (!api) throw new Error('WebMCP API absent — enable-webmcp-testing flag not active, or nothing registered.');

  const byName = new Map(tools.map((t) => [t.name, t]));
  note(`registered imperative tools: ${tools.length} — ${tools.map((t) => t.name).join(', ')}`);

  // The seven expected imperative tools must all be present.
  const expectedNames = Object.keys(HOMEPAGE_IMPERATIVE);
  check(
    expectedNames.length === 6,
    `expected homepage tool list has exactly 6 original imperative tools (${expectedNames.length})`,
  );
  for (const name of expectedNames) {
    check(byName.has(name), `homepage registers imperative tool: ${name}`);
  }

  // Validate name / description / schema / required for every registered tool.
  console.log('\n  -- per-tool schema & budget validation --');
  for (const t of tools) {
    const nameOk = t.nameLen > 0 && t.nameLen <= 30;
    const descOk = t.descLen > 0 && t.descLen <= 500;
    const schemaOk = t.schemaType === 'object' && t.hasProps && t.requiredIsArray;
    check(nameOk, `${t.name}: name length ${t.nameLen} within 1..30`);
    check(descOk, `${t.name}: description length ${t.descLen} within 1..500`);
    check(schemaOk, `${t.name}: inputSchema is object with properties and array 'required'`);
  }

  // Execute the read-only tools; enforce the 1500-char output cap. Skip
  // navigational (and any mutating) tools — executing them would navigate away
  // or change state.
  console.log('\n  -- execute read-only tools, enforce <=1500-char output --');
  for (const [name, spec] of Object.entries(HOMEPAGE_IMPERATIVE)) {
    if (!byName.has(name)) continue; // already reported missing above
    if (spec.kind !== 'read') {
      note(`skip execution of ${name} (${spec.kind}: navigational/mutating)`);
      continue;
    }
    const res = await ev(client, EXECUTE_TOOL(name, spec.args));
    if (!res.ok) {
      check(false, `${name}: executes without error (got: ${res.error})`);
      continue;
    }
    const withinCap = res.len <= HARD_CAP;
    check(withinCap, `${name}: output ${res.len} chars <= ${HARD_CAP}`);
    check(
      res.enveloped === true,
      `${name}: returns the spec content envelope { content: [{ type: 'text' }] }`,
    );
    if (withinCap) note(`${name}: ${res.len} chars (${res.wireLen} on the wire) | ${res.head}`);
  }

  // Declarative feedback form annotation must be present on the homepage.
  console.log('\n  -- declarative form annotations --');
  const homepageForms = JSON.parse(await ev(client, DECLARATIVE_FORMS));
  note(`homepage declarative forms: ${homepageForms.length ? homepageForms.join(', ') : '(none)'}`);
  for (const name of HOMEPAGE_DECLARATIVE) {
    check(homepageForms.includes(name), `homepage carries declarative form: ${name}`);
  }

  /* A declarative form is only real if the BROWSER turned it into a tool. The
     DOM check above proves the attribute is written; this proves it registered,
     which is the thing that actually breaks (bare vs data- prefix, missing
     submit button, form outside the document). */
  for (const name of HOMEPAGE_DECLARATIVE) {
    const t = byName.get(name);
    check(!!t, `declarative form ${name} appears in getTools() as a real tool`);
    if (t) {
      check(
        Array.isArray(t.required) && t.required.includes('text'),
        `${name}: synthesized schema marks 'text' required (got ${JSON.stringify(t.required)})`,
      );
    }
  }

  /* Structural traps that only a live browser catches. */
  const [detailRaw, dataPrefixedRaw] = (await ev(client, DECLARATIVE_DETAIL)).split('||');
  const dataPrefixed = JSON.parse(dataPrefixedRaw);
  check(
    dataPrefixed.length === 0,
    `no data-toolname attributes (the data- prefix is ignored by the browser) — found ${dataPrefixed.length}`,
  );
  for (const f of JSON.parse(detailRaw)) {
    check(f.hasDescription, `${f.name}: has a non-empty tooldescription`);
    check(f.descLen <= 500, `${f.name}: tooldescription ${f.descLen} chars <= 500`);
    check(
      f.autosubmit || f.hasSubmit,
      `${f.name}: has a real submit control (required when toolautosubmit is absent)`,
    );
    for (const field of f.named) {
      check(field.described, `${f.name}.${field.name}: has toolparamdescription`);
    }
  }

  /* ------------------- error recovery: guidance, never throw ------------ */
  console.log('\n  -- bad input returns recoverable guidance, never throws --');
  for (const [name, args, expect] of ERROR_CASES) {
    if (!byName.has(name)) continue;
    const res = await ev(client, EXECUTE_TOOL(name, args));
    if (!res.ok) {
      check(false, `${name}${args}: returns guidance instead of throwing (threw: ${res.error})`);
      continue;
    }
    check(res.len > 0 && res.len <= HARD_CAP, `${name}${args}: guidance is 1..${HARD_CAP} chars (${res.len})`);
    if (expect) {
      check(
        res.full.includes(expect),
        `${name}${args}: guidance points the agent at "${expect}"`,
      );
    }
  }

  /* open_doodle_page must have REFUSED the unknown page, not navigated. */
  const stillHome = await ev(client, 'location.pathname');
  check(
    stillHome === '/',
    `open_doodle_page rejected an unknown page without navigating (path is ${stillHome})`,
  );

  /* ------------------------- cancellation --------------------------------- */
  console.log('\n  -- AbortSignal is honoured (agent stop button works) --');
  for (const name of ['search_doodle_articles', 'get_doodle_article']) {
    if (!byName.has(name)) continue;
    const args = HOMEPAGE_IMPERATIVE[name].args;
    const res = await ev(client, EXECUTE_TOOL_ABORTED(name, args));
    check(res.settled === true, `${name}: a cancelled call settles rather than hanging (${res.outcome ?? `timeout after ${res.ms}ms`})`);
  }

  /* --------------------- the page's own diagnostics ----------------------- */
  console.log('\n  -- page self-report (window.__doodleWebMcp) --');
  const diagRaw = await ev(client, READ_DIAGNOSTICS);
  const diag = diagRaw ? JSON.parse(diagRaw) : null;
  check(!!diag, 'page publishes window.__doodleWebMcp for debugging');
  if (diag) {
    check(diag.apiPresent === true, 'diagnostics report the API as present');
    check(
      Array.isArray(diag.failed) && diag.failed.length === 0,
      `diagnostics report zero failed registrations (${JSON.stringify(diag.failed)})`,
    );
    check(
      Array.isArray(diag.registered) && diag.registered.length === tools.length - homepageForms.length,
      `diagnostics registrations (${diag.registered?.length}) == getTools (${tools.length}) minus declarative forms (${homepageForms.length})`,
    );
    note(`origin-isolated: ${diag.originAgentCluster} | secureContext: ${diag.secureContext}`);
  }

  /* ==================== per-route registration coverage ================== */
  /* Routes use different layouts (AppShellLayout, AppLayout, ArticleLayout).
     Registration is only universal if it survives all of them. */
  console.log('\n=== per-route coverage ===');
  for (const route of ['/skills/', '/learn/', '/photo-to-cartoon/', '/status/']) {
    await navigate(client, `${BASE}${route}`);
    const r = await ev(client, ENUMERATE_TOOLS);
    const names = (r.tools ?? []).map((t) => t.name);
    check(
      names.includes('list_doodle_skills') && names.includes('get_doodle_overview'),
      `${route} registers the imperative tool set (${names.length} tools)`,
    );
    /* get_doodle_status was deliberately moved off the global core: it was dead
       weight on ~30 routes. Assert it is PRESENT here and absent elsewhere, so
       the move is verified rather than merely the removal. */
    if (route === '/status/') {
      check(names.includes('get_doodle_status'), '/status/ registers the route-scoped get_doodle_status');
    } else {
      check(
        !names.includes('get_doodle_status'),
        `${route} does NOT register get_doodle_status (route-scoped to /status)`,
      );
    }
  }

  /* ============================= /boards ============================= */
  console.log(`\n=== boards (${BASE}/boards) ===`);
  await navigate(client, `${BASE}/boards`);

  const boardsTitle = await ev(client, 'document.title');
  note(`title: ${boardsTitle}`);

  const boardsForms = JSON.parse(await ev(client, DECLARATIVE_FORMS));
  note(`boards declarative forms: ${boardsForms.length ? boardsForms.join(', ') : '(none)'}`);
  for (const name of BOARDS_DECLARATIVE) {
    check(boardsForms.includes(name), `/boards carries declarative form: ${name}`);
  }

  const boardsTools = await ev(client, ENUMERATE_TOOLS);
  const boardsNames = (boardsTools.tools ?? []).map((t) => t.name);
  for (const name of BOARDS_DECLARATIVE) {
    check(boardsNames.includes(name), `/boards registers declarative tool in getTools(): ${name}`);
  }

  /* ================= navigation tool, executed for real ================= */
  /* Left until last because it moves the tab. Previously this tool was only
     enumerated, never executed, so nothing proved it actually navigates. */
  console.log('\n=== open_doodle_page executes and navigates ===');
  await navigate(client, `${BASE}/`);
  const navRes = await ev(client, EXECUTE_TOOL('open_doodle_page', '{"page":"skills"}'));
  check(navRes.ok === true, `open_doodle_page executes (${navRes.error ?? 'ok'})`);
  await sleep(3000);
  const landed = await ev(client, 'location.pathname');
  check(landed === '/skills/', `open_doodle_page navigated the tab to /skills/ (got ${landed})`);

  client.close();
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  code = 1;
} finally {
  child.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- verdict */

console.log('\n' + '─'.repeat(60));
if (code === 0 && failures.length === 0) {
  console.log(`PASS — ${passed} WebMCP conformance assertions held on ${BASE}.`);
} else {
  code = 1;
  console.error(`FAIL — ${failures.length} of ${passed + failures.length} assertion(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
}
process.exit(code);
