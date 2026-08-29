#!/usr/bin/env node
/**
 * WebMCP AUTONOMOUS AGENT EVALUATION HARNESS — Doodle AI (Lane B)
 * ==============================================================
 *
 * WHAT THIS PROVES (and why it is different from webmcp-smoke.mjs)
 * ---------------------------------------------------------------
 * webmcp-smoke.mjs proves the WebMCP surface is REGISTERED, valid, and
 * executable — protocol conformance. It says nothing about whether a real LLM
 * agent, handed ONLY the tool metadata, can actually accomplish a task.
 *
 * This harness closes that gap. It drives Chrome Canary over CDP exactly the
 * way the smoke test does (same launch flags, same throwaway-profile flag
 * injection, same origin-header WebSocket workaround), then runs an OpenAI
 * function-calling agent loop where the model can see:
 *
 *     - the tool NAMES, DESCRIPTIONS and inputSchemas, and
 *     - the STRINGS the tools return.
 *
 * and NOTHING else. No page HTML. No DOM text. No raw endpoint URLs. No hints
 * about which tool to use. If the agent succeeds, the tools alone were
 * sufficient — which is the entire point of WebMCP. That constraint is enforced
 * structurally: the only page interaction this file performs is
 * getTools() / executeTool(); it never reads document.body, innerText, or any
 * markup into the conversation.
 *
 * NO-LLM FALLBACK
 * ---------------
 * If OPENAI_API_KEY is absent we do NOT fail silently and we do NOT skip the
 * browser. We run a DETERMINISTIC mode that invokes every registered read-only
 * tool once with reasonable arguments, records the same trace/coverage/latency
 * data, and marks the report clearly as "no model used". That still exercises
 * the full tool surface end to end and catches registration/execution
 * regressions — it just cannot grade agent REASONING.
 *
 * SAFETY (non-negotiable, from docs/webmcp-agent-testing-brief.md)
 * ----------------------------------------------------------------
 *   - Read-only by default. open_doodle_page (navigates) and every
 *     declarative/mutating tool (submit_doodle_feedback, create_doodle_board)
 *     are SKIPPED unless --allow-writes is passed.
 *   - Even with --allow-writes, writes against production (doodleai.art) are
 *     REFUSED with a clear message. Writes are only ever attempted against a
 *     non-production target.
 *   - No tool here spends credits or reads account data; the exposed WebMCP
 *     surface is read-only by design and this harness never navigates to
 *     generation flows.
 *
 * PROMPT-INJECTION FLAGGING
 * -------------------------
 * Tools with annotations.untrustedContentHint === true return externally
 * sourced text (article bodies, third-party status). When such a tool's output
 * enters the model's context, we record it — per call and in an aggregate
 * report section — because that is the surface a prompt-injection attack would
 * ride in on.
 *
 * DEPENDENCIES: none. Node 22+ (native WebSocket + fetch). Does NOT touch
 * package.json and does NOT run lint/typecheck/build.
 *
 * USAGE
 * -----
 *   node scripts/webmcp-agent-eval.mjs
 *   WEBMCP_BASE_URL=http://localhost:4321 \
 *   OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini \
 *     node scripts/webmcp-agent-eval.mjs
 *   node scripts/webmcp-agent-eval.mjs --base https://doodleai-agent-staging.yash-892.workers.dev
 *   node scripts/webmcp-agent-eval.mjs --allow-writes --base http://localhost:4321
 *   HEADFUL=1 node scripts/webmcp-agent-eval.mjs        # watch it run
 *
 * Writes reports/webmcp-agent-eval-<timestamp>.{json,md}, prints a summary,
 * and exits nonzero if ANY scenario fails.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ----------------------------------------------------------------- paths -- */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCENARIOS_PATH = join(__dirname, 'webmcp-scenarios.json');
const REPORTS_DIR = join(REPO_ROOT, 'reports');

/* --------------------------------------------------------------- arg parse - */

