# Agent Skills

_Note: This is an experimental feature enabled via `experimental.skills`. You
can also search for "Skills" within the `/settings` interactive UI to toggle
this and manage other skill-related settings._

Agent Skills allow you to extend Gemini CLI with specialized expertise,
procedural workflows, and task-specific resources. Based on the
[Agent Skills](https://agentskills.io) open standard, a "skill" is a
self-contained directory that packages instructions and assets into a
discoverable capability.

## Overview

Unlike general context files ([`GEMINI.md`](./gemini-md.md)), which provide
persistent project-wide background, Skills represent **on-demand expertise**.
This allows Gemini to maintain a vast library of specialized capabilities—such
as security auditing, cloud deployments, or codebase migrations—without
cluttering the model's immediate context window.

Gemini autonomously decides when to employ a skill based on your request and the
skill's description. When a relevant skill is identified, the model "pulls in"
the full instructions and resources required to complete the task.

## Key Benefits

- **Shared Expertise:** Package complex workflows (like a specific team's PR
  review process) into a folder that anyone can use.
- **Repeatable Workflows:** Ensure complex multi-step tasks are performed
  consistently by providing a procedural framework.
- **Resource Bundling:** Include scripts, templates, or example data alongside
  instructions so the agent has everything it needs.

## Skill Discovery Tiers

Gemini CLI discovers skills from three primary locations:

1.  **Project Skills** (`.gemini/skills/`): Project-specific skills that are
    typically committed to version control and shared with the team.
2.  **User Skills** (`~/.gemini/skills/`): Personal skills available across all
    your projects.
3.  **Extension Skills**: Skills bundled within installed
    [extensions](../extensions/index.md).

If multiple skills share the same name, higher-precedence locations (Project >
User) override lower ones.

## Managing Skills

### In an Interactive Session

Use the `/skills` slash command to view and manage available expertise:

- `/skills list` (default): Shows all discovered skills and their status.
- `/skills disable <name>`: Prevents a specific skill from being used.
- `/skills enable <name>`: Re-enables a disabled skill.

_Note: Commands default to the `user` scope. Use `--scope project` to manage
project-specific settings._

### From the Terminal

The `gemini skills` command provides management utilities:

```bash
# List all discovered skills
gemini skills list

# Install a skill from a directory or .skill (zip) file
gemini skills install ./my-expertise --scope project

# Uninstall one or more skills
gemini skills uninstall my-expertise --scope project

# Enable/disable skills
gemini skills enable my-expertise --scope project
gemini skills disable my-expertise --scope project
```

## Creating a Skill

A skill is a directory containing a `SKILL.md` file at its root. This file must
contain YAML frontmatter with a `name` and a clear, concise `description`. The
description is what Gemini uses to decide when the skill is relevant.

Example `.gemini/skills/api-migration/SKILL.md`:

```markdown
---
name: api-migration
description:
  Expertise in migrating legacy REST endpoints to our new GraphQL schema.
---

# API Migration Instructions

When performing a migration:

1. Identify the REST endpoint being replaced.
2. Map the existing fields to the GraphQL schema defined in `schema.graphql`.
3. Generate a new resolver implementation.
```

You can include supporting files (like `schema.graphql` or migration scripts) in
the same directory. When Gemini employs the skill, it will automatically see
these resources.

> [!TIP] Skills are excellent for bundling small utility scripts or reference
> data that the model can execute or consult to fulfill the skill's promise.

## How it Works (Security & Privacy)

When Gemini identifies a task that matches a skill's description, it triggers a
specialized discovery tool. You will see a confirmation prompt detailing the
skill's name, purpose, and the resources the agent will gain access to.

Upon your approval:

1.  The skill's `SKILL.md` content and metadata are added to the conversation
    history as a model-visible resource.
2.  The skill's directory is temporarily added to the agent's allowed file
    paths.
3.  The model proceeds with the specialized expertise active for the remainder
    of the session.
