# Slash Command Coexistence & Conflict Suppression Architecture

## Context & Problem

In dual-ecosystem setups where both legacy TOML user commands (`~/.agents/commands/`) and open standard skills (`~/.agents/skills/`) exist simultaneously, command name overlaps occur (e.g. `/verify`, `/test`, `/status`, `/spawn`).

Gemini CLI's `SlashCommandConflictHandler` resolves name collisions by renaming user commands to `/user.<name>` and skill commands to `/<name>1`. While this resolution is safe and functional, it produces verbose startup notices in the TUI banner.

## Root Architecture

- **`~/.agents/commands/`**: Contains TOML/Markdown command files consumed by `sync-agent-commands.ts` and `eval-runner.py` for multi-agent interoperability (Claude, Jetski, evaluation suites).
- **`~/.agents/skills/`**: Contains open-standard agent skills with YAML frontmatter.
- **`SlashCommandConflictHandler`**: Listens for `CoreEvent.SlashCommandConflicts` and formats user-facing feedback messages.

## Solution Implemented

1. **Suppression Support in `gemini-claude`**:
   - Patched `SlashCommandConflictHandler.ts` to check `process.env.GEMINI_SUPPRESS_COMMAND_CONFLICTS`.
   - Set `export GEMINI_SUPPRESS_COMMAND_CONFLICTS="true"` in `~/.local/bin/gemini-claude`.

2. **Unit Test Coverage**:
   - Updated `SlashCommandConflictHandler.test.ts` to assert zero feedback emission when `GEMINI_SUPPRESS_COMMAND_CONFLICTS=true`.

3. **Interoperability Preserved**:
   - Preserved all files in `~/.agents/commands/` so Claude, Jetski, and evaluation test runners continue operating without breaking changes.
