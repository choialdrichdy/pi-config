/**
 * Web search backends for web-access.
 *
 * duckduckgo: keyless HTML endpoint, always usable (rate limits apply).
 * tavily / brave: only when the corresponding API key env var is set.
 *
 * All results are normalized to { title, url, snippet }.
 */

import { parseHTML } from "linkedom";
import { combineSignals } from "./ssrf.ts";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResult {
  provider: string;
  /** Provider-synthesized answer, when the backend offers one. */
  answer?: string;
  hits: SearchHit[];
}

export interface SearchOptions {
  numResults?: number;
  recencyFilter?: "day" | "week" | "month" | "year";
  domainFilter?: string[];
  signal?: AbortSignal;
}

export const SEARCH_PROVIDERS = ["auto", "duckduckgo", "tavily", "brave"] as const;
export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

const SEARCH_TIMEOUT_MS = 30_000;
const DDG_BASE = "https://html.duckduckgo.com/html/";
const MAX_RESULTS = 20;

interface DomainFilters {
  allowed: string[];
  blocked: string[];
}

function normalizeCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(Math.floor(value), MAX_RESULTS));
}

function normalizeDomain(raw: string): string | null {
  let input = raw.trim().toLowerCase();
  if (!input) return null;
  if (input.startsWith("-")) input = input.slice(1).trim();
  if (!input) return null;
  try {
    const parsed = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    input = parsed.hostname;
  } catch {
    input = input.split("/")[0]?.split(":")[0] ?? "";
  }
  input = input.replace(/^\.+|\.+$/g, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input) ? input : null;
}

function normalizeDomainFilters(raw: string[] | undefined): DomainFilters {
  const filters: DomainFilters = { allowed: [], blocked: [] };
  for (const entry of raw ?? []) {
    const domain = normalizeDomain(entry);
    if (!domain) continue;
    const target = entry.trim().startsWith("-") ? filters.blocked : filters.allowed;
    if (!target.includes(domain)) target.push(domain);
  }
  return filters;
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function filterByDomain(url: string, filters: DomainFilters): boolean {
  if (filters.allowed.length === 0 && filters.blocked.length === 0) return true;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (filters.allowed.length > 0 && !filters.allowed.some((d) => hostMatches(hostname, d))) {
    return false;
  }
  return !filters.blocked.some((d) => hostMatches(hostname, d));
}

// ---- DuckDuckGo (keyless) -------------------------------------------------

function decodeDdgUrl(href: string): string | null {
  try {
    const link = new URL(href, DDG_BASE);
    const destination = link.searchParams.get("uddg") ?? link.href;
    const url = new URL(destination);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

async function duckduckgoSearch(query: string, options: SearchOptions): Promise<SearchResult> {
  const url = new URL(DDG_BASE);
  url.searchParams.set("q", query);
  const filters = normalizeDomainFilters(options.domainFilter);
  const numResults = normalizeCount(options.numResults);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/html",
      "accept-language": "en-US,en",
      "User-Agent": "Mozilla/5.0 (compatible; pi-web-access/0.1; +https://pi.dev)",
    },
    signal: combineSignals(options.signal, SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `DuckDuckGo search failed with status ${response.status}. ` +
        `If it is rate-limiting us, set TAVILY_API_KEY or BRAVE_API_KEY and retry with provider=tavily or provider=brave.`,
    );
  }

  const { document } = parseHTML(await response.text());
  const hits: SearchHit[] = [];
  for (const container of document.querySelectorAll(".result")) {
    if (container.classList.contains("result--ad")) continue;
    const anchor = container.querySelector(".result__a");
    const title = anchor?.textContent?.trim() ?? "";
    const href = anchor?.getAttribute("href")?.trim() ?? "";
    const resultUrl = href ? decodeDdgUrl(href) : null;
    if (!title || !resultUrl) continue;
    if (!filterByDomain(resultUrl, filters)) continue;
    const snippet = container.querySelector(".result__snippet")?.textContent?.trim() ?? "";
    hits.push({ title, url: resultUrl, snippet });
    if (hits.length >= numResults) break;
  }
  if (hits.length === 0) {
    throw new Error("DuckDuckGo returned no parseable results. Try again or switch providers.");
  }
  return { provider: "duckduckgo", hits };
}

// ---- Tavily (optional key) ------------------------------------------------

async function tavilySearch(query: string, options: SearchOptions): Promise<SearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Tavily selected but TAVILY_API_KEY is not set. Get a free key at https://app.tavily.com/ and export it.",
    );
  }
  const body: Record<string, unknown> = {
    query,
    search_depth: "basic",
    max_results: normalizeCount(options.numResults),
    include_answer: true,
  };
  if (options.recencyFilter) body.time_range = options.recencyFilter;
  const filters = normalizeDomainFilters(options.domainFilter);
  if (filters.allowed.length > 0) body.include_domains = filters.allowed;
  if (filters.blocked.length > 0) body.exclude_domains = filters.blocked;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: combineSignals(options.signal, SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Tavily API error ${response.status} (${await response.text()}).`);
  }
  const data = (await response.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const hits: SearchHit[] = [];
  for (const item of data.results ?? []) {
    if (!item.url) continue;
    hits.push({
      title: item.title || "Result",
      url: item.url,
      snippet: typeof item.content === "string" ? item.content.replace(/\s+/g, " ").trim() : "",
    });
    if (hits.length >= normalizeCount(options.numResults)) break;
  }
  if (hits.length === 0) throw new Error("Tavily returned no results.");
  return { provider: "tavily", answer: data.answer, hits };
}

// ---- Brave (optional) -----------------------------------------------------

const BRAVE_FRESHNESS: Record<string, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

async function braveSearch(query: string, options: SearchOptions): Promise<SearchResult> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Brave selected but BRAVE_API_KEY is not set. Get a free key at https://brave.com/search/api/ and export it.",
    );
  }
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(normalizeCount(options.numResults)));
  const freshness = options.recencyFilter ? BRAVE_FRESHNESS[options.recencyFilter] : undefined;
  if (freshness) url.searchParams.set("freshness", freshness);
  const filters = normalizeDomainFilters(options.domainFilter);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: combineSignals(options.signal, SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Brave Search API error ${response.status} (${await response.text()}).`);
  }
  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> };
  };
  const hits: SearchHit[] = [];
  for (const item of data.web?.results ?? []) {
    if (!item.url) continue;
    if (!filterByDomain(item.url, filters)) continue;
    hits.push({
      title: item.title || "Result",
      url: item.url,
      snippet:
        typeof item.description === "string"
          ? item.description.replace(/\s+/g, " ").trim()
          : (item.age ?? ""),
    });
    if (hits.length >= normalizeCount(options.numResults)) break;
  }
  if (hits.length === 0) throw new Error("Brave returned no results.");
  return { provider: "brave", hits };
}

// ---- routing --------------------------------------------------------------

/** Resolve which provider runs for `auto`. */
function resolveAutoProvider(): SearchProvider {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_API_KEY) return "brave";
  return "duckduckgo";
}

export async function searchWeb(
  query: string,
  requested: SearchProvider | undefined,
  options: SearchOptions,
): Promise<SearchResult> {
  const provider = requested === undefined || requested === "auto" ? resolveAutoProvider() : requested;
  if (provider === "duckduckgo") return duckduckgoSearch(query, options);
  if (provider === "tavily") return tavilySearch(query, options);
  return braveSearch(query, options);
}