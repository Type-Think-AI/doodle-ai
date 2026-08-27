/**
 * Formatting and utility helpers shared by every admin query module.
 */

/** Coerce D1's `unknown` typing to a safe number. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 58312 -> "58.3k". Used for KPI headlines and sidebar badges. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/** 4812 -> "4,812". For table cells, where exactness matters more than width. */
export function thousands(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Feb 4, 2026" — matches the format the Phase 1 dummy data used. */
export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "14m ago" / "3h ago" / "2d ago", or an em dash for never. */
export function relativeTime(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export interface DailyPoint {
  day: string;
  value: number;
}

/**
 * SQL GROUP BY only returns days that have rows. A chart with missing days
 * silently compresses its x-axis and misrepresents the trend, so absent days
 * are materialised as explicit zeroes here.
 */
export function fillDailyGaps(rows: DailyPoint[], days: number): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

/** Points for an inline SVG polyline. Kept here so every chart shares one. */
export function polylinePoints(values: number[], w: number, h: number, pad: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `${pad},${h / 2} ${w - pad},${h / 2}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (values.length - 1);
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
