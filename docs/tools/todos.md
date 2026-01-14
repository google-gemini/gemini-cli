# Todo tool (`write_todos`)

This document describes the `write_todos` tool for the Gemini CLI.

## Description

The `write_todos` tool allows the Gemini agent to create and manage a list of
subtasks for complex user requests. This provides you, the user, with greater
visibility into the agent's plan and its current progress. It also helps with
alignment where the agent is less likely to lose track of its current goal.

### Arguments

`write_todos` takes one argument:

- `todos` (array of objects, required): The complete list of todo items. This
  replaces the existing list. Each item includes:
  - `description` (string): The task description.
  - `status` (string): The current status (`pending`, `in_progress`,
    `completed`, or `cancelled`).

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

- **Enabling:** This tool is enabled by default. You can disable it in your
  `settings.json` file by setting `"useWriteTodos": false`.

- **Intended use:** This tool is primarily used by the agent for complex,
  multi-turn tasks. It is generally not used for simple, single-turn questions.
