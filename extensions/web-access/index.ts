/**
 * web-access: live web search and content fetching for pi.
 *
 * - web_search: DuckDuckGo by default (keyless). Set TAVILY_API_KEY or
 *   BRAVE_API_KEY and those backends are preferred automatically.
 * - web_fetch: readable HTML extraction, PDF text extraction, and GitHub
 *   repo/file retrieval. All remote requests run through the SSRF guard.
 *
 * Install the npm dependencies in this directory first:
 *   npm install
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import {
  SEARCH_PROVIDERS,
  searchWeb,
  type SearchProvider,
} from "./lib/search.ts";
import {
  fetchRemoteUrl,
  readResponseBody,
  decodeBody,
} from "./lib/ssrf.ts";
import { extractReadable, extractPdfText } from "./lib/extract.ts";
import { extractGitHub, isGitHubUrl } from "./lib/github.ts";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer, 0, bytes.byteLength).set(bytes);
  return buffer;
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 40_000;
const MAX_MAX_CHARS = 200_000;
const PDF_MAX_PAGES = 50;

const FETCH_MODES = ["auto", "readable", "raw", "pdf"] as const;
type FetchMode = (typeof FETCH_MODES)[number];

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = "\n\n[truncated - content exceeds the character limit]";
  const cut = maxChars - marker.length;
  const safeCut = text.lastIndexOf("\n", cut) > 0 ? text.lastIndexOf("\n", cut) : cut;
  return text.slice(0, safeCut) + marker;
}

function searchMarkdown(result: Awaited<ReturnType<typeof searchWeb>>): string {
  const parts: string[] = [];
  if (result.answer) {
    parts.push(result.answer);
    parts.push("");
  }
  result.hits.forEach((hit, index) => {
    const snippet = hit.snippet ? `\n${hit.snippet}` : "";
    parts.push(`${index + 1}. **${hit.title}**\n   ${hit.url}${snippet}`);
  });
  return parts.join("\n\n");
}

export default function webAccessExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the live web using DuckDuckGo (keyless), Tavily, or Brave. Returns up to 20 titled results with URLs and snippets. " +
      "For library/API/SDK questions, prefer the Context7 tools (resolve-library-id, query-docs) when they cover the library; " +
      "use web_search for general, current, or repository-specific information.",
    promptSnippet:
      "Query live web search for current information, package versions, docs changes, pricing, release notes, and anything likely to postdate training data.",
    promptGuidelines: [
      "Use web_search when the user asks for live or recent information, package versions outside Context7's library set, pricing, release notes, or anything likely to postdate your training data.",
      "Use web_search with a focused query; for broad research tasks issue 2-4 searches with varied angles rather than a single broad query.",
      "After using web_search, cite sources as markdown links in your answer, and use web_fetch to read promising URLs instead of guessing from snippets.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "Search query, phrased as you would type into a search engine.",
      }),
      provider: Type.Optional(
        StringEnum(SEARCH_PROVIDERS, {
          description:
            "Backend: auto (default) prefers Tavily when TAVILY_API_KEY is set, then Brave when BRAVE_API_KEY is set, else DuckDuckGo (keyless).",
        }),
      ),
      num_results: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 20, description: "Results to return (default 5, max 20)." }),
      ),
      recency_filter: Type.Optional(
        StringEnum(["day", "week", "month", "year"] as const, {
          description: "Restrict to recent results. Honored by Tavily and Brave; DuckDuckGo ignores it.",
        }),
      ),
      domain: Type.Optional(
        Type.Array(Type.String(), {
          description: "Domain filters: include 'example.com', exclude '-reddit.com'.",
        }),
      ),
    }),

    async execute(
      _toolCallId: string,
      params: {
        query?: string;
        provider?: SearchProvider;
        num_results?: number;
        recency_filter?: "day" | "week" | "month" | "year";
        domain?: string[];
      },
      signal,
      _onUpdate,
    ) {
      if (typeof params.query !== "string" || params.query.trim().length === 0) {
        throw new Error("web_search requires a non-empty `query`");
      }
      const result = await searchWeb(params.query.trim(), params.provider, {
        numResults: params.num_results,
        recencyFilter: params.recency_filter,
        domainFilter: params.domain,
        signal,
      });
      return {
        content: [{ type: "text", text: searchMarkdown(result) }],
        details: { provider: result.provider, count: result.hits.length },
      };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Fetch Web Content",
    description:
      "Fetch a URL and return the page as readable markdown. HTML goes through readability extraction, PDFs have text extracted page by page, and GitHub URLs return a listing or a file. " +
      "Output is capped for context; call again with explicit params when more of a specific page is needed.",
    promptSnippet:
      "Use to read the full content of a URL: articles, docs, PDFs, and GitHub repos or files. Prefer this when you already have a promising URL.",
    promptGuidelines: [
      "Use web_fetch when you already have a specific URL and need the actual page content instead of a search snippet.",
      "web_fetch handles HTML articles, PDF documents, and GitHub repository trees or files. It applies SSRF protection and size limits automatically.",
      "If web_fetch reports a page appears JavaScript-rendered, say so to the user rather than inventing content.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch (http or https only)." }),
      mode: Type.Optional(
        StringEnum(FETCH_MODES, {
          description:
            "auto (default) picks the handler from the URL: github.com -> GitHub, .pdf -> PDF, otherwise HTML readability. Force with readable/raw/pdf.",
        }),
      ),
      max_chars: Type.Optional(
        Type.Integer({
          minimum: 1000,
          maximum: MAX_MAX_CHARS,
          description: `Character limit for returned content (default ${DEFAULT_MAX_CHARS}).`,
        }),
      ),
    }),

    async execute(
      _toolCallId: string,
      params: { url?: string; mode?: FetchMode; max_chars?: number },
      signal,
      _onUpdate,
    ) {
      const rawUrl = (params.url ?? "").trim();
      if (!rawUrl) throw new Error("web_fetch requires a `url`");

      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        // Bare hosts like example.com are common; make them fetchable.
        try {
          url = new URL(`https://${rawUrl}`);
        } catch {
          throw new Error(`Invalid URL: ${rawUrl}`);
        }
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http and https URLs can be fetched");
      }

      const maxChars = Math.min(params.max_chars ?? DEFAULT_MAX_CHARS, MAX_MAX_CHARS);
      const mode = params.mode ?? "auto";
      const target = url.toString();
      const looksLikePdf = url.pathname.toLowerCase().endsWith(".pdf");

      // GitHub URLs are handled in their own module.
      if ((mode === "auto" || mode === "raw" || mode === "readable") && isGitHubUrl(target)) {
        const gh = await extractGitHub(target);
        return {
          content: [{ type: "text", text: truncateText(gh.content, maxChars) }],
          details: { kind: "github", title: gh.title, truncated: gh.content.length > maxChars },
        };
      }

      if (mode === "pdf" || (mode === "auto" && looksLikePdf)) {
        const response = await fetchRemoteUrl(target, {}, { timeoutMs: FETCH_TIMEOUT_MS, signal });
        const body = await readResponseBody(response, MAX_PDF_BYTES);
        const pdf = await extractPdfText(toArrayBuffer(body), PDF_MAX_PAGES);
        const header = pdf.title ? `# ${pdf.title}\n\n` : "";
        const pagesNote = pdf.truncatedPages
          ? `\n\n[This PDF has ${pdf.pages} pages; showed the first ${PDF_MAX_PAGES}.]\n`
          : "";
        return {
          content: [{ type: "text", text: truncateText(header + pdf.text + pagesNote, maxChars) }],
          details: { kind: "pdf", title: pdf.title, pages: pdf.pages, truncated: pdf.truncatedPages },
        };
      }

      if (mode === "raw") {
        const response = await fetchRemoteUrl(target, {}, { timeoutMs: FETCH_TIMEOUT_MS, signal });
        const bytes = await readResponseBody(response, MAX_HTML_BYTES);
        const text = decodeBody(bytes, response.headers.get("content-type"));
        return {
          content: [{ type: "text", text: truncateText(text, maxChars) }],
          details: { kind: "raw", truncated: text.length > maxChars },
        };
      }

      // readable (or auto-HTML)
      const response = await fetchRemoteUrl(target, {}, { timeoutMs: FETCH_TIMEOUT_MS, signal });
      const bytes = await readResponseBody(response, MAX_HTML_BYTES);
      const contentType = response.headers.get("content-type") ?? "";

      // PDF announced after the fetch: hand this to the PDF extractor.
      if (bytes.byteLength > 0 && contentType.toLowerCase().startsWith("application/pdf")) {
        const pdf = await extractPdfText(toArrayBuffer(bytes), PDF_MAX_PAGES);
        const header = pdf.title ? `# ${pdf.title}\n\n` : "";
        const pagesNote = pdf.truncatedPages
          ? `\n\n[This PDF has ${pdf.pages} pages; showed the first ${PDF_MAX_PAGES}.]\n`
          : "";
        return {
          content: [{ type: "text", text: truncateText(header + pdf.text + pagesNote, maxChars) }],
          details: { kind: "pdf", title: pdf.title, pages: pdf.pages, truncated: pdf.truncatedPages },
        };
      }

      const html = decodeBody(bytes, contentType);
      const readable = extractReadable(html);
      if (!readable) {
        throw new Error(
          "Could not extract readable content from this page. " +
            "It may be JavaScript-rendered (loaded dynamically) or contain no article text.",
        );
      }
      const header = readable.title ? `# ${readable.title}\n\n` : "";
      return {
        content: [{ type: "text", text: truncateText(header + readable.content, maxChars) }],
        details: { kind: "html", title: readable.title, truncated: readable.content.length > maxChars },
      };
    },
  });
}