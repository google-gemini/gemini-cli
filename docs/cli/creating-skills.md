# Creating Agent Skills

This guide provides an overview of how to create your own Agent Skills to extend
the capabilities of Gemini CLI.

## Getting started: The `skill-creator` skill

The recommended way to create a new skill is to use the built-in `skill-creator`
skill. To use it, ask Gemini CLI to create a new skill for you.

**Example prompt:**

> "create a new skill called 'my-new-skill'"

Gemini CLI will then use the `skill-creator` to:

1.  Generate a new directory for your skill (e.g., `my-new-skill/`).
2.  Create a `SKILL.md` file with the necessary YAML frontmatter (`name` and
    `description`).
3.  Create the standard resource directories: `scripts/`, `references/`, and
    `assets/`.

## Manual skill creation

If you prefer to create skills manually:

1.  **Create a directory** for your skill (e.g., `my-new-skill/`).
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
for metadata and Markdown for instructions:

```markdown
---
name: <unique-name>
description: <what the skill does and when Gemini should use it>
---

<your instructions for how the agent should behave / use the skill>
```

- **`name`**: A unique identifier for the skill. This should match the directory
  name.
- **`description`**: A description of what the skill does and when Gemini should
  use it.
- **Body**: The instructions for how the agent should behave when the skill is
  activated.
