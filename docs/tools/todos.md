# Todo tool (`write_todos`)

The `write_todos` tool lets the Gemini agent create and manage a list of
subtasks for complex user requests. Use this tool to track the agent's progress
and stay aligned on multi-step plans.

## Description

The `write_todos` tool provides you with greater visibility into the agent's
plan and its current progress. It also helps with alignment where the agent is
less likely to lose track of its current goal.

### Arguments

`write_todos` takes one argument:

- `todos` (array of objects, required): The complete list of todo items. This
  replaces the existing list. Each item includes:
  - `description` (string): The task description.
  - `status` (string): The current status (`pending`, `in_progress`,
    `completed`, or `cancelled`).

## Usage

The `write_todos` tool is used exclusively by the Gemini agent to manage its
internal plan. You cannot create or modify todo items directly.

Instead, you can interact with the todo list visually in the CLI:

- **View progress:** When an agent is working on a complex task, the current
  `in_progress` item is displayed above the input prompt.
- **Toggle full list:** Press **Ctrl+T** at any time to show or hide the
  complete list of subtasks and their statuses.

## Behavior

The agent uses this tool to break down complex multi-step requests into a clear
plan.

- **Progress tracking:** The agent updates this list as it works, marking tasks
  as `completed` when done.
- **Single focus:** Only one task will be marked `in_progress` at a time,
  indicating exactly what the agent is currently working on.
- **Dynamic updates:** The plan may evolve as the agent discovers new
  information, leading to new tasks being added or unnecessary ones being
  cancelled.

When active, the current `in_progress` task is displayed above the input box,
keeping you informed of the immediate action. You can toggle the full view of
the todo list at any time by pressing `Ctrl+T`.

Usage example (internal representation):

```javascript
write_todos({
  todos: [
    { description: 'Initialize new React project', status: 'completed' },
    { description: 'Implement state management', status: 'in_progress' },
    { description: 'Create API service', status: 'pending' },
  ],
});
```

## Important notes

When using the todo tool, keep the following considerations in mind regarding
its visibility and intended use.

- **Enabling:** This tool is enabled by default. You can disable it in your
  `settings.json` file by setting `"useWriteTodos": false`.

- **Intended use:** This tool is primarily used by the agent for complex,
  multi-turn tasks. It is generally not used for simple, single-turn questions.

## Next steps

- Explore the [Command reference](../cli/commands.md) for related slash
  commands.
- Learn about [Session management](../cli/session-management.md) to track
  long-running tasks.
