# web-access

A pi extension that gives the agent live web access, modeled on the architecture
and patterns of [pi-web-access](https://github.com/nicobailon/pi-web-access) but
kept deliberately small.

## What it adds

- **`web_search`** - live web search. Backends:
  - **DuckDuckGo** (default, keyless) - HTML endpoint, no account or key.
  - **Tavily** - preferred automatically when `TAVILY_API_KEY` is set
    (free key at <https://app.tavily.com/>).
  - **Brave Search API** - preferred automatically when `BRAVE_API_KEY` is set
    (free key at <https://brave.com/search/api/>).
  - Resolution order: `TAVILY_API_KEY` > `BRAVE_API_KEY` > DuckDuckGo.
    Override per call with `provider: "tavily" | "brave" | "duckduckgo"`.
- **`web_fetch`** - fetch a URL and get readable content:
  - **HTML** - Mozilla Readability + turndown to markdown.
  - **PDF** - text extracted locally with `unpdf` (no external service),
    page by page. Image-only/scanned PDFs return a clear error.
  - **GitHub** - public repos only. Roots and trees get a shallow `git clone`
    (size-gated) for a real file listing plus README; `/blob` and `/raw` URLs
    fetch the file directly from `raw.githubusercontent.com`. If git is
    unavailable or the clone fails, the GitHub REST API is used as a fallback.
  - Mode is auto-detected by the URL; override with `mode`.
  - SSRF guard rejects private/loopback/link-local/reserved addresses before
    any request is sent, and re-validates every redirect hop.

## Setup

The extension lives at `extensions/web-access/` in this repo (symlinked into
`~/.pi/agent/extensions/web-access`). Dependencies:

```bash
cd extensions/web-access
npm install
```

Then `/reload` in pi. There is no other configuration. The API-key env vars are
checked at call time, so exporting `TAVILY_API_KEY`, `BRAVE_API_KEY`, or
`GITHUB_TOKEN` (for higher GitHub API rate limits) takes effect without a reload.

## Security properties

- Only `http`/`https` fetch targets; URL hostnames are DNS-resolved and every
  resolved address is checked against RFC1918, loopback, link-local, CGNAT,
  TUN/fake-IP proxy space, multicast, and reserved ranges (IPv4 and IPv6).
- Redirect hops are re-validated with `redirect: "manual"`.
- Response bodies are capped (5 MB HTML / 20 MB PDF) and returned text is
  truncated by the caller.
- API keys are only sent to the intended API hostnames; errors on search calls
  never include the key.

## Non-goals

- YouTube / video frames (needs yt-dlp + ffmpeg or a vision model).
- OCR for image-only PDFs.
- Authentication, cookies, or browser rendering for JS-heavy pages.
- Persistent caching (future option).