function parseArgs(argv) {
  const flags = { allowWrites: false, base: null, maxSteps: null, model: null, positional: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-writes') flags.allowWrites = true;
    else if (a === '--base') flags.base = argv[++i];
    else if (a === '--max-steps') flags.maxSteps = Number(argv[++i]);
    else if (a === '--model') flags.model = argv[++i];
    else if (a.startsWith('--base=')) flags.base = a.slice('--base='.length);
    else if (a.startsWith('--max-steps=')) flags.maxSteps = Number(a.slice('--max-steps='.length));
    else if (a.startsWith('--model=')) flags.model = a.slice('--model='.length);
    // A bare positional URL is the same calling convention as
    // scripts/webmcp-smoke.mjs, so muscle memory transfers between the two.
    // First positional wins; --base still takes precedence over it.
    else if (!a.startsWith('-') && /^https?:\/\//.test(a) && !flags.positional) {
      flags.positional = a;
    }
  }
  if (!flags.base && flags.positional) flags.base = flags.positional;
  return flags;
}
const FLAGS = parseArgs(process.argv);

/* ---------------------------------------------------------------- config -- */

const CANARY_BIN =
  process.env.CANARY_BIN ||
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';

const SCRATCH = process.env.KIROCREW_SCRATCH || tmpdir();
const PROFILE = join(SCRATCH, `canary-webmcp-agent-${process.pid}`);

const PORT = Number(process.env.WEBMCP_CDP_PORT || 9334);
const CDP = `http://127.0.0.1:${PORT}`;

const RAW_BASE =
  FLAGS.base || process.env.WEBMCP_BASE_URL || 'http://localhost:4321';
const BASE = RAW_BASE.replace(/\/+$/, '');
const HEADLESS = process.env.HEADFUL !== '1';

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_MODEL = FLAGS.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const HAS_LLM = OPENAI_API_KEY.length > 0;

const MAX_STEPS = Number.isFinite(FLAGS.maxSteps) && FLAGS.maxSteps > 0 ? FLAGS.maxSteps : 8;
const HARD_CAP = 1500; // WebMCP single-tool-output ceiling.

/* Production host — writes are refused against it even with --allow-writes. */
const PROD_HOSTS = new Set(['doodleai.art', 'www.doodleai.art']);

/* Tools that MUTATE or NAVIGATE. Never auto-executed in read-only mode; the
   navigational one is skipped even under --allow-writes because navigating the
   tab mid-run destroys the tool surface for subsequent scenarios. */
const NAVIGATION_TOOLS = new Set(['open_doodle_page']);
const DECLARATIVE_WRITE_TOOLS = new Set(['submit_doodle_feedback', 'create_doodle_board']);

/* --------------------------------------------------------------- helpers -- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function baseHost() {
  try {
    return new URL(BASE).hostname;
  } catch {
    return '';
  }
}
const IS_PROD = PROD_HOSTS.has(baseHost());

/* ------------------------------------------------------------ browser ---- */
/* Launch pattern lifted verbatim from scripts/webmcp-smoke.mjs — same flags,
   same throwaway-profile Local State injection, same origin-allow workaround. */

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
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
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
  await sleep(4000); // load + let the client script register tools
}

/* --------------------------------------------- in-page WebMCP evaluation -- */

/* Enumerate tools, normalising inputSchema when Canary hands it back as a JSON
   string (a known Canary quirk noted in the brief). Returns structured-clonable
   data so it crosses the CDP boundary with returnByValue. */
const ENUMERATE_TOOLS = `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { api: false, tools: [] };
  const raw = await mc.getTools();
  const parseSchema = (s) => {
    if (s && typeof s === 'object') return s;
    if (typeof s === 'string') { try { return JSON.parse(s); } catch { return null; } }
    return null;
  };
  const tools = raw.map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: parseSchema(t.inputSchema) || { type: 'object', properties: {}, required: [] },
    readOnly: !!(t.annotations && t.annotations.readOnlyHint),
    untrusted: !!(t.annotations && t.annotations.untrustedContentHint),
  }));
  return { api: true, tools };
})()`;

