# pi-config

Personal configuration for [pi](https://github.com/earendil-works/pi-coding-agent) — the coding agent harness.

## Contents

```
pi-config/
├── AGENTS.md                  # Global persona — loaded at startup (always active)
├── extensions/
│   ├── ask-user-question.ts   # Interactive TUI tool for asking the user questions
│   └── read-only-mode.ts     # /read-only command to enforce tool access restrictions
├── skills/
│   ├── prd-engineering/       # Structured PRD interview → tight specs
│   ├── spec-driven/           # Implement features by tracing each AC to code
│   ├── pdf-reader/            # Read and comprehend PDF files
│   └── stop-slop/             # Remove AI writing patterns from prose
├── templates/
│   ├── PRD_TEMPLATE.md        # Reusable PRD document template
│   └── AC_TEMPLATE.md         # How to write good acceptance criteria for AI
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

## Skills

### prd-engineering

A structured interview process that transforms rough feature ideas into tight, implementable PRDs. Walks through intent capture, scope/boundaries, acceptance criteria, and architecture constraints. Designed to eliminate the steering problem — gaps in the spec are surfaced before code is written.

See [skills/prd-engineering/SKILL.md](skills/prd-engineering/SKILL.md).

### spec-driven

Implements features against a structured PRD spec. Every code change is traced to an acceptance criterion. Prevents scope creep, forces edge case handling, and stops when it hits a non-goal. Designed to work in pair with the PRD engineering skill.

See [skills/spec-driven/SKILL.md](skills/spec-driven/SKILL.md).

### pdf-reader

Read and comprehend PDF files using text extraction + selective page rendering. Uses a hybrid approach for maximum comprehension of equations, diagrams, and structured content.

See [skills/pdf-reader/SKILL.md](skills/pdf-reader/SKILL.md).

### stop-slop

A skill that teaches the agent to eliminate predictable AI writing patterns from prose. Includes:

- Core rules in `SKILL.md`
- Reference files for banned phrases, structural patterns, and before/after examples

See [skills/stop-slop/README.md](skills/stop-slop/README.md) for details.

## Templates

### PRD_TEMPLATE.md

A structured document template for Product Requirements Documents. Covers core goal, user stories, acceptance criteria, non-goals, edge cases, architecture constraints, and open questions. Used by the PRD engineering skill.

### AC_TEMPLATE.md

A guide to writing good acceptance criteria for AI. Covers the 5 patterns (action→result, condition→behavior, negative constraints, state transitions, quantitative bounds) and common anti-patterns.

## The Workflow

The two skills + templates work together to create a **spec-first pipeline**:

```
Rough idea
    ↓
[prd-engineering skill] — structured interview captures intent, boundaries, ACs
    ↓
Structured PRD document (PRD_TEMPLATE.md)
    ↓
Review & approve
    ↓
[spec-driven skill] — implement with AC tracing, edge case handling, non-goal checks
    ↓
Code that maps to every acceptance criterion
```

## Setup with GNU Stow

[GNU Stow](https://www.gnu.org/software/stow/) manages symlinks so you can keep this repo under version control while pi reads it from the expected location.

Assuming pi reads config from `~/.pi/`:

```bash
# Clone into a dotfiles directory
$ git clone <repo>

# Stow into ~/.pi
$ stow -t ~/.pi .
```

This creates symlinks:

```
~/.pi/extensions/ask-user-question.ts  -> ~/.pi/agent/extensions/ask-user-question.ts
~/.pi/extensions/read-only-mode.ts     -> ~/.pi/agent/extensions/read-only-mode.ts
~/.pi/skills/stop-slop/SKILL.md        -> ~/.pi/agent/skills/stop-slop/SKILL.md
...
```

To remove the symlinks:

```bash
$ stow -D -t ~/.pi pi-config
```

Adjust the target directory (`-t`) if pi looks for config elsewhere (e.g., `~/.config/pi/`).

## License

MIT