# Agent Skills

Agent Skills let you extend Gemini CLI with specialized expertise, procedural
workflows, and task-specific resources. Based on the
[Agent Skills](https://agentskills.io) open standard, a "skill" is a
self-contained directory that packages instructions and assets into a
discoverable capability.

## Overview

Unlike general context files ([`GEMINI.md`](../gemini-md.md)), which provide
persistent workspace-wide background, Skills represent **on-demand expertise**.
This lets Gemini maintain a vast library of specialized capabilities—such as
security auditing, cloud deployments, or codebase migrations—without cluttering
the model's immediate context window.

Gemini autonomously decides when to employ a skill based on your request and the
skill's description. When a relevant skill is identified, the model "pulls in"
the full instructions and resources required to complete the task using the
`activate_skill` tool.

## Choose your path

Choose the guide that best fits your needs.

### I want to use skills

Learn how to discover, install, and manage skills to enhance your Gemini CLI
experience.

- **[Manage skills](#managing-skills):** List and verify your installed skills.
- **[Install skills](#from-the-terminal):** Add new capabilities from GitHub or
  local paths.

### I want to build skills

Learn how to create, test, and share your own skills with the community.

- **[Build agent skills](./creating-skills.md):** Create your first skill from a
  template.
- **[Best practices](./skills-best-practices.md):** Learn how to build secure
  and reliable skills.
- **[Technical specifications](../reference/skills.md):** Deeply understand the
  skill format and discovery tiers.

## Key Benefits

Agent Skills provide several advantages for managing specialized knowledge and
complex workflows.

- **Shared Expertise:** Package complex workflows (like a specific team's PR
  review process) into a folder that anyone can use.
- **Repeatable Workflows:** Ensure complex multi-step tasks are performed
  consistently by providing a procedural framework.
- **Resource Bundling:** Include scripts, templates, or example data alongside
  instructions so the agent has everything it needs.
- **Progressive Disclosure:** Only skill metadata (name and description) is
  loaded initially. Detailed instructions and resources are only disclosed when
  the model explicitly activates the skill, saving context tokens.

## Standard Agent Skills

Gemini CLI includes several high-value standard skills that showcase the power
of the framework. These skills are often used for:

- **`pr-creator`**: Automates the creation of pull requests following repo
  templates.
- **`code-reviewer`**: Provides systematic reviews of code changes against
  security and style guidelines.
- **`docs-writer`**: Expert assistance for technical writing and documentation
  management.
- **`skill-creator`**: A specialized meta-skill that helps you build, validate,
  and package new skills.

To see all available skills in your current session, use the `/skills list`
command.

## Managing Skills

You can manage Agent Skills through interactive session commands or directly
from your terminal.

### In an Interactive Session

Use the `/skills` slash command to view and manage available expertise:

- `/skills list [--all]`: Shows discovered skills. Use `--all` to include
  built-in skills.
- `/skills link <path>`: Links agent skills from a local directory via symlink.
- `/skills disable <name> [--scope]`: Prevents a specific skill from being used.
- `/skills enable <name> [--scope]`: Re-enables a disabled skill.
- `/skills reload`: Refreshes the list of discovered skills from all tiers.

### From the Terminal

The `gemini skills` command provides management utilities:

```bash
# List all discovered skills. Use --all to include built-in skills.
gemini skills list --all

# Install a skill from a Git repository or local directory.
# Use --consent to skip the security confirmation prompt.
gemini skills install https://github.com/user/repo.git --consent

# Uninstall a skill.
gemini skills uninstall my-skill --scope workspace
```

#### Command options

The skill management commands support several global and command-specific
options.

- `--scope`: Either `user` (global, default) or `workspace` (local to the
  project).
- `--path`: The sub-directory within a Git repository containing the skill.
- `--consent`: Acknowledge security risks and skip the interactive confirmation
  during installation.

For more details on CLI commands, see the
[CLI reference](./cli-reference.md#skills-management).

## Next steps

Explore these resources to refine your skills and understand the framework
better.

- [Build agent skills](./creating-skills.md): Start developing your own skills.
- [Skill reference](../reference/skills.md): Deeply understand the skill format
  and discovery tiers.
- [Best practices](./skills-best-practices.md): Learn strategies for building
  effective skills.