/* Execute one tool by name.

   ARGUMENT ENCODING — verified empirically against Chrome Canary 154, and it
   contradicts a naive reading of the spec. The IDL says
   `executeTool(RegisteredTool tool, optional object inputObject = {})`, i.e. a
   real object. But Canary 154 JSON.parse()s whatever it is handed, so passing
   an object makes it parse the string "[object Object]" and reject with
   "Failed to parse input arguments". A pre-stringified JSON string works.

   So: send the STRING form first (what today's implementation accepts), and if
   that specific parse failure comes back, retry with the OBJECT form (what the
   spec mandates, and what a future Chrome will accept). This keeps the harness
   working across the transition instead of pinning it to one build.

   Always resolves to a { ok, value|error } record; never throws across the
   CDP boundary. */
const EXECUTE_TOOL = (name, argsObj) => `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { ok: false, error: 'NO_API' };
  const tool = (await mc.getTools()).find((t) => t.name === ${JSON.stringify(name)});
  if (!tool) return { ok: false, error: 'NOT_FOUND' };
  const argsObject = ${JSON.stringify(argsObj)};
  const argsString = JSON.stringify(argsObject);
  const norm = (r) => (typeof r === 'string' ? r : JSON.stringify(r));
  try {
    const r = await mc.executeTool(tool, argsString);
    return { ok: true, value: norm(r), valueType: typeof r, encoding: 'string' };
  } catch (e1) {
    const m1 = String(e1 && e1.message ? e1.message : e1);
    try {
      const r2 = await mc.executeTool(tool, argsObject);
      return { ok: true, value: norm(r2), valueType: typeof r2, encoding: 'object' };
    } catch (e2) {
      const m2 = String(e2 && e2.message ? e2.message : e2);
      return { ok: false, error: ('string-form: ' + m1 + ' | object-form: ' + m2).slice(0, 300) };
    }
  }
})()`;

/* ------------------------------------------------------- OpenAI plumbing -- */

/** Map a normalised WebMCP tool to an OpenAI function-calling tool. */
function toOpenAiTool(t) {
  const params =
    t.inputSchema && t.inputSchema.type === 'object'
      ? t.inputSchema
      : { type: 'object', properties: {} };
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description || t.name,
      parameters: params,
    },
  };
}

/** One chat/completions round trip. Returns { message, usage, latencyMs }. */
async function chatCompletion(messages, tools) {
  const started = now();
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0,
    }),
  });
  const latencyMs = now() - started;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`chat/completions HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) throw new Error('chat/completions returned no choices');
  return { message: choice.message, usage: data.usage || null, latencyMs };
}

const SYSTEM_PROMPT = [
  'You are an agent embedded in a web page. You can ONLY act through the tools',
  'provided to you. You cannot see the page HTML, the DOM, or any URLs beyond what',
  'a tool explicitly returns. Answer the user strictly from tool results —',
  'never invent skill names, article URLs, prices, or status. If a tool reports',
  'that something does not exist, say so plainly rather than making something up.',
  'Prefer a read-only discovery tool before answering. Keep the final answer',
  'concise. When you have enough information, stop calling tools and reply.',
].join(' ');

/* ------------------------------------------------- agent loop (LLM mode) -- */

/**
 * Run one scenario with the real model. Returns a trace record:
 *   { finalAnswer, toolCalls[], steps, usageTotal, injectionExposed, error? }
 * toolCalls[] = { name, args, ok, resultLen, resultHead, latencyMs, untrusted }
 */
async function runScenarioLLM(client, scenario, tools, toolIndex) {
  const openAiTools = tools.map(toOpenAiTool);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: scenario.prompt },
  ];
  const toolCalls = [];
  let usageTotal = { prompt: 0, completion: 0, total: 0 };
  let injectionExposed = false;
  let finalAnswer = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    let round;
    try {
      round = await chatCompletion(messages, openAiTools);
    } catch (e) {
      return {
        finalAnswer,
        toolCalls,
        steps: step,
        usageTotal,
        injectionExposed,
        error: `LLM call failed: ${e.message}`,
      };
    }
    if (round.usage) {
      usageTotal.prompt += round.usage.prompt_tokens || 0;
      usageTotal.completion += round.usage.completion_tokens || 0;
      usageTotal.total += round.usage.total_tokens || 0;
    }
    const msg = round.message;
    messages.push(msg);

    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      finalAnswer = (msg.content || '').trim();
      break;
    }

    // Execute each requested tool call in the page.
    for (const call of calls) {
      const name = call.function?.name || '';
      let args = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      const record = await executeToolGuarded(client, name, args, toolIndex);
      if (record.untrusted && record.ok) injectionExposed = true;
      toolCalls.push(record);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: record.ok ? record.result : `ERROR: ${record.error}`,
      });
    }
  }

  if (!finalAnswer) {
    // Loop hit the step cap without a plain answer — ask once for a final reply
    // with no tools, so we always have something to grade.
    try {
      const closing = await chatCompletion(
        [...messages, { role: 'user', content: 'Give your final answer now, using only what the tools returned.' }],
        [],
      );
      finalAnswer = (closing.message.content || '').trim();
      if (closing.usage) usageTotal.total += closing.usage.total_tokens || 0;
    } catch {
      /* leave finalAnswer empty; assertions will fail it */
    }
  }

  return { finalAnswer, toolCalls, steps: toolCalls.length, usageTotal, injectionExposed };
}

/* ----------------------------------------- deterministic no-LLM fallback -- */

/** Reasonable probe arguments per read-only tool for the no-LLM path. */
const FALLBACK_ARGS = {
  list_doodle_skills: { limit: 8 },
  get_doodle_skill: { id: 'surprise' },
  get_doodle_overview: {},
  get_doodle_status: {},
  search_doodle_articles: { query: 'sticker', limit: 3 },
  get_doodle_article: { url: '/photo-to-cartoon/' },
};

/**
 * No-LLM scenario run: invoke the tools the scenario names (read-only ones
 * only), so the same trace/coverage/latency data is produced. There is no
 * reasoning to grade, so grading is relaxed to "did the named tools execute";
 * the report states plainly that no model was used.
 */
async function runScenarioFallback(client, scenario, toolIndex) {
  const toolCalls = [];
  let injectionExposed = false;
  const wanted = scenario.expectedTools && scenario.expectedTools.length
    ? scenario.expectedTools
    : Object.keys(FALLBACK_ARGS);

  for (const name of wanted) {
    if (!toolIndex.has(name)) continue; // not registered on this page
    // A scenario may need the SAME tool called with several argument sets — a
    // comparison ("stickers vs crayon") is only genuinely exercised if the tool
    // runs once per subject, which is what a real agent would do. So the
    // resolver returns a LIST of argument sets, not a single one.
    const argSets = scenarioArgsFor(scenario, name) ?? [FALLBACK_ARGS[name] ?? {}];
    for (const args of argSets) {
      const record = await executeToolGuarded(client, name, args, toolIndex);
      if (record.untrusted && record.ok) injectionExposed = true;
      toolCalls.push(record);
    }
  }

  // Build a synthetic "answer" from tool outputs so char/grounding checks have
  // something to run against (clearly marked as deterministic).
  //
  // NOTE the cap: a single TOOL output must stay <=1500 chars, but this is a
  // concatenation of several outputs standing in for an agent's final answer,
  // so it is deliberately NOT clipped to HARD_CAP — doing so would truncate the
  // later tool results and make grounding checks fail for a reason that has
  // nothing to do with the site.
  const answer = toolCalls
    .filter((c) => c.ok)
    .map((c) => c.result)
    .join('\n');

  return { finalAnswer: answer, toolCalls, steps: toolCalls.length, usageTotal: null, injectionExposed, noLlm: true };
}

/**
 * Scenario-specific probe arguments for the no-LLM path.
 *
 * Returns an ARRAY of argument sets (or null to use the generic default), so a
 * scenario that compares two entities can drive the same tool twice.
 */
function scenarioArgsFor(scenario, name) {
  if (scenario.id === 'invalid-input-recovery' && name === 'get_doodle_skill') {
    return [{ id: 'quantum-banana-9000' }];
  }
  if (scenario.id === 'compare-two-skills' && name === 'get_doodle_skill') {
    // Both subjects of the comparison, so 'crayon' is actually fetched.
    return [{ id: 'stickers' }, { id: 'crayon' }];
  }
  if (scenario.id === 'credit-cost' && name === 'get_doodle_skill') {
    return [{ id: 'normal' }];
  }
  return null;
}

/* ------------------------------------------------ guarded tool execution -- */

/**
 * Execute a tool with all safety gates applied. Returns a record shared by both
 * the LLM and fallback paths. NAVIGATION and DECLARATIVE-WRITE tools are refused
 * unless --allow-writes AND non-production; navigation is refused regardless of
 * flag (it would tear down the tool surface for later scenarios).
 */
async function executeToolGuarded(client, name, args, toolIndex) {
  const meta = toolIndex.get(name);
  const untrusted = meta ? meta.untrusted : false;
  const base = { name, args, untrusted, latencyMs: 0 };

  if (!meta) {
    return { ...base, ok: false, error: `tool "${name}" is not registered on this page`, result: '', resultLen: 0, resultHead: '' };
  }

  // Navigation tools are always skipped — navigating destroys the surface.
  if (NAVIGATION_TOOLS.has(name)) {
    return { ...base, ok: false, skipped: true, error: 'skipped: navigation tool (would tear down the tool surface)', result: '', resultLen: 0, resultHead: '' };
  }

  // Declarative/mutating writes: gated behind --allow-writes and non-prod.
  if (DECLARATIVE_WRITE_TOOLS.has(name) || meta.readOnly === false) {
    if (!FLAGS.allowWrites) {
      return { ...base, ok: false, skipped: true, error: 'skipped: write tool (pass --allow-writes to attempt against a non-production target)', result: '', resultLen: 0, resultHead: '' };
    }
    if (IS_PROD) {
      return { ...base, ok: false, skipped: true, error: `REFUSED: write tools must never run against production (${baseHost()})`, result: '', resultLen: 0, resultHead: '' };
    }
  }

  const started = now();
  let res;
  try {
    res = await ev(client, EXECUTE_TOOL(name, args || {}));
  } catch (e) {
    return { ...base, ok: false, error: `in-page execution threw: ${e.message}`, latencyMs: now() - started, result: '', resultLen: 0, resultHead: '' };
  }
  const latencyMs = now() - started;

  if (!res || res.ok !== true) {
    return { ...base, ok: false, error: res ? res.error : 'no result', latencyMs, result: '', resultLen: 0, resultHead: '' };
  }
  const result = res.value ?? '';
  return {
    ...base,
    ok: true,
    result,
    resultLen: result.length,
    resultHead: result.slice(0, 160).replace(/\s+/g, ' '),
    valueType: res.valueType,
    latencyMs,
  };
}

/* -------------------------------------------------------------- grading -- */

/**
 * Grade one scenario run against its assertions. Returns
 * { pass, checks: [{ name, ok, detail }] }.
 *
 * Assertion model (5 dimensions, per the brief):
 *   1. sensibleTool   — at least one expected tool was invoked (any-mode) OR
 *                       all expected tools invoked (all-mode).
 *   2. execution      — at least one non-skipped tool call succeeded.
 *   3. outputBudget   — every tool result was <= 1500 chars (WebMCP ceiling).
 *   4. grounded       — every required substring is present in the final answer.
 *   5. noHallucination— no forbidden substring is present in the final answer.
 *
 * In no-LLM mode, dimensions 4/5 still run against the concatenated tool output
 * (grounding by construction), and the report flags that reasoning was not
 * graded.
 */
function gradeScenario(scenario, run) {
  const checks = [];
  const answerLc = (run.finalAnswer || '').toLowerCase();
  const invoked = new Set(run.toolCalls.filter((c) => !c.skipped).map((c) => c.name));

  // 1. sensible tool selection
  const expected = scenario.expectedTools || [];
  const mode = scenario.expectedToolsMode || 'any';
  let toolOk;
  if (expected.length === 0) {
    toolOk = invoked.size > 0;
  } else if (mode === 'all') {
    toolOk = expected.every((t) => invoked.has(t));
  } else {
    toolOk = expected.some((t) => invoked.has(t));
  }
  checks.push({
    name: 'sensibleTool',
    ok: toolOk,
    detail: `expected(${mode})=[${expected.join(', ')}] invoked=[${[...invoked].join(', ') || '∅'}]`,
  });

  // 2. execution succeeded (at least one real, non-skipped success)
  const anySuccess = run.toolCalls.some((c) => c.ok && !c.skipped);
  checks.push({
    name: 'executionSucceeded',
    ok: anySuccess,
    detail: anySuccess ? 'at least one tool call returned a result' : 'no tool call succeeded',
  });

  // 3. output budget — every result <= 1500 chars
  const over = run.toolCalls.filter((c) => c.ok && c.resultLen > HARD_CAP);
  checks.push({
    name: 'outputBudget',
    ok: over.length === 0,
    detail: over.length === 0
      ? `all tool outputs <= ${HARD_CAP} chars`
      : `over cap: ${over.map((c) => `${c.name}=${c.resultLen}`).join(', ')}`,
  });

  // 4. grounded — required substrings present
  const required = scenario.requiredSubstrings || [];
  const missing = required.filter((s) => !answerLc.includes(s.toLowerCase()));
  checks.push({
    name: 'grounded',
    ok: missing.length === 0,
    detail: missing.length === 0
      ? `all required substrings present (${required.length})`
      : `missing: [${missing.join(', ')}]`,
  });

  // 5. no hallucination — forbidden substrings absent
  const forbidden = scenario.forbiddenSubstrings || [];
  const leaked = forbidden.filter((s) => answerLc.includes(s.toLowerCase()));
  checks.push({
    name: 'noHallucination',
    ok: leaked.length === 0,
    detail: leaked.length === 0
      ? `no forbidden substrings present (${forbidden.length})`
      : `present: [${leaked.join(', ')}]`,
  });

  if (run.error) {
    checks.push({ name: 'runError', ok: false, detail: run.error });
  }

  const pass = checks.every((c) => c.ok);
  return { pass, checks };
}

/* --------------------------------------------------------------- report -- */

function buildCoverage(allTools, results) {
  const exercised = new Set();
  for (const r of results) {
    for (const c of r.run.toolCalls) {
      if (c.ok && !c.skipped) exercised.add(c.name);
    }
  }
  return allTools.map((t) => ({
    name: t.name,
    readOnly: t.readOnly,
    untrusted: t.untrusted,
    exercised: exercised.has(t.name),
  }));
}

function writeReports(payload) {
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(REPORTS_DIR, `webmcp-agent-eval-${stamp}.json`);
  const mdPath = join(REPORTS_DIR, `webmcp-agent-eval-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(mdPath, renderMarkdown(payload));
  return { jsonPath, mdPath };
}

function renderMarkdown(p) {
  const L = [];
  L.push(`# WebMCP Agent Evaluation — Doodle AI`);
  L.push('');
  L.push(`- **Target**: ${p.meta.base}${p.meta.isProd ? ' _(PRODUCTION)_' : ''}`);
  L.push(`- **Mode**: ${p.meta.llm ? `LLM (${p.meta.model} via ${p.meta.openaiBase})` : 'NO-LLM deterministic fallback — **no model was used**; agent reasoning was NOT graded'}`);
  L.push(`- **Writes**: ${p.meta.allowWrites ? (p.meta.isProd ? 'requested but REFUSED (production)' : 'enabled (non-production)') : 'disabled (read-only)'}`);
  L.push(`- **Max steps/scenario**: ${p.meta.maxSteps}`);
  L.push(`- **When**: ${p.meta.timestamp}`);
  L.push(`- **Result**: ${p.summary.passed}/${p.summary.total} scenarios passed`);
  L.push('');

  L.push(`## Prompt-injection exposure`);
  L.push('');
  L.push(`Tools carrying \`untrustedContentHint: true\` return externally-sourced text. When their output enters the model's context it is a prompt-injection surface.`);
  const untrustedTools = p.coverage.filter((t) => t.untrusted).map((t) => t.name);
  L.push(`- Untrusted-content tools registered: ${untrustedTools.length ? untrustedTools.map((n) => `\`${n}\``).join(', ') : '(none)'}`);
  const exposedScenarios = p.results.filter((r) => r.run.injectionExposed).map((r) => r.scenario.id);
  L.push(`- Scenarios where untrusted output reached the model: ${exposedScenarios.length ? exposedScenarios.join(', ') : '(none)'}`);
  L.push('');

  L.push(`## Coverage — registered tools actually exercised`);
  L.push('');
  L.push(`| Tool | read-only | untrusted | exercised |`);
  L.push(`|---|---|---|---|`);
  for (const t of p.coverage) {
    L.push(`| \`${t.name}\` | ${t.readOnly ? '✓' : '—'} | ${t.untrusted ? '⚠️' : '—'} | ${t.exercised ? '✓' : '✗'} |`);
  }
  const unexercised = p.coverage.filter((t) => !t.exercised).map((t) => t.name);
  if (unexercised.length) {
    L.push('');
    L.push(`> Not exercised (skipped by safety gates or not selected by the agent): ${unexercised.map((n) => `\`${n}\``).join(', ')}`);
  }
  L.push('');

  L.push(`## Scenarios`);
  for (const r of p.results) {
    L.push('');
    L.push(`### ${r.grade.pass ? '✅' : '❌'} ${r.scenario.id} — ${r.scenario.title}`);
    L.push('');
    L.push(`**Task**: ${r.scenario.prompt}`);
    L.push('');
    L.push(`**Assertions**:`);
    for (const c of r.grade.checks) {
      L.push(`- ${c.ok ? '✓' : '✗'} \`${c.name}\` — ${c.detail}`);
    }
    L.push('');
    if (r.run.finalAnswer) {
      L.push(`**Final answer** (${r.run.finalAnswer.length} chars):`);
      L.push('');
      L.push('> ' + r.run.finalAnswer.replace(/\n/g, '\n> '));
      L.push('');
    } else {
      L.push(`**Final answer**: _(none produced)_`);
      L.push('');
    }
    if (r.run.usageTotal && r.run.usageTotal.total) {
      L.push(`**Tokens**: ${r.run.usageTotal.total} (prompt ${r.run.usageTotal.prompt}, completion ${r.run.usageTotal.completion})`);
      L.push('');
    }
    L.push(`**Tool-call trace**:`);
    if (r.run.toolCalls.length === 0) {
      L.push(`- _(no tool calls)_`);
    } else {
      L.push('');
      L.push(`| # | tool | args | outcome | chars | latency |`);
      L.push(`|---|---|---|---|---|---|`);
      r.run.toolCalls.forEach((c, i) => {
        const outcome = c.skipped ? `skipped` : c.ok ? 'ok' : `error: ${c.error}`;
        const argStr = JSON.stringify(c.args).replace(/\|/g, '\\|').slice(0, 80);
        L.push(`| ${i + 1} | \`${c.name}\`${c.untrusted ? ' ⚠️' : ''} | \`${argStr}\` | ${outcome} | ${c.resultLen || 0} | ${c.latencyMs}ms |`);
      });
    }
    L.push('');
  }
  return L.join('\n');
}

