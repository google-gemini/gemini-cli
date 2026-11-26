# Activate skill tool (`activate_skill`)

The `activate_skill` tool lets Gemini CLI load specialized procedural expertise
and resources when they are relevant to your request.

## Description

Skills are packages of instructions and tools designed for specific engineering
tasks, such as reviewing code or creating pull requests. Gemini CLI uses this
tool to "activate" a skill, which provides it with detailed guidelines and
specialized tools tailored to that task.

### Arguments

`activate_skill` takes one argument:

- `name` (enum, required): The name of the skill to activate (for example,
  `code-reviewer`, `pr-creator`, or `docs-writer`).

## Usage

When the agent identifies that a task matches a discovered skill, it requests to
activate that skill. Once activated, the agent's behavior is guided by the
skill's specific instructions until the task is complete.

You can also activate a skill yourself. In an interactive session, type
`/<skill-name>`, optionally followed by a task, for example
`/code-reviewer review my staged changes`. Gemini CLI calls `activate_skill` for
you and then sends the task to the model. Built-in skills aren't available as
slash commands.

## Behavior

The agent uses this tool to provide professional-grade assistance:

- **Specialized logic:** Skills contain expert-level procedures for complex
  workflows.
- **Dynamic capability:** Activating a skill can grant the agent access to new,
  task-specific tools.
- **Contextual awareness:** Skills help the agent focus on the most relevant
  standards and conventions for a particular task.

## Next steps

- Learn how to [Use Agent Skills](../cli/skills.md).
- See the [Build agent skills](../cli/creating-skills.md) guide.
