# pi-config

Personal configuration for [pi](https://github.com/earendil-works/pi-coding-agent) — the coding agent harness.

## Contents

```
pi-config/
├── extensions/
│   ├── ask-user-question.ts    # Interactive TUI tool for asking the user questions
│   └── read-only-mode.ts      # /read-only command to enforce tool access restrictions
├── skills/
│   └── stop-slop/             # Skill for removing AI writing patterns from prose
└── README.md
```

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

### stop-slop

A skill that teaches the agent to eliminate predictable AI writing patterns from prose. Includes:

- Core rules in `SKILL.md`
- Reference files for banned phrases, structural patterns, and before/after examples

See [skills/stop-slop/README.md](skills/stop-slop/README.md) for details.

## Usage

Load this directory as a pi config source. The extensions register automatically on startup. The skill is available when the agent is prompted with pattern-removal tasks.

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
