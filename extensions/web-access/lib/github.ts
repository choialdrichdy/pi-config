/**
 * GitHub support for web-access.
 *
 * Repo and tree URLs get a shallow clone when git is available, giving a real
 * file tree the model can navigate locally. If git is missing or the clone
 * fails, we fall back to the GitHub REST API for listings plus
 * raw.githubusercontent for README / file content.
 *
 * Public repos only. Optionally export GITHUB_TOKEN for higher API rate limits.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fetchRemoteUrl, readResponseBody } from "./ssrf.ts";

const CLONE_ROOT = join(tmpdir(), "pi-web-access-github");
const MAX_CLONE_BYTES = 200 * 1024 * 1024;
const CLONE_TIMEOUT_MS = 45_000;
const MAX_LISTING_ENTRIES = 200;
const MAX_FILE_CHARS = 60_000;
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "svg",
  "zip", "gz", "tar", "bz2", "7z", "rar", "pdf", "ttf", "woff", "woff2",
  "mp3", "mp4", "mov", "avi", "webm", "mkv", "exe", "dll", "so", "dylib",
  "class", "jar", "pyc", "pyo", "o", "obj", "wasm", "woff2",
]);

export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  kind: "repo" | "tree" | "blob" | "raw";
  ref?: string;
  path: string;
}

export interface GitHubContent {
  title: string;
  content: string;
}

export function isGitHubUrl(rawUrl: string): boolean {
  return parseGitHubUrl(rawUrl) !== null;
}

export function parseGitHubUrl(raw: string): GitHubUrlInfo | null {
  try {
    const url = new URL(raw);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const [owner, repo] = segments;
    const kindSegment = segments[2]?.toLowerCase();
    if (kindSegment === "blob" || kindSegment === "tree" || kindSegment === "raw") {
      const rest = segments.slice(3);
      return { owner, repo, kind: kindSegment, ref: rest[0], path: rest.slice(1).join("/") };
    }
    // /owner/repo as well as /owner/repo/issues|releases|... all mean repo root.
    return { owner, repo, kind: "repo", path: "" };
  } catch {
    return null;
  }
}

// ---- small helpers --------------------------------------------------------

function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 4096);
  if (limit === 0) return true;
  let nulls = 0;
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) nulls++;
  }
  return nulls / limit > 0.05;
}

function isLikelyBinaryPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

function formatListing(dir: string, prefix: string): string {
  let entries: Array<{ name: string; type: "dir" | "file" }>;
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .map((e) => ({
        name: e.name,
        type: (e.isDirectory() || e.isSymbolicLink() ? "dir" : "file") as "dir" | "file",
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return "(empty directory)";
  }
  if (entries.length === 0) return "(empty directory)";
  const shown = entries.slice(0, MAX_LISTING_ENTRIES);
  const lines = shown.map((entry) =>
    entry.type === "dir" ? `- [${entry.name}/]` : `- ${entry.name}`,
  );
  if (entries.length > shown.length) lines.push(`- ... and ${entries.length - shown.length} more`);
  return `\`${prefix}\`\n\n${lines.join("\n")}`;
}

function readLocalTextFile(path: string): string | null {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_CLONE_BYTES || stat.size > MAX_FILE_CHARS) return null;
    const bytes = readFileSync(path);
    if (looksBinary(bytes) || isLikelyBinaryPath(path)) return null;
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

// ---- clone path -----------------------------------------------------------

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function shallowClone(owner: string, repo: string): string | null {
  if (!gitAvailable()) return null;
  let parent: string;
  try {
    mkdirSync(CLONE_ROOT, { recursive: true });
    parent = mkdtempSync(join(CLONE_ROOT, `${owner}__${repo}-`));
  } catch {
    return null;
  }
  const dest = join(parent, "repo");
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--single-branch", `https://github.com/${owner}/${repo}.git`, dest],
      { timeout: CLONE_TIMEOUT_MS, stdio: "pipe" },
    );
    return dest;
  } catch {
    return null;
  }
}

async function extractGitHubFromClone(owner: string, repo: string, path: string): Promise<GitHubContent | null> {
  const dest = shallowClone(owner, repo);
  if (!dest) return null;
  const localPath = path ? join(dest, path) : dest;

  const parts: string[] = [`# ${owner}/${repo}`];

  let isDir = false;
  try {
    isDir = statSync(localPath).isDirectory();
  } catch {
    const fallback = formatListing(dest, "/");
    parts.push(`> Path \`${path}\` was not found in the repository. Showing repository root:`);
    parts.push(fallback);
    const readme = readLocalTextFile(join(dest, "README.md"));
    if (readme !== null) parts.push("```markdown\n" + readme.trimEnd() + "\n```");
    return { title: `${owner}/${repo}`, content: parts.join("\n\n") };
  }

  if (!isDir) {
    const text = readLocalTextFile(localPath);
    if (text === null) {
      return {
        title: `${owner}/${repo}`,
        content: `${parts.join("\n\n")}\n\n\`${path}\` is a binary file or too large to inline.`,
      };
    }
    parts.push("```\n" + text.trimEnd() + "\n```");
    return { title: `${owner}/${repo}`, content: parts.join("\n\n") };
  }

  parts.push(formatListing(localPath, path ? `/${path}/` : "/"));
  if (!path) {
    const readme = await readLocalTextFile(join(dest, "README.md"));
    if (readme !== null) {
      parts.push("```markdown\n" + readme.trimEnd() + "\n```");
    }
  }
  return { title: `${owner}/${repo}`, content: parts.join("\n\n") };
}

// ---- REST API fallback ----------------------------------------------------

async function githubApi<T>(url: string, token: string | undefined): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "pi-web-access/0.1",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new Error(`GitHub API request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (response.status === 404) return null;
  if (response.status === 403) {
    throw new Error("GitHub API rate limited. Set GITHUB_TOKEN to raise the limit.");
  }
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchRawText(url: string): Promise<string> {
  const response = await fetchRemoteUrl(url, {}, { timeoutMs: 20_000 });
  if (!response.ok) {
    throw new Error(`Could not read file (HTTP ${response.status}).`);
  }
  const body = await readResponseBody(response, MAX_FILE_CHARS + 1024);
  if (body.length > MAX_FILE_CHARS || looksBinary(body)) {
    throw new Error("File is binary or too large to inline.");
  }
  return new TextDecoder("utf-8").decode(body);
}

async function tryApiListing(info: GitHubUrlInfo, token: string | undefined): Promise<GitHubContent | null> {
  const repoMeta = await githubApi<{
    description?: string | null;
    default_branch?: string;
    size?: number;
  }>(`https://api.github.com/repos/${info.owner}/${info.repo}`, token);
  if (!repoMeta) return null;
  const branch = info.ref ?? repoMeta.default_branch ?? "HEAD";

  const parts: string[] = [];
  parts.push(`# ${info.owner}/${info.repo}`);
  if (repoMeta.description) parts.push(repoMeta.description);
  if (typeof repoMeta.size === "number" && repoMeta.size > 0) {
    parts.push(`Repository size: ~${(repoMeta.size / 1024).toFixed(1)} MB`);
  }

  // Single file.
  if ((info.kind === "blob" || info.kind === "raw") && info.path && info.ref) {
    const rawUrl = `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${info.ref}/${info.path}`;
    try {
      parts.push("```\n" + (await fetchRawText(rawUrl)).trimEnd() + "\n```");
    } catch (err) {
      parts.push(`> ${err instanceof Error ? err.message : String(err)}`);
    }
    return { title: `${info.owner}/${info.repo}`, content: parts.join("\n\n") };
  }

  // Directory listing.
  const tree = await githubApi<{ tree?: Array<{ type?: string; path?: string }> }>(
    `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  if (!tree || !Array.isArray(tree.tree)) return null;

  const prefix = info.path ? `${info.path}/` : "";
  const entries = tree.tree
    .flatMap((entry) => {
      const entryPath = entry.path ?? "";
      if (!entryPath.startsWith(prefix)) return [];
      const name = entryPath.slice(prefix.length);
      if (!name || name.includes("/")) return [];
      return [{ name, type: entry.type === "tree" ? ("tree" as const) : ("blob" as const) }];
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const shown = entries.slice(0, MAX_LISTING_ENTRIES);
  const lines = shown.map((entry) =>
    entry.type === "tree" ? `- [${entry.name}/]` : `- ${entry.name}`,
  );
  if (entries.length > shown.length) lines.push(`- ... and ${entries.length - shown.length} more`);
  parts.push(`\`${info.path ? `/${info.path}/` : "/"}\`\n\n${lines.join("\n")}`);

  // README at that level, via raw.githubusercontent.
  for (const name of ["README.md", "README", "readme.md"]) {
    const readmePath = info.path ? `${info.path}/${name}` : name;
    const rawUrl = `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${branch}/${readmePath}`;
    try {
      parts.push("```markdown\n" + (await fetchRawText(rawUrl)).trimEnd() + "\n```");
      break;
    } catch {
      // No README at this level; keep going.
    }
  }

  return { title: `${info.owner}/${info.repo}`, content: parts.join("\n\n") };
}

// ---- entry point ----------------------------------------------------------

export async function extractGitHub(rawUrl: string): Promise<GitHubContent> {
  const info = parseGitHubUrl(rawUrl);
  if (!info) throw new Error("Not a GitHub URL");
  const token = process.env.GITHUB_TOKEN;

  // Single file: raw.githubusercontent is the cheapest path.
  if ((info.kind === "blob" || info.kind === "raw") && info.path && info.ref) {
    const rawUrl = `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${info.ref}/${info.path}`;
    let text: string;
    try {
      text = await fetchRawText(rawUrl);
    } catch {
      text = "";
    }
    if (text) {
      return { title: `${info.owner}/${info.repo}`, content: "```\n" + text.trimEnd() + "\n```" };
    }
  }

  // Repo/tree: prefer the clone, then the API.
  const fromClone = await extractGitHubFromClone(info.owner, info.repo, info.path);
  if (fromClone) return fromClone;
  const fromApi = await tryApiListing(info, token);
  if (fromApi) return fromApi;
  throw new Error(
    "Could not retrieve GitHub content: clone failed and the repository was not reachable via the API.",
  );
}