/* ------------------------------------------------------------------ main -- */

function loadScenarios() {
  if (!existsSync(SCENARIOS_PATH)) {
    throw new Error(`scenarios file not found: ${SCENARIOS_PATH}`);
  }
  const parsed = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8'));
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
    throw new Error('scenarios file has no "scenarios" array');
  }
  return parsed.scenarios;
}

const child = startBrowser();
let exitCode = 0;

try {
  const scenarios = loadScenarios();

  const browser = await waitForCdp();
  console.log(`browser  : ${browser}${HEADLESS ? ' (headless=new)' : ' (headful)'}`);
  console.log(`target   : ${BASE}${IS_PROD ? '  [PRODUCTION]' : ''}`);
  console.log(`mode     : ${HAS_LLM ? `LLM (${OPENAI_MODEL} @ ${OPENAI_BASE_URL})` : 'NO-LLM deterministic fallback (OPENAI_API_KEY not set)'}`);
  console.log(`writes   : ${FLAGS.allowWrites ? (IS_PROD ? 'requested but WILL BE REFUSED (production)' : 'enabled (non-prod)') : 'disabled (read-only)'}`);
  console.log('');

  const client = await connect((await pageTarget()).webSocketDebuggerUrl);
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  // Land on the homepage where the full imperative surface is registered.
  await navigate(client, `${BASE}/`);

  const { api, tools } = await ev(client, ENUMERATE_TOOLS);
  if (!api) {
    throw new Error(
      'WebMCP API absent on the page. Either the enable-webmcp-testing flag is not active, ' +
        'or nothing registered (is a dev server running at the target?).',
    );
  }
  if (!tools.length) {
    throw new Error('modelContext.getTools() returned no tools — nothing to evaluate.');
  }
  const toolIndex = new Map(tools.map((t) => [t.name, t]));
  console.log(`tools    : ${tools.length} registered — ${tools.map((t) => t.name).join(', ')}\n`);

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`▶ ${scenario.id} … `);
    const run = HAS_LLM
      ? await runScenarioLLM(client, scenario, tools, toolIndex)
      : await runScenarioFallback(client, scenario, toolIndex);
    const grade = gradeScenario(scenario, run);
    if (!grade.pass) exitCode = 1;
    results.push({ scenario, run, grade });
    console.log(grade.pass ? 'PASS' : 'FAIL');
  }

  client.close();

  const coverage = buildCoverage(tools, results);
  const passed = results.filter((r) => r.grade.pass).length;
  const payload = {
    meta: {
      base: BASE,
      isProd: IS_PROD,
      llm: HAS_LLM,
      model: HAS_LLM ? OPENAI_MODEL : null,
      openaiBase: HAS_LLM ? OPENAI_BASE_URL : null,
      allowWrites: FLAGS.allowWrites,
      maxSteps: MAX_STEPS,
      timestamp: new Date().toISOString(),
    },
    summary: { total: results.length, passed, failed: results.length - passed },
    coverage,
    results,
  };

  const { jsonPath, mdPath } = writeReports(payload);

  console.log('\n' + '─'.repeat(60));
  console.log(`Reports:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log('─'.repeat(60));
  const unexercised = coverage.filter((t) => !t.exercised).map((t) => t.name);
  console.log(`Coverage : ${coverage.filter((t) => t.exercised).length}/${coverage.length} tools exercised` +
    (unexercised.length ? ` (skipped/unused: ${unexercised.join(', ')})` : ''));
  if (!HAS_LLM) console.log('NOTE     : NO-LLM fallback — tool surface exercised, but agent reasoning was NOT graded.');
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  exitCode = 1;
} finally {
  child.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- verdict */

console.log('\n' + '═'.repeat(60));
if (exitCode === 0) {
  console.log(`PASS — every scenario met its assertions on ${BASE}.`);
} else {
  console.error(`FAIL — see the reports above for per-scenario detail.`);
}
process.exit(exitCode);
