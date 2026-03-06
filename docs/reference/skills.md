# Agent Skills reference

This page provides technical specifications for the Agent Skills framework,
including discovery tiers, precedence rules, and the skill activation lifecycle.

## Skill Discovery Tiers

Gemini CLI discovers skills from three primary locations:

1.  **Workspace Skills**: Located in `.gemini/skills/` or the `.agents/skills/`
    alias. Workspace skills are typically committed to version control and
    shared with the team.
2.  **User Skills**: Located in `~/.gemini/skills/` or the `~/.agents/skills/`
    alias. These are personal skills available across all your workspaces.
3.  **Extension Skills**: Skills bundled within installed
    [extensions](../extensions/index.md).

### Precedence rules

If multiple skills share the same name, higher-precedence locations override
lower ones: **Workspace > User > Extension**.

Within the same tier (user or workspace), the `.agents/skills/` alias takes
precedence over the `.gemini/skills/` directory. This generic alias provides an
interactive path for managing agent-specific expertise that remains compatible
across different AI agent tools.

## Skill anatomy

A skill is a directory containing a `SKILL.md` file at its root. While
`SKILL.md` is the only required file, skills often include additional resources
to support their specialized tasks.

- **`SKILL.md`**: Contains the skill's name, description (for discovery), and
  the procedural instructions for the agent.
- **`scripts/`**: Executable scripts that the agent can run via
  `run_shell_command`.
- **`references/`**: Static documentation or API specs for the agent to consult.
- **`assets/`**: Templates, example data, or other non-executable resources.

### The `SKILL.md` format

The file uses YAML frontmatter for metadata:

```markdown
---
name: security-auditor
description: Expertise in auditing code for security vulnerabilities.
---

# Instructions

When this skill is active, you MUST...
```

#### Metadata fields

The YAML frontmatter provides essential information for skill discovery and
identification.

- **`name`**: A unique identifier for the skill. This should match the directory
  name.
- **`description`**: **CRITICAL.** This is how Gemini decides when to use the
  skill. Be specific about the tasks it handles and the keywords that should
  trigger it.
- **Body**: The Markdown body contains the instructions that guide the agent's
  behavior when the skill is active.

## How it Works

The lifecycle of an Agent Skill involves discovery, activation, and conditional
resource access.

1.  **Discovery**: At the start of a session, Gemini CLI scans the discovery
    tiers and injects the name and description of all enabled skills into the
    system prompt.
2.  **Activation**: When Gemini identifies a task matching a skill's
    description, it calls the `activate_skill` tool.
3.  **Consent**: You will see a confirmation prompt in the UI detailing the
    skill's name, purpose, and the directory path it will gain access to.
4.  **Injection**: Upon your approval:
    - The `SKILL.md` body and folder structure is added to the conversation
      history.
    - The skill's directory is added to the agent's allowed file paths, granting
      it permission to read any bundled assets.
5.  **Execution**: The model proceeds with the specialized expertise active. It
    is instructed to prioritize the skill's procedural guidance within reason.

### Skill activation (`activate_skill`)

Once a skill is activated (typically by Gemini identifying a task that matches
the skill's description and your approval), its specialized instructions and
resources are loaded into the agent's context. A skill remains active and its
guidance is prioritized for the duration of the session.

For more details on the tool itself, see the
[`activate_skill` tool reference](../tools/activate-skill.md).

## Management commands

Skills can be managed via slash commands or terminal commands.

- **Slash Commands**: See the [Slash Commands reference](./commands.md#skills).
- **CLI Commands**: See the
  [CLI reference](../cli/cli-reference.md#skills-management).
