# pi-config

Personal configuration for [pi](https://github.com/earendil-works/pi-coding-agent) — the coding agent harness.

## Contents

```
pi-config/
├── AGENTS.md                  # Global persona — loaded at startup (always active)
├── extensions/
│   ├── ask-user-question.ts   # Interactive TUI tool for asking the user questions
│   ├── read-only-mode.ts      # /read-only command to enforce tool access restrictions
│   └── web-access/            # Live web search + fetch: HTML/PDF/GitHub content tools
├── skills/
│   ├── prd-engineering/       # Structured PRD interview → tight specs
│   ├── spec-driven/           # Implement features by tracing each AC to code
│   ├── code-review-ai/        # Code review for AI-generated code (AI-specific failure modes)
│   ├── pdf-reader/            # Read and comprehend PDF files
│   ├── stop-slop/             # Remove AI writing patterns from prose
│   ├── unslop/                # Always-on AI-tell removal for any writing
│   └── learning/              # Learning roadmaps + retrospectives
├── templates/
│   ├── PRD_TEMPLATE.md        # Reusable PRD document template
│   ├── AC_TEMPLATE.md         # How to write good acceptance criteria for AI
│   └── EVAL_RUBRIC.md         # Eval rubric — verifies AI output against ACs
├── prompts/
│   ├── prd.md                 # /prd — starts the PRD interview
│   ├── plan.md                # /plan — generates implementation plan from PRD
│   ├── review.md              # /review — runs AI-specific code review
│   └── eval.md                # /eval — evaluates output against rubric
├── themes/
│   └── gruvbox-dark-medium.json
└── README.md
```

## Global Config (AGENTS.md)

`AGENTS.md` at the project root is symlinked to `~/.pi/agent/AGENTS.md` and loaded at every startup. It defines:

- Stack and conventions (TypeScript, Go, Python)
- Hard rules (no code without a spec, ask before destructive actions, error handling is not optional)
- Workflow (plan → implement → review)
- Communication style (direct, concise, push back on ambiguity)

## Extensions

### ask-user-question

A custom tool (`ask_user_question`) that presents an interactive TUI for asking the user a question. Supports three modes:

- **Text** — free-form input with an editor
- **Single-select** — pick one option from a list
- **Multi-select** — pick multiple options with toggle/other

Includes a UI mutex to serialize concurrent calls, and exposes structured result details (status, answers, mode) for downstream rendering.

### read-only-mode

A `/read-only` command that restricts the agent to a minimal set of read-only tools (`read`, `grep`, `find`, `ls`). Features:

- Toggle, enable, disable, and status subcommands
- In-memory state (resets on pi restart)
- Widget and status bar indicators
- Hooks into `before_agent_start`, `tool_call`, `session_start`, `session_switch`, and `session_fork` to enforce restrictions
- Re-registers read-only tools pinned to the working directory of the active session

### web-access

Two tools that give the agent access to the live web:

- **`web_search`** - live search with keyless DuckDuckGo by default; set `TAVILY_API_KEY` or `BRAVE_API_KEY` to prefer those backends automatically
- **`web_fetch`** - reads a URL as readable markdown: HTML pages (readability extraction), PDFs (local unpdf text extraction), and GitHub repo listings/root READMEs or single files (shallow git clone with REST API fallback)

All remote requests pass through an SSRF guard that resolves DNS and rejects private/loopback/link-local/reserved addresses, validates every redirect hop, and caps response sizes. Requires `npm install` in `extensions/web-access/` (see its README).

## Skills

### prd-engineering

A structured interview process that transforms rough feature ideas into tight, implementable PRDs. Walks through intent capture, scope/boundaries, acceptance criteria, and architecture constraints. Designed to eliminate the steering problem — gaps in the spec are surfaced before code is written.

See [skills/prd-engineering/SKILL.md](skills/prd-engineering/SKILL.md).

### spec-driven

Implements features against a structured PRD spec. Every code change is traced to an acceptance criterion. Prevents scope creep, forces edge case handling, and stops when it hits a non-goal. Designed to work in pair with the PRD engineering skill.

See [skills/spec-driven/SKILL.md](skills/spec-driven/SKILL.md).

### code-review-ai

Structured code review tailored to AI-generated code. Covers AI-specific failure modes: hallucinated dependencies, plausible-but-wrong logic, missing error handling (the 20% problem), over-engineering, and security. Also checks AC coverage against the PRD and evaluates the agent's trajectory.

See [skills/code-review-ai/SKILL.md](skills/code-review-ai/SKILL.md).

### pdf-reader

Read and comprehend PDF files using text extraction + selective page rendering. Uses a hybrid approach for maximum comprehension of equations, diagrams, and structured content.

See [skills/pdf-reader/SKILL.md](skills/pdf-reader/SKILL.md).

### stop-slop

A skill that teaches the agent to eliminate predictable AI writing patterns from prose. Includes:

- Core rules in `SKILL.md`
- Reference files for banned phrases, structural patterns, and before/after examples

See [skills/stop-slop/README.md](skills/stop-slop/README.md) for details.

### unslop

A lightweight always-on companion to stop-slop: strips AI tells from any text being written, keeping a human voice. See [skills/unslop/SKILL.md](skills/unslop/SKILL.md).

### learning (`create-learning-path`, `run-learning-retrospective`)

Two skills for tracked learning: build a personalized roadmap with milestones and practice checkpoints, then evaluate progress, identify blockers, and adjust the plan in retrospectives. See [skills/learning/create-learning-path/SKILL.md](skills/learning/create-learning-path/SKILL.md) and [skills/learning/run-learning-retrospective/SKILL.md](skills/learning/run-learning-retrospective/SKILL.md).

## Templates

### PRD_TEMPLATE.md

A structured document template for Product Requirements Documents. Covers core goal, user stories, acceptance criteria, non-goals, edge cases, architecture constraints, and open questions. Used by the PRD engineering skill.

### AC_TEMPLATE.md

A guide to writing good acceptance criteria for AI. Covers the 5 patterns (action→result, condition→behavior, negative constraints, state transitions, quantitative bounds) and common anti-patterns.

### EVAL_RUBRIC.md

An evaluation rubric template that maps acceptance criteria from a PRD to verifiable checks. Covers output evaluation (does the code compile, pass tests, satisfy ACs?) and trajectory evaluation (did the agent follow the right process?). Includes AI-specific failure checks.

See [templates/EVAL_RUBRIC.md](templates/EVAL_RUBRIC.md).

## Prompt Templates

Pi supports `/name` prompt templates that expand on typing. These shortcut the workflow:

| Template | Shortcut | What It Does |
|---|---|---|
| `prd.md` | `/prd` | Starts the PRD engineering interview |
| `plan.md` | `/plan` | Generates implementation plan from an approved PRD |
| `review.md` | `/review` | Runs AI-specific code review on recent changes |
| `eval.md` | `/eval` | Evaluates output against the eval rubric |

Type `/prd` to start planning a feature, `/plan` before implementing, `/review` after implementation.

## Installed Packages

Third-party pi packages are installed through the package system and live outside this
repo (under `~/.pi/agent/npm/`, registered in `~/.pi/agent/settings.json`).

### context7 (`npm:@upstash/context7-pi`)

Up-to-date library documentation via [Context7](https://context7.com). The agent
calls it automatically whenever the user asks about a specific library,
framework, SDK, CLI tool, or cloud service - even well-known ones - because
training data often does not reflect recent API changes.

Adds:

- **`resolve-library-id`** - library name/question to a Context7 library ID
  (`/org/project`), ranked by relevance, snippet coverage, and source reputation
- **`query-docs`** - fetches version-current docs and code examples for a library
  ID, scoped to a single concept
- **`context7-docs` skill** - teaches the agent when to reach for the tools
- **`/c7-docs <library> <question>`** slash command for manual lookups

Optional auth: create a free key at <https://context7.com/dashboard> and export
it as `CONTEXT7_API_KEY` to raise rate limits. Without a key it works at
IP-based limits. Manage with `pi list` / `pi update` / `pi remove`.

## The Workflow

The skills, templates, and prompts work together to create a **closed-loop pipeline**:

```
Rough idea
    ↓  /prd
[prd-engineering skill] — structured interview captures intent, boundaries, ACs
    ↓
Structured PRD document (PRD_TEMPLATE.md)
    ↓
Review & approve
    ↓  /plan
[spec-driven skill] — implement with AC tracing, edge case handling, non-goal checks
    ↓
Code that maps to every acceptance criterion
    ↓  /review or /eval
[code-review-ai skill] — AI-specific failure checks, AC coverage, trajectory eval
    ↓
Ship / Minor Fixes / Rework / Redo Spec verdict
```

The loop closes: spec → implement → evaluate → feedback → next iteration.

## Installation

pi reads global configuration from `~/.pi/agent/` and auto-discovers extensions,
skills, prompts, templates, and themes (plus `AGENTS.md`) from there. This repo
is kept under version control and symlinked in so `pi` and `git` see the same
files. Everything below is additive: local files that are not in the repo
(for example `~/.pi/agent/extensions/vault-access.ts`) are left untouched.

### 1. Clone the repo

```bash
git clone <repo-url> ~/codes/pi-config
cd ~/codes/pi-config
```

### 2. Symlink the config resources

Directory symlinks (skills, prompts, templates, themes, and the persona file):

```bash
ln -sfn "$PWD/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sfn "$PWD/prompts"   ~/.pi/agent/prompts
ln -sfn "$PWD/skills"    ~/.pi/agent/skills
ln -sfn "$PWD/templates" ~/.pi/agent/templates
ln -sfn "$PWD/themes"    ~/.pi/agent/themes
```

Extensions are symlinked one by one so that repo-managed extensions coexist
with local-only ones already sitting in `~/.pi/agent/extensions/`:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn "$PWD/extensions/ask-user-question.ts" ~/.pi/agent/extensions/ask-user-question.ts
ln -sfn "$PWD/extensions/read-only-mode.ts"    ~/.pi/agent/extensions/read-only-mode.ts
ln -sfn "$PWD/extensions/web-access"           ~/.pi/agent/extensions/web-access
```

> GNU Stow can do the same job; the `ln -sfn` commands above are the concrete
> equivalent of the links this setup actually uses.

### 3. Install web-access dependencies

`web-access` resolves its npm packages (readability, linkedom, turndown,
unpdf) from its own `node_modules`, so install them once after cloning:

```bash
npm --prefix extensions/web-access install
```

### 4. Install the context7 pi package

Context7 is a third-party pi package, installed through pi's package manager
(not symlinked):

```bash
pi install npm:@upstash/context7-pi
```

This registers it under `packages` in `~/.pi/agent/settings.json` and installs
it to `~/.pi/agent/npm/`. Manage with `pi list` / `pi update --extensions` /
`pi remove npm:@upstash/context7-pi`.

### 5. Optional API keys (environment variables)

Keys are read at call time, so exporting them takes effect without a reload:

| Variable | Feature | Where to get one |
|---|---|---|
| `CONTEXT7_API_KEY` | Raises Context7 rate limits (works keyless otherwise) | <https://context7.com/dashboard> |
| `TAVILY_API_KEY` | Makes `web_search` prefer Tavily | <https://app.tavily.com/> |
| `BRAVE_API_KEY` | Makes `web_search` prefer Brave | <https://brave.com/search/api/> |
| `GITHUB_TOKEN` | Raises GitHub API rate limits for `web_fetch` on repos | <https://github.com/settings/tokens> |

Add them to your shell profile (for example `~/.profile` or `~/.zshrc`) so pi
picks them up on launch.

### 6. Reload and verify

Run `/reload` inside pi (or restart it). Then confirm everything loaded:

```bash
pi list                        # should list npm:@upstash/context7-pi
pi -p "Which tools do you have?"  # should mention web_search, web_fetch,
                                #   resolve-library-id, query-docs
```

### Removing

```bash
pi remove npm:@upstash/context7-pi
unlink ~/.pi/agent/{AGENTS.md,prompts,skills,templates,themes}
unlink ~/.pi/agent/extensions/{ask-user-question.ts,read-only-mode.ts,web-access}
```

Unlinking only affects the symlinks; the repo itself stays intact.

## License

MIT