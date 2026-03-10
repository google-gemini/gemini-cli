# Build agent skills

Agent Skills let you extend Gemini CLI with specialized expertise, procedural
workflows, and task-specific resources. This guide walks you through creating
your first skill, from defining its purpose to bundling custom scripts and
assets.

## Prerequisites

Before you start, you will need:

- Gemini CLI installed.
- A basic understanding of Markdown and YAML.

## Step 1: Create a skill

The easiest way to start is by using the built-in `skill-creator` skill. To use
it, ask Gemini CLI to create a new skill for you.

**Example prompt:**

> "create a new skill called 'code-reviewer'"

Gemini CLI then uses the `skill-creator` to generate the skill:

1.  Generate a new directory for your skill (for example, `code-reviewer/`).
2.  Create a `SKILL.md` file with the necessary YAML frontmatter (`name` and
    `description`).
3.  Create the standard resource directories: `scripts/`, `references/`, and
    `assets/`.

### Using creation scripts

If you are developing a skill and want to use the same scripts the
`skill-creator` uses, you can find them in the core package. These scripts help
automate the initialization, validation, and packaging of skills.

- **Initialize**: `node scripts/init_skill.cjs <name> --path <dir>`
- **Validate**: `node scripts/validate_skill.cjs <path/to/skill>`
- **Package**: `node scripts/package_skill.cjs <path/to/skill>` (Creates a
  `.skill` zip file)

## Manual creation

If you prefer to create skills manually, you can set up the directory and
required files yourself.

1.  **Create a directory** for your skill (for example, `my-skill/`).
2.  **Create a `SKILL.md` file** inside the new directory.

To add additional resources that support the skill, refer to the skill
structure.

## Step 2: Define your skill (`SKILL.md`)

The `SKILL.md` file is the core of your skill. It uses YAML frontmatter for
metadata and Markdown for instructions.

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
- **Local Changes**: If changes are local...
```

### Metadata fields

The YAML frontmatter provides essential information for skill discovery and
identification.

- **`name`**: A unique identifier for the skill. This should match the directory
  name.
- **`description`**: **CRITICAL.** This is how Gemini decides when to use the
  skill. Be specific about the tasks it handles and the keywords that should
  trigger it.
- **Body**: The Markdown body contains the instructions that guide the agent's
  behavior when the skill is active.

## Step 3: Organize your resources

While a `SKILL.md` file is the only required component, we recommend the
following structure for organizing your skill's resources.

```text
my-skill/
├── SKILL.md       (Required) Instructions and metadata
├── scripts/       (Optional) Executable scripts
├── references/    (Optional) Static documentation
└── assets/        (Optional) Templates and other resources
```

When a skill is activated, the model is granted access to this entire directory.
You can instruct the model to use the tools and files found within these
folders.

## Step 4: Add tool logic (Optional)

Skills can bundle executable scripts that the agent can run using the
`run_shell_command` tool.

1.  Create a file at `my-skill/scripts/audit.js`:

    ```javascript
    const url = process.argv[2];
    console.log(`Auditing ${url}...`);
    // ... audit logic ...
    ```

2.  Update your `SKILL.md` to instruct the agent to use this script:

    ```markdown
    ## Instructions

    When the user asks to audit a URL, use the bundled `scripts/audit.js`
    utility:

    `node scripts/audit.js <url>`
    ```

## Step 5: Link and test your skill

Link your skill to your Gemini CLI installation for local development.

1.  **Link the skill:**

    The `link` command creates a symbolic link in your user skills directory
    (`~/.gemini/skills`).

    ```bash
    gemini skills link .
    ```

2.  **Verify discovery:**

    Start Gemini CLI and run `/skills list`. You should see your new skill in
    the list.

3.  **Test activation:**

    Ask a question that triggers the skill's description. For example: "Review
    my latest changes."

## Step 6: Share your skill

You can share your skills in several ways depending on your target audience.

- **Workspace Skills**: Commit your skill to a `.gemini/skills/` directory in
  your project repository.
- **Extensions**: Bundle your skill within a
  [Gemini CLI extension](../../extensions/index.md).
- **Git Repositories**: Share the skill directory as a standalone Git repo and
  install it using `gemini skills install <url>`.

## Next steps

Explore these resources to refine your skills and understand the framework
better.

- [Overview](./skills.md): Understand the discovery tiers and activation
  lifecycle.
- [Best practices](./skills-best-practices.md): Learn strategies for building
  effective skills.
