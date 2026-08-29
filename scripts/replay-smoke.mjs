#!/usr/bin/env node
/**
 * Session Replay smoke test — proves recording actually starts, rather than
 * proving the config object exists.
 *
 * Registration-looks-right is not evidence: the recorder is a separate bundle
 * fetched at runtime, the sampling decision happens inside the SDK, and an
 * extension or a CSP mistake can break either without touching our code. So this
 * drives a real headless Chrome and asserts on observed behaviour:
 *
 *   1. the SDK initialized with no error
 *   2. the sampling decision selected this session
 *   3. a replay id exists  → rrweb is running
 *   4. the recorder bundle was fetched from cdn.mxpnl.com
 *   5. replay data reached api-js.mixpanel.com
 *   6. text/inputs/images are NOT masked (the point of this configuration)
 *
 * Session Replay needs no browser flag or origin trial — unlike WebMCP — so this
 * runs on whatever Chrome is installed.
 *
 *   node scripts/replay-smoke.mjs [url]
 *   HEADFUL=1 node scripts/replay-smoke.mjs https://doodleai.art/
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

const BIN = CANDIDATES.find((p) => existsSync(p));
const PROFILE = join(process.env.KIROCREW_SCRATCH || tmpdir(), `chrome-replay-smoke-${process.pid}`);
const PORT = Number(process.env.REPLAY_CDP_PORT || 9355);
const CDP = `http://127.0.0.1:${PORT}`;
const BASE = process.argv[2] || 'http://localhost:4321/';
const HEADLESS = process.env.HEADFUL !== '1';
/** Recorder download + first batch upload. Mixpanel flushes every ~10s. */
const WAIT_MS = Number(process.env.REPLAY_WAIT_MS || 30_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function targetUrl() {
  const u = new URL(BASE);
  // Localhost is sampled at 0% by design; this flag opts the run in.
  u.searchParams.set('replay', '1');
  return u.href;
}

function startBrowser() {
  if (!BIN) throw new Error(`No Chrome found. Tried:\n  ${CANDIDATES.join('\n  ')}`);
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
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
  const child = spawn(BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', () => {});
  return child;
}

async function waitForCdp(timeoutMs = 25_000) {
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
        if (msg.error) {
          p.rej(new Error(JSON.stringify(msg.error)));
        } else {
          p.res(msg.result);
        }
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

const PROBE = `(() => {
  const d = typeof window.__doodleReplay === 'function' ? window.__doodleReplay() : null;
  const mp = window.mixpanel;
  const cfg = (key) => {
    try { return mp && typeof mp.get_config === 'function' ? mp.get_config(key) : '<no get_config>'; }
    catch (e) { return 'ERR ' + e.name; }
  };
  return {
    diagnostics: d,
    config: d && d.initialized ? {
      record_sessions_percent: cfg('record_sessions_percent'),
      record_mask_all_text: cfg('record_mask_all_text'),
      record_mask_all_inputs: cfg('record_mask_all_inputs'),
      record_block_selector: cfg('record_block_selector'),
      record_canvas: cfg('record_canvas'),
      record_console: cfg('record_console'),
      record_network: cfg('record_network'),
      record_heatmap_data: cfg('record_heatmap_data'),
    } : null,
  };
})()`;

/* ------------------------------------------------------------------- runner */

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = startBrowser();
let client;
const requests = [];
const consoleErrors = [];

try {
  const version = await waitForCdp();
  console.log(`browser: ${version}`);
  console.log(`target:  ${targetUrl()}\n`);

  const target = await pageTarget();
  client = await connect(target.webSocketDebuggerUrl, (msg) => {
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
    }
  });

  await client.send('Network.enable');
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Page.navigate', { url: targetUrl() });

  // Poll until rrweb reports a replay id, or the budget runs out.
  let probe = null;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(1500);
    probe = await ev(client, PROBE);
    if (probe?.diagnostics?.recording) break;
  }

  // Capture starting is not the same as data arriving. Mixpanel batches replay
  // payloads and flushes every ~10s, so nothing has been uploaded at the moment
  // a replay id first appears — a test that asserts delivery here would always
  // fail, and one that skipped the assertion would miss a blocked ingest host.
  const isReplayIngest = (u) => u.includes('api-js.mixpanel.com/record');
  if (probe?.diagnostics?.recording) {
    const flushDeadline = Date.now() + 20_000;
    while (Date.now() < flushDeadline && !requests.some(isReplayIngest)) {
      await sleep(2000);
    }
    probe = await ev(client, PROBE);
  }

  const d = probe?.diagnostics ?? null;
  const cfg = probe?.config ?? {};

  check('analytics module booted', Boolean(d), d ? '' : 'window.__doodleReplay() missing');
  check('mixpanel init did not throw', Boolean(d && d.initialized && !d.error), d?.error ?? '');
  check('session sampled for recording', d?.sessionsPercent === 100, `percent=${d?.sessionsPercent}`);
  check('replay is capturing', Boolean(d?.recording), d?.replayId ? `id=${d.replayId}` : 'no replay id');
  check(
    'recorder bundle fetched from CDN',
    requests.some((u) => u.includes('cdn.mxpnl.com/libs/mixpanel-recorder')),
    // Guards the exact bug this script was written after: the un-built
    // src/loaders entry requests `libs/__MP_RECORDER_FILENAME__`, which Chrome
    // blocks with ERR_BLOCKED_BY_ORB while every config value still reads back
    // as correct. See recorder_src in replay-config.ts.
    requests.find((u) => u.includes('cdn.mxpnl.com')) ?? 'no cdn.mxpnl.com request at all',
  );
  check(
    'replay data uploaded to Mixpanel',
    requests.some(isReplayIngest),
    `${requests.filter(isReplayIngest).length} /record request(s), ` +
      `${requests.filter((u) => u.includes('api-js.mixpanel.com')).length} total ingest`,
  );
  check('text is NOT masked', cfg.record_mask_all_text === false, `record_mask_all_text=${cfg.record_mask_all_text}`);
  check('inputs are NOT masked', cfg.record_mask_all_inputs === false, `record_mask_all_inputs=${cfg.record_mask_all_inputs}`);
  check('images are NOT blocked', cfg.record_block_selector === '', `record_block_selector="${cfg.record_block_selector}"`);
  check('canvas capture on', cfg.record_canvas === true);
  check('console capture on', cfg.record_console === true);
  check('network capture on', cfg.record_network === true);
  check('heatmap/rage-click capture on', cfg.record_heatmap_data === true);
  check('replay url resolvable', typeof d?.replayUrl === 'string' && d.replayUrl.length > 0, d?.replayUrl ?? 'null');
  check('no uncaught page exceptions', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} finally {
  try {
    client?.close();
  } catch {
    /* already closed */
  }
  browser.kill('SIGKILL');
  rmSync(PROFILE, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
