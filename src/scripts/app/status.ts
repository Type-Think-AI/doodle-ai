/* Keeps /status current without a full reload.
 *
 * The page is server-rendered, so this is strictly an enhancement — if it never
 * runs, the page is still correct, just frozen at load time. That ordering is
 * deliberate: a status page must not depend on client JavaScript to tell the
 * truth.
 *
 * Polling stops while the tab is hidden. A background tab quietly probing
 * fifteen components forever is exactly the kind of self-inflicted load this
 * feature is otherwise careful to avoid.
 */

interface StatusResponse {
  summary: { state: string; headline: string; detail: string };
  components: { id: string; state: string; note: string | null; latencyMs: number | null }[];
  checkedAt: string;
}

const root = document.querySelector<HTMLElement>(".st");
const headline = document.getElementById("stHeadline");
const checked = document.getElementById("stChecked");
const verdict = document.querySelector<HTMLElement>(".st-verdict");

const STATES = ["operational", "degraded", "down", "metered"];
const intervalMs = Math.max(15, Number(root?.dataset.refreshAfter ?? 30)) * 1000;

let timer: number | undefined;
let stopped = false;

function setStateClass(el: Element | null, state: string, prefix: string): void {
  if (!el) return;
  for (const s of STATES) el.classList.remove(`${prefix}${s}`);
  el.classList.add(`${prefix}${state}`);
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}` : `${ms}`;
}

async function refresh(): Promise<void> {
  try {
    // cache: no-store bypasses the browser cache only. The 20s edge cache still
    // applies, which is what keeps a pinned tab from amplifying into real probes.
    const res = await fetch("/api/status", { cache: "no-store", headers: { accept: "application/json" } });
    // 503 is a legitimate, fully-formed answer here (some component is down),
    // so parse it rather than treating it as a failed request.
    if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StatusResponse;

    if (headline) headline.textContent = data.summary.headline;
    setStateClass(verdict, data.summary.state, "is-");

    for (const c of data.components) {
      const cell = document.querySelector<HTMLElement>(`.st-cell[data-component="${c.id}"]`);
      if (!cell) continue;
      setStateClass(cell, c.state, "is-");

      // Text nodes only — the state itself is carried by the class, so nothing
      // here needs to write markup.
      const note = cell.querySelector(".st-note-txt");
      if (note) note.textContent = c.note ?? "";

      const num = cell.querySelector(".st-num b");
      if (num) num.textContent = formatLatency(c.latencyMs);
      const unit = cell.querySelector(".st-unit");
      if (unit) unit.textContent = c.latencyMs !== null && c.latencyMs < 1000 ? "ms" : "";
    }

    if (checked) {
      checked.textContent = `${new Date(data.checkedAt).toISOString().slice(11, 16)}Z`;
      checked.setAttribute("datetime", data.checkedAt);
    }
  } catch {
    // Silent. An unreachable status endpoint is itself the signal, and the last
    // known state on screen is more useful than replacing it with an error.
  }
}

function schedule(): void {
  window.clearTimeout(timer);
  if (stopped || document.hidden) return;
  timer = window.setTimeout(async () => {
    await refresh();
    schedule();
  }, intervalMs);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    window.clearTimeout(timer);
  } else {
    void refresh();
    schedule();
  }
});

window.addEventListener("pagehide", () => {
  stopped = true;
  window.clearTimeout(timer);
});

if (root) schedule();
