#!/usr/bin/env node
/**
 * WebMCP diagnostic — answers "why are no tools registered?" with evidence.
 *
 * Unlike webmcp-smoke.mjs (which asserts a known-good surface), this script
 * assumes nothing: it captures every console message and uncaught exception,
 * probes the real shape of the modelContext object in THIS Chrome build, and
 * replays a registerTool() call WITHOUT swallowing the rejection — which is the
 * one failure mode production code hides behind `.catch(() => {})`.
 *
 *   node scripts/webmcp-diag.mjs [url]
 *   HEADFUL=1 node scripts/webmcp-diag.mjs https://doodleai.art/
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANARY_BIN =
  process.env.CANARY_BIN ||
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
const PROFILE = join(process.env.KIROCREW_SCRATCH || tmpdir(), `canary-webmcp-diag-${process.pid}`);
const PORT = Number(process.env.WEBMCP_CDP_PORT || 9344);
const CDP = `http://127.0.0.1:${PORT}`;
const URL_ARG = process.argv[2] || 'http://localhost:4321/';
const HEADLESS = process.env.HEADFUL !== '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startBrowser() {
  if (!existsSync(CANARY_BIN)) throw new Error(`Canary not found at ${CANARY_BIN}`);
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
      // CDP endpoint not up yet — swallow and keep polling until the deadline.
    }
    await sleep(400);
  }
  throw new Error('CDP never became reachable');
}

async function pageTarget() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const p = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!p) throw new Error('no page target');
  return p;
}

function connect(wsUrl, onEvent) {
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
    ws.addEventListener('error', () => reject(new Error('ws error')));
    ws.addEventListener('close', (e) => {
      const err = new Error(`devtools socket closed (${e.code})`);
      for (const p of pending.values()) p.rej(err);
      pending.clear();
      reject(err);
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error)));
        else p.res(msg.result);
      } else if (msg.method) onEvent(msg);
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
    return { __threw: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  }
  return r.result.value;
}

/* ------------------------------------------------------------------ probes */

const PROBE_API = `(() => {
  const out = { location: location.href };
  const grab = (host, label) => {
    const mc = host && host.modelContext;
    if (!mc) return null;
    const proto = Object.getPrototypeOf(mc);
    return {
      where: label,
      ctor: proto && proto.constructor && proto.constructor.name,
      own: Object.getOwnPropertyNames(mc),
      protoMembers: proto ? Object.getOwnPropertyNames(proto) : [],
    };
  };
  out.document = grab(document, 'document.modelContext');
  out.navigator = grab(navigator, 'navigator.modelContext');
  out.windowAgent = typeof window.agent;
  out.ourFlag = !!window.__doodleWebMcpReady;
  out.declarativeForms = [...document.querySelectorAll('form[toolname]')].map(f => f.getAttribute('toolname'));
  return out;
})()`;

const PROBE_TOOLS = `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== 'function') return { api: false };
  try {
    const raw = await mc.getTools();
    return { api: true, count: raw.length, names: raw.map(t => t.name) };
  } catch (e) { return { api: true, error: String(e) }; }
})()`;

/* Register a probe tool with EXACTLY the shape production uses, and surface the
   rejection reason instead of swallowing it. */
const PROBE_REGISTER = `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return { api: false };
  const results = {};
  const attempt = async (label, tool, options) => {
    try {
      const r = await mc.registerTool(tool, options);
      results[label] = { ok: true, returned: typeof r };
    } catch (e) {
      results[label] = { ok: false, error: (e && (e.name + ': ' + e.message)) || String(e) };
    }
  };

  // a) minimal spec-shape tool, MCP content envelope
  await attempt('minimal', {
    name: 'diag-minimal',
    description: 'Diagnostic probe tool.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  });

  // b) our production shape: snake_case name, annotations incl. untrustedContentHint,
  //    required array, bare-string return
  await attempt('production_shape', {
    name: 'diag_production_shape',
    description: 'Diagnostic probe replicating the production tool shape exactly.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'x' } }, required: [] },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async (args, ctx) => 'plain string return',
  }, { signal: new AbortController().signal });

  // c) same but with an already-aborted signal (registration should be a no-op/reject)
  const ac = new AbortController(); ac.abort();
  await attempt('aborted_signal', {
    name: 'diag_aborted',
    description: 'Diagnostic probe with a pre-aborted signal.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => 'x',
  }, { signal: ac.signal });

  let after = [];
  try { after = (await mc.getTools()).map(t => t.name); } catch {}
  return { api: true, results, after };
})()`;

/* ------------------------------------------------------------------- main */

const child = startBrowser();
const logs = [];
let client;
try {
  const browser = await waitForCdp();
  console.log(`browser: ${browser}`);
  console.log(`url:     ${URL_ARG}\n`);
  const target = await pageTarget();
  client = await connect(target.webSocketDebuggerUrl, (msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      logs.push(`[console.${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[uncaught] ${d.exception?.description ?? d.text} @ ${d.url ?? '?'}:${d.lineNumber}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') {
        logs.push(`[${e.source}/${e.level}] ${e.text} ${e.url ? `(${e.url})` : ''}`);
      }
    }
  });

  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');

  await client.send('Page.navigate', { url: URL_ARG });
  await sleep(6000);

  console.log('--- console / errors -------------------------------------------');
  if (logs.length === 0) console.log('  (none)');
  for (const l of logs.slice(0, 40)) console.log(`  ${l}`);

  console.log('\n--- API surface ------------------------------------------------');
  console.log(JSON.stringify(await ev(client, PROBE_API), null, 2));

  console.log('\n--- getTools() -------------------------------------------------');
  console.log(JSON.stringify(await ev(client, PROBE_TOOLS), null, 2));

  console.log('\n--- registerTool() rejection reasons ---------------------------');
  console.log(JSON.stringify(await ev(client, PROBE_REGISTER), null, 2));
} catch (err) {
  console.error(`\nDIAG FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  try {
    client?.close();
  } catch {
    // Best-effort cleanup: the socket may already be closed on the way out.
  }
  child.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}
