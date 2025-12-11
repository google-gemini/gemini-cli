# System Prompt Override (GEMINI_SYSTEM_MD)

The core system instructions that guide Gemini CLI can be completely replaced
with your own Markdown file. This feature is controlled via the
`GEMINI_SYSTEM_MD` environment variable.

## Overview

The `GEMINI_SYSTEM_MD` variable instructs the CLI to use an external Markdown
file for its system prompt, completely overriding the built-in default. This is
a full replacement, not a merge. If you use a custom file, none of the original
core instructions will apply unless you include them yourself.

This feature is intended for advanced users who need to enforce strict,
project-specific behavior or create a customized persona.

> Tip: You can export the current default system prompt to a file first, review
> it, and then selectively modify or replace it (see
> [“Export the default prompt”](#export-the-default-prompt-recommended)).

## How to enable

You can set the environment variable temporarily in your shell, or persist it
via a `.gemini/.env` file. See
[Persisting Environment Variables](../get-started/authentication.md#persisting-environment-variables).

- Use the project default path (`.gemini/system.md`):
  - `GEMINI_SYSTEM_MD=true` or `GEMINI_SYSTEM_MD=1`
  - The CLI reads `./.gemini/system.md` (relative to your current project
    directory).

- Use a custom file path:
  - `GEMINI_SYSTEM_MD=/absolute/path/to/my-system.md`
  - Relative paths are supported and resolved from the current working
    directory.
  - Tilde expansion is supported (e.g., `~/my-system.md`).

- Disable the override (use built‑in prompt):
  - `GEMINI_SYSTEM_MD=false` or `GEMINI_SYSTEM_MD=0` or unset the variable.

If the override is enabled but the target file does not exist, the CLI will
error with: `missing system prompt file '<path>'`.

## Quick examples

- One‑off session using a project file:
  - `GEMINI_SYSTEM_MD=1 gemini`
- Persist for a project using `.gemini/.env`:
  - Create `.gemini/system.md`, then add to `.gemini/.env`:
    - `GEMINI_SYSTEM_MD=1`
- Use a custom file under your home directory:
  - `GEMINI_SYSTEM_MD=~/prompts/SYSTEM.md gemini`

## UI indicator

When `GEMINI_SYSTEM_MD` is active, the CLI shows a `|⌐■_■|` indicator in the UI
to signal custom system‑prompt mode.

## Export the default prompt (recommended)

Before overriding, export the current default prompt so you can review required
safety and workflow rules.

- Write the built‑in prompt to the project default path:
  - `GEMINI_WRITE_SYSTEM_MD=1 gemini`
- Or write to a custom path:
  - `GEMINI_WRITE_SYSTEM_MD=~/prompts/DEFAULT_SYSTEM.md gemini`

This creates the file and writes the current built‑in system prompt to it.

## Best practices: SYSTEM.md vs GEMINI.md

- SYSTEM.md (firmware):
  - Non‑negotiable operational rules: safety, tool‑use protocols, approvals, and
    mechanics that keep the CLI reliable.
  - Stable across tasks and projects (or per project when needed).
- GEMINI.md (strategy):
  - Persona, goals, methodologies, and project/domain context.
  - Evolves per task; relies on SYSTEM.md for safe execution.

Keep SYSTEM.md minimal but complete for safety and tool operation. Keep
GEMINI.md focused on high‑level guidance and project specifics.

## Troubleshooting

- Error: `missing system prompt file '…'`
  - Ensure the referenced path exists and is readable.
  - For `GEMINI_SYSTEM_MD=1|true`, create `./.gemini/system.md` in your project.
- Override not taking effect
  - Confirm the variable is loaded (use `.gemini/.env` or export in your shell).
  - Paths are resolved from the current working directory; try an absolute path.
- Restore defaults
  - Unset `GEMINI_SYSTEM_MD` or set it to `0`/`false`.
