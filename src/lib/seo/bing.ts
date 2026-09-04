/* Bing Webmaster API client — reading what Bing actually did with our URLs.
 *
 * This is the OTHER half of the search-index picture, and it needs a DIFFERENT
 * credential from IndexNow. The IndexNow key (INDEXNOW_KEY) is an ownership
 * proof for *submitting*; reading index status needs a Bing Webmaster API key
 * (BING_WEBMASTER_API_KEY) generated under Bing Webmaster Tools → Settings →
 * API access. Neither one works in the other's place.
 *
 * WHAT THIS CAN AND CANNOT TELL YOU. `UrlInfo` carries AnchorCount,
 * DiscoveryDate, DocumentSize, HttpStatus, IsPage, LastCrawledDate,
 * TotalChildUrlCount and Url — and no "indexed" boolean. So the strongest honest
 * claim from a URL appearing in this response is "Bing holds index data for this
 * URL and treats it as a page", which is what `verdictFor` maps to `indexed`.
 * It is NOT the same statement as Google's URL Inspection `verdict: PASS`, and
 * this file must not pretend otherwise.
 *
 * Docs: https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getchildrenurlinfo
 */
import type { SeoVerdict } from "../../db/schema/seo";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/** Bing returns paged children; this bounds a runaway tree walk. */
const MAX_PAGES_PER_DIR = 20;

export interface BingUrlInfo {
  url: string;
  isPage: boolean;
  httpStatus: number;
  documentSize: number;
  anchorCount: number;
  totalChildUrlCount: number;
  discoveredAt: Date | null;
  lastCrawledAt: Date | null;
}

/**
 * Parse Bing's `/Date(1315349995284-0700)/` scalar.
 *
 * The epoch-millis part is already absolute UTC, so the trailing offset is
 * presentational and deliberately ignored — adding it would shift every
 * timestamp by the API server's timezone. Returns null rather than an Invalid
 * Date so a codec failure cannot be written to the database as a real value.
 */
export function parseDotNetDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value);
  if (!match) {
    // ISO is also observed on the XML surface; accept it rather than dropping data.
    const iso = new Date(value);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toUrlInfo(raw: Record<string, unknown>): BingUrlInfo | null {
  const url = typeof raw.Url === "string" ? raw.Url : null;
  if (!url) return null;
  return {
    url,
    isPage: raw.IsPage === true,
    // HttpStatus 0 appears in Bing's own samples and means "no status recorded",
    // NOT a failure — treating it as one would mark healthy pages as excluded.
    httpStatus: typeof raw.HttpStatus === "number" ? raw.HttpStatus : 0,
    documentSize: typeof raw.DocumentSize === "number" ? raw.DocumentSize : 0,
    anchorCount: typeof raw.AnchorCount === "number" ? raw.AnchorCount : 0,
    totalChildUrlCount:
      typeof raw.TotalChildUrlCount === "number" ? raw.TotalChildUrlCount : 0,
    discoveredAt: parseDotNetDate(raw.DiscoveryDate),
    lastCrawledAt: parseDotNetDate(raw.LastCrawledDate),
  };
}

/**
 * Normalise one UrlInfo into the verdict the admin table renders.
 *
 * `indexed` means "Bing holds index data for this URL as a page" — see the file
 * header for why that is the ceiling of what this API supports. A non-page entry
 * is a directory node, not a document, so it is never a verdict about a page.
 */
export function verdictFor(info: BingUrlInfo): SeoVerdict {
  if (!info.isPage) return "excluded";
  if (info.httpStatus >= 400) return "excluded";
  if (info.httpStatus >= 300 && info.httpStatus < 400) return "duplicate";
  // Crawled but empty is Bing telling us it fetched something with no document.
  if (info.lastCrawledAt && info.documentSize === 0 && info.httpStatus === 0) {
    return "crawled_not_indexed";
  }
  return "indexed";
}

export interface BingRequestFailure {
  status: number | null;
  message: string;
}

async function post(
  method: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown } | { failure: BingRequestFailure }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${method}?apikey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // No status code: a transport failure is safe to retry on the next tick,
    // unlike a 401, so callers must be able to tell them apart.
    return {
      failure: {
        status: null,
        message: `Could not reach the Bing Webmaster API: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    };
  }

  const text = await response.text();
  if (!response.ok) {
    return { failure: { status: response.status, message: describe(response.status, text) } };
  }
  try {
    // The whole surface wraps its payload in `d`, arrays included.
    return { data: (JSON.parse(text) as { d?: unknown }).d };
  } catch {
    return {
      failure: { status: response.status, message: "Bing returned a non-JSON body." },
    };
  }
}

function describe(status: number, body: string): string {
  const detail = body.slice(0, 200).replace(/\s+/g, " ").trim();
  if (status === 401 || status === 403) {
    return `Bing rejected the API key (${status}). Regenerate it under Bing Webmaster Tools → Settings → API access.`;
  }
  if (status === 400) {
    return `Bing rejected the request (400)${detail ? `: ${detail}` : ""}. Usually a siteUrl that is not a verified property.`;
  }
  if (status === 429) return "Bing is rate-limiting us (429). Back off before retrying.";
  return `Bing returned ${status}${detail ? `: ${detail}` : ""}.`;
}

/** One level of children for a directory node. `page` is zero-based. */
export async function fetchChildren(
  apiKey: string,
  siteUrl: string,
  url: string,
  page: number,
): Promise<{ entries: BingUrlInfo[] } | { failure: BingRequestFailure }> {
  const result = await post("GetChildrenUrlInfo", apiKey, {
    siteUrl,
    url,
    page,
    filterProperties: {
      __type: "FilterProperties:#Microsoft.Bing.Webmaster.Api",
      // 0 is `Any` on every one of these enums; we want the unfiltered view.
      CrawlDateFilter: 0,
      DiscoveredDateFilter: 0,
      DocFlagsFilters: 0,
      HttpCodeFilters: 0,
    },
  });
  if ("failure" in result) return result;
  if (!Array.isArray(result.data)) return { entries: [] };
  return {
    entries: result.data
      .map((row) => toUrlInfo(row as Record<string, unknown>))
      .filter((row): row is BingUrlInfo => row !== null),
  };
}

/** Index details for a single URL. Used to seed the sweep at the site root. */
export async function fetchUrlInfo(
  apiKey: string,
  siteUrl: string,
  url: string,
): Promise<{ info: BingUrlInfo | null } | { failure: BingRequestFailure }> {
  const result = await post("GetUrlInfo", apiKey, { siteUrl, url });
  if ("failure" in result) return result;
  if (!result.data || typeof result.data !== "object") return { info: null };
  return { info: toUrlInfo(result.data as Record<string, unknown>) };
}

export { MAX_PAGES_PER_DIR };
