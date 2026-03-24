# Creating Agent Skills

This guide provides an overview of how to create your own Agent Skills to extend
the capabilities of Gemini CLI.

## Getting started: The `skill-creator` skill

The recommended way to create a new skill is to use the built-in `skill-creator`
skill. To use it, ask Gemini CLI to create a new skill for you.

**Example prompt:**

> "create a new skill called 'code-reviewer'"

Gemini CLI will then use the `skill-creator` to generate the skill:

1.  Generate a new directory for your skill (for example, `my-new-skill/`).
2.  Create a `SKILL.md` file with the necessary YAML frontmatter (`name` and
    `description`).
3.  Create the standard resource directories: `scripts/`, `references/`, and
    `assets/`.

## Manual skill creation

If you prefer to create skills manually:

1.  **Create a directory** for your skill (for example, `my-new-skill/`).
2.  **Create a `SKILL.md` file** inside the new directory.

To add additional resources that support the skill, refer to the skill
structure.

## Skill structure

A skill is a directory containing a `SKILL.md` file at its root.

### Folder structure

While a `SKILL.md` file is the only required component, we recommend the
following structure for organizing your skill's resources:

```text
my-skill/
├── SKILL.md       (Required) Instructions and metadata
├── scripts/       (Optional) Executable scripts
├── references/    (Optional) Static documentation
└── assets/        (Optional) Templates and other resources
```

### `SKILL.md` file

The `SKILL.md` file is the core of your skill. This file uses YAML frontmatter
for metadata and Markdown for instructions. For example:

```markdown
---
name: code-reviewer
description:
  Use this skill to review code. It supports both local changes and remote Pull
  Requests.
---

# Code Reviewer

This skill guides the agent in conducting thorough code reviews.

## Workflow

### 1. Determine Review Target

- **Remote PR**: If the user gives a PR number or URL, target that remote PR.
- **Local Changes**: If changes are local... ...
```

- **`description`**: A description of what the skill does and when Gemini should
  use it.
- **Body**: The Markdown body of the file contains the instructions that guide
  the agent's behavior when the skill is active.

## Packaging and Distribution

To share a skill or distribute it as a standalone archive, you can package the
skill directory into a `.skill` file. This is essentially a ZIP archive that
the `gemini skills install` command can process.

### Using the `skill-creator` toolchain

The built-in `skill-creator` skill includes a packaging script that validates
your skill (checking for missing frontmatter, unresolved TODOs, etc.) before
creating the archive.

To package a skill:

1.  **Activate** the `skill-creator` skill in a Gemini session.
2.  **Ask** the agent to "package my skill located at `./path/to/skill`".

The agent will run the necessary validation and create a `.skill` file in your
specified output directory.

### Manual Packaging

If you prefer to package manually, you can simply create a ZIP archive of the
skill's root directory (ensuring `SKILL.md` is at the top level) and rename the
extension to `.skill`.

```bash
# Example: Package 'my-skill' directory into 'my-skill.skill'
(cd my-skill/ && zip -r ../my-skill.skill .)
```

## Installing a Packaged Skill

Once you have a `.skill` file, you can install it using the `gemini` CLI.

```bash
# Install to the user scope (global)
gemini skills install ./my-skill.skill

# Install to the workspace scope (local repository)
gemini skills install ./my-skill.skill --scope workspace
```

After installation, remember to reload your session to pick up the new expertise:

1.  In an interactive session, run `/skills reload`.
2.  Verify the installation with `/skills list`.
