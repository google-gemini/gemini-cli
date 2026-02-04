# Plan complex tasks with todos

For multi-step requests, the Gemini agent can create and manage a list of
subtasks. This provides you with visibility into the agent's progress and
ensures alignment on complex plans.

## How it works

The agent uses the `write_todos` tool to break down a large request into
distinct, manageable steps.

- **Automatic planning:** For complex tasks, the agent will generate a todo list
  before it begins work.
- **Progress tracking:** The agent updates the list as it completes tasks,
  marking items as `completed`, `in_progress`, or `cancelled`.
- **Dynamic updates:** The plan may evolve as new information is discovered.

## View and toggle todos

You can monitor the agent's progress directly in the CLI.

- **Current task:** The item currently `in_progress` is displayed above the
  input prompt.
- **Full list:** Press **Ctrl+T** to toggle the full view of all subtasks and
  their statuses.

## Next steps

- See the [Todo tool reference](../../tools/todos.md) for more details on task
  states.
- Learn about [Session management](./session-management.md) to track
  long-running projects.
