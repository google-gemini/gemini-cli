# Using Agent Skills

Agent Skills provide Gemini CLI with specialized expertise on demand. Unlike
general instructions, a "skill" is a self-contained capability that the agent
activates only when needed.

This guide walks you through how to discover, activate, and install skills in
your environment.

## Step 1: Discover available skills

Before you can use a skill, you need to know what is available in your
environment. Gemini CLI automatically discovers skills from several "tiers":
built-in, extensions, your user profile, and your current workspace.

To see all skills discovered in your current session, use the `/skills list`
command:

```bash
/skills list
```

This will display a list of skills, their current status (Enabled/Disabled), and
a brief description of what they do.

> **Tip:** Use `/skills list all` to include internal built-in skills in the
> output.

## Step 2: Trigger and activate a skill

You don't "run" a skill like a command. Instead, you trigger it naturally by
asking the agent to perform a task that falls within a skill's expertise.

1.  **Trigger**: Ask a question or give a command. For example, "Review my
    latest changes."
2.  **Identification**: Gemini CLI identifies that a skill (e.g.,
    `code-reviewer`) matches your request.
3.  **Activation**: The agent calls the `activate_skill` tool.
4.  **Consent**: You will see a confirmation prompt. Type **y** to approve.

Once activated, the skill's specific instructions and bundled resources are
injected into the session. The agent will follow that specialized guidance for
the rest of the conversation.

## Step 3: Install new skills

You can add new capabilities to your CLI by installing skills shared by others
or linking to local directories.

### Install from a Git repository

To install a skill from a remote repository, use the `gemini skills install`
terminal command:

```bash
gemini skills install https://github.com/user/my-awesome-skill
```

By default, this installs the skill to your **user profile**
(`~/.gemini/skills`), making it available across all your projects.

### Link a local skill

If you have a skill directory on your machine (for example, one you are
developing), you can "link" it instead of installing it:

```bash
gemini skills link ./path/to/my-skill
```

Linking creates a reference to the directory, so any changes you make to the
skill's files are immediately available in the CLI.

## Step 4: Manage skill status

If you want to prevent a specific skill from being triggered, you can disable
it.

- **Disable**: `/skills disable <name>`
- **Enable**: `/skills enable <name>`

Disabling a skill removes its description from the agent's system prompt,
ensuring it won't be accidentally activated during your session.

## Step 5: Uninstall a skill

To completely remove an installed or linked skill, use the `uninstall` command:

```bash
gemini skills uninstall <name>
```

## Next steps

Now that you know how to use and manage skills, try building your own to
automate your specific workflows:

- [Get started with Agent Skills](./tutorials/skills-getting-started.md): A
  quick walkthrough of triggering and using skills.
- [Creating Agent Skills](./creating-skills.md): Create your first skill from
  scratch.
- [Skill best practices](./skills-best-practices.md): Learn how to design
  reliable and effective expertise.
