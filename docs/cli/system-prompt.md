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

To add instructions while keeping the built-in prompt, see
[Appending instead of replacing](#appending-instead-of-replacing).

<!-- prettier-ignore -->
> [!TIP]
> You can export the current default system prompt to a file first, review
> it, and then selectively modify or replace it (see
> [“Export the default prompt”](#export-the-default-prompt-recommended)).

## How to enable

You can set the environment variable temporarily in your shell, or persist it
via a `.gemini/.env` file. See
[Persisting Environment Variables](../get-started/authentication.mdx#persisting-environment-variables).

- Use the project default path (`.gemini/system.md`):

  - `GEMINI_SYSTEM_MD=true` or `GEMINI_SYSTEM_MD=1`
  - The CLI reads `./.gemini/system.md` (relative to your current project
    directory).

- Use a custom file path:

  - `GEMINI_SYSTEM_MD=/absolute/path/to/my-system.md`
  - Relative paths are supported and resolved from the current working
    directory.
  - Tilde expansion is supported (for example, `~/my-system.md`).

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
  - `GEMINI_SYSTEM_MD=~/prompts/system.md gemini`

## UI indicator

When `GEMINI_SYSTEM_MD` is active, the CLI shows a `|⌐■_■|` indicator in the UI
to signal custom system‑prompt mode.

## Variable Substitution

When using a custom system prompt file, you can use the following variables to
dynamically include built-in content:

- `${AgentSkills}`: Injects a complete section (including header) of all
  available agent skills.
- `${SubAgents}`: Injects a complete section (including header) of available
  sub-agents.
- `${AvailableTools}`: Injects a bulleted list of all currently enabled tool
  names.
- Tool Name Variables: Injects the actual name of a tool using the pattern:
  `${toolName}_ToolName` (for example, `${write_file_ToolName}`,
  `${run_shell_command_ToolName}`).

  This pattern is generated dynamically for all available tools.

### Example

```markdown
# Custom System Prompt

You are a helpful assistant. ${AgentSkills}
${SubAgents}

## Tooling

The following tools are available to you: ${AvailableTools}

You can use ${write_file_ToolName} to save logs.
```

## Export the default prompt (recommended)

Before overriding, export the current default prompt so you can review required
safety and workflow rules.

- Write the built‑in prompt to the project default path:
  - `GEMINI_WRITE_SYSTEM_MD=1 gemini`
- Or write to a custom path:
  - `GEMINI_WRITE_SYSTEM_MD=~/prompts/DEFAULT_SYSTEM.md gemini`

This creates the file and writes the current built‑in system prompt to it. The
written file is the **base** prompt only: the stock prompt or a
`GEMINI_SYSTEM_MD` override, plus user memory. It does **not** include text
appended with `--append-system-prompt`, `--append-system-prompt-file`, or
`GEMINI_APPEND_SYSTEM_MD`.

## Appending instead of replacing

Use these options when you want extra system instructions for **this launch
only**, without replacing the built-in prompt (and without writing a `GEMINI.md`
file).

- `--append-system-prompt "<text>"`: append the given string.
- `--append-system-prompt-file <path>`: append the contents of a file. Relative
  paths are resolved from the current working directory. `~` expands to the home
  directory, matching `GEMINI_SYSTEM_MD`.
- `GEMINI_APPEND_SYSTEM_MD=<path>`: append the contents of a file from the
  environment. Same path rules as `--append-system-prompt-file`.

These sources are mutually compatible. Non-empty parts are concatenated in this
order, each separated by a blank line:

1. Contents of `GEMINI_APPEND_SYSTEM_MD`
2. Contents of `--append-system-prompt-file`
3. The string from `--append-system-prompt`

The extra text is added after the base prompt (the built-in prompt, or a
`GEMINI_SYSTEM_MD` override) and before user memory from `GEMINI.md` files. It
supplements the system prompt; it does not replace Core Mandates.

If an append file is missing or unreadable, the CLI exits with
`unable to read append system prompt file '<path>'`.

### Examples

```shell
gemini --append-system-prompt "This session is mirrored; prefer concise output."
gemini --append-system-prompt-file ~/prompts/session-extra.md
GEMINI_APPEND_SYSTEM_MD=~/prompts/wrapper.md gemini
gemini --append-system-prompt-file ./extra.md --append-system-prompt "Also do this."
```

Appended instructions apply to the main session. Subagents that already reuse
the core system prompt (for example the generalist agent) inherit them;
subagents with their own prompts do not.

## Best practices: system.md vs GEMINI.md

- system.md (firmware):
  - Non‑negotiable operational rules: safety, tool‑use protocols, approvals, and
    mechanics that keep the CLI reliable.
  - Stable across tasks and projects (or per project when needed).
- GEMINI.md (strategy):
  - Persona, goals, methodologies, and project/domain context.
  - Evolves per task; relies on system.md for safe execution.

Keep system.md minimal but complete for safety and tool operation. Keep
GEMINI.md focused on high‑level guidance and project specifics.

## Troubleshooting

- Error: `missing system prompt file '…'`
  - Ensure the referenced path exists and is readable.
  - For `GEMINI_SYSTEM_MD=1|true`, create `./.gemini/system.md` in your project.
- Error: `unable to read append system prompt file '…'`
  - Check `--append-system-prompt-file` and `GEMINI_APPEND_SYSTEM_MD`. The path
    must exist and be readable.
- Override not taking effect
  - Confirm the variable is loaded (use `.gemini/.env` or export in your shell).
  - Paths are resolved from the current working directory; try an absolute path.
- Restore defaults
  - Unset `GEMINI_SYSTEM_MD` or set it to `0`/`false`.
