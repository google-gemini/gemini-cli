# Scheduled tasks

Scheduled tasks let you run prompts repeatedly, poll for status, or set one-time
reminders within a Gemini CLI session. You can use them to check the status of a
deployment, monitor a long-running build, or remind yourself to perform a task
later in your workflow.

<!-- prettier-ignore -->
> [!NOTE]
> Scheduled tasks are session-scoped. They only run while your Gemini CLI
> session is open and are cleared when you exit the CLI. For persistent
> scheduling, use your operating system's native scheduling tools (like `cron`
> or Task Scheduler).

## Schedule a recurring prompt with /loop

The `/loop` command is the fastest way to schedule a recurring prompt. You can
provide an optional interval and a prompt, and Gemini CLI schedules the task to
run in the background.

```text
/loop 5m check if the deployment finished
```

If you don't provide an interval, the command defaults to 10 minutes.

### Interval syntax

Intervals use a simple numeric value followed by a unit character. Supported
units are `s` for seconds, `m` for minutes, `h` for hours, and `d` for days.

| Form          | Example                     | Interval         |
| :------------ | :-------------------------- | :--------------- |
| Leading token | `/loop 30m check the build` | Every 30 minutes |
| No interval   | `/loop check the build`     | Every 10 minutes |

### Loop over another command

A scheduled prompt can be a slash command or a skill invocation. This lets you
automate existing workflows.

```text
/loop 20m /git:status
```

Gemini CLI executes the command as if you had typed it yourself.

## Set a one-time reminder

To set a single reminder, describe what you want in natural language. Gemini CLI
uses its internal scheduling tools to set a one-time task that removes itself
after firing.

```text
In 15 minutes, remind me to push my changes
```

```text
Remind me in 1h to check the integration tests
```

## Manage scheduled tasks

You can ask Gemini CLI to list or cancel your active tasks using natural
language.

```text
What scheduled tasks do I have?
```

```text
Cancel the deployment check task
```

Under the hood, the agent uses these tools to manage your schedule:

| Tool                    | Purpose                                            |
| :---------------------- | :------------------------------------------------- |
| `schedule_task`         | Schedules a new recurring or one-time task.        |
| `list_scheduled_tasks`  | Lists all active tasks with their IDs and prompts. |
| `cancel_scheduled_task` | Cancels a specific task using its ID.              |

## How scheduled tasks run

Scheduled tasks trigger only when Gemini CLI is idle.

- **Non-disruptive:** If a task becomes due while the agent is busy generating a
  response or executing a tool, the prompt is queued.
- **Sequential:** The queued prompt executes immediately after the current turn
  finishes.
- **Shared context:** Scheduled tasks run within your active session and have
  access to the full conversation history and any files you have added to the
  context.

## Limitations

Session-scoped scheduling has the following constraints:

- **Active session required:** Tasks only fire while Gemini CLI is running.
  Closing your terminal or exiting the session cancels all tasks.
- **Shared context window:** Every task execution adds to your session's history
  and consumes tokens in the context window. High-frequency loops may trigger
  [context compression](./token-caching.md) sooner.
- **No persistence:** Restarting Gemini CLI clears all tasks.
- **Simple intervals:** Only simple time intervals are supported (e.g., `5m`).
  Complex cron expressions (e.g., `0 9 * * 1-5`) are not supported.
