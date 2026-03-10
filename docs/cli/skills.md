# Agent Skills

Agent Skills let you extend Gemini CLI with specialized expertise, procedural
workflows, and task-specific resources. Based on the
[Agent Skills](https://agentskills.io) open standard, a "skill" is a
self-contained directory that packages instructions and assets into a
discoverable capability.

Unlike general context files ([`GEMINI.md`](../gemini-md.md)), which provide
persistent workspace-wide background, Skills represent **on-demand expertise**.
This lets Gemini maintain a vast library of specialized capabilities—such as
security auditing, cloud deployments, or codebase migrations—without cluttering
the model's immediate context window.

## How it works

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

## Discovery tiers

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

## Key benefits

Agent Skills provide several advantages for managing specialized knowledge and
complex workflows.

- **Shared Expertise**: Package complex workflows (like a specific team's PR
  review process) into a folder that anyone can use.
- **Repeatable Workflows**: Ensure complex multi-step tasks are performed
  consistently by providing a procedural framework.
- **Resource Bundling**: Include scripts, templates, or example data alongside
  instructions so the agent has everything it needs.
- **Progressive Disclosure**: Only skill metadata (name and description) is
  loaded initially. Detailed instructions and resources are only disclosed when
  the model explicitly activates the skill, saving context tokens.

## Standard skills

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

## Managing skills

You can manage Agent Skills through interactive session commands or directly
from your terminal.

### In an interactive session

Use the `/skills` slash command to view and manage available expertise:

- `/skills list [--all]`: Shows discovered skills. Use `--all` to include
  built-in skills.
- `/skills link <path>`: Links agent skills from a local directory via symlink.
- `/skills disable <name> [--scope]`: Prevents a specific skill from being used.
- `/skills enable <name> [--scope]`: Re-enables a disabled skill.
- `/skills reload`: Refreshes the list of discovered skills from all tiers.

### From the terminal

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

- [Get started with skills](./tutorials/skills-getting-started.md): Create your
  first skill.
- [Build agent skills](./creating-skills.md): Deepen your knowledge of skill
  creation.
- [Best practices](./skills-best-practices.md): Learn strategies for building
  effective skills.
