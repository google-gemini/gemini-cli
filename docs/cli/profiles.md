# Profiles

Profiles allow you to maintain separate configurations for different workflows,
tasks, or personas. Each profile can define its own set of allowed extensions, a
default model, and a custom system instruction (persona).

Profiles are particularly useful for:

- Switching between domain-specific setups (e.g., frontend development vs.
  system administration).
- Defining specialized AI personas for different tasks.
- Restricting available tools/extensions for specific projects.

## Profile structure

Profiles are Markdown files (`.md`) that use YAML frontmatter for configuration
and the file body for system instructions.

**Location**: `~/.gemini/profiles/[profile-name].md`

### Example profile (`coder.md`)

```markdown
---
name: Web Developer
default_model: gemini-3.0-flash
extensions:
  - github
  - web-search
---

You are a world-class Web Developer. Focus on React, TypeScript, and modern CSS.
Always prefer functional components and explain your reasoning.
```

### Configuration fields

| Field           | Description                                                                                     |
| :-------------- | :---------------------------------------------------------------------------------------------- |
| `name`          | (Optional) A display name for the profile.                                                      |
| `default_model` | (Optional) The model to use when this profile is active.                                        |
| `extensions`    | (Optional) A list of allowed extension IDs. If specified, only these extensions will be loaded. |

The **body** of the Markdown file is injected into the system prompt, allowing
you to define a specific persona or set of instructions that the AI will always
follow when the profile is active.

## Usage

### Single session usage

Use the `--profiles` flag (or `-P`) to use a profile for a single session:

```bash
gemini --profiles coder
```

### Persistent default

You can set a profile as your default for all sessions:

```bash
gemini profiles enable coder
```

To return to the standard configuration:

```bash
gemini profiles disable
```

## Commands

| Command                            | Description                                              |
| :--------------------------------- | :------------------------------------------------------- |
| `gemini profiles list`             | List all available profiles and see which one is active. |
| `gemini profiles enable <name>`    | Set a profile as the persistent default.                 |
| `gemini profiles disable`          | Clear the persistent default profile.                    |
| `gemini profiles uninstall <name>` | Delete a profile from your local storage.                |
