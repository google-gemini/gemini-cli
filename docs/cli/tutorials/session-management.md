# Manage sessions and history

Resume, browse, and rewind your conversations with Gemini CLI. In this guide,
you'll learn how to switch between tasks, manage your session history, and undo
mistakes using the rewind feature.

## Prerequisites

- Gemini CLI installed and authenticated.
- At least one active or past session.

## How to resume where you left off

It's common to switch context—maybe you're waiting for a build and want to work
on a different feature. Gemini makes it easy to jump back in.

### Scenario: Resume the last session

The fastest way to pick up your most recent work is with the `--resume` flag (or
`-r`).

```bash
gemini -r
```

This restores your chat history and memory, so you can say "Continue with the
next step" immediately.

### Scenario: Browse past sessions

If you want to find a specific conversation from yesterday, use the interactive
browser.

**Command:** `/resume`

This opens a searchable list of all your past sessions. You'll see:

- A timestamp (for example, "2 hours ago").
- The first user message (helping you identify the topic).
- The number of turns in the conversation.

Select a session and press **Enter** to load it.

## How to manage your workspace

Over time, you'll accumulate a lot of history. Keeping your session list clean
helps you find what you need.

### Scenario: Deleting sessions

In the `/resume` browser, navigate to a session you no longer need and press
**x**. This permanently deletes the history for that specific conversation.

You can also manage sessions from the command line:

```bash
# List all sessions with their IDs
gemini --list-sessions

# Delete a specific session by ID or index
gemini --delete-session 1
```

### Scenario: Delete session on exit

If you're doing a one-off task and don't want to leave any session history
behind, use the `--delete` flag when exiting:

```
/exit --delete
```

This removes the current session's conversation history and tool output files
before exiting. It's useful for privacy-sensitive tasks or quick one-off
interactions.

## How to rewind time (Undo mistakes)

Gemini CLI's **Rewind** feature is like `Ctrl+Z` for your workflow.

### Scenario: Triggering rewind

At any point in a chat, type `/rewind` or press **Esc** twice.

### Scenario: Choosing a restore point

You'll see a list of your recent interactions. Select the point _before_ the
undesired changes occurred.

### Scenario: Choosing what to revert

Gemini gives you granular control over the undo process. You can choose to:

1.  **Rewind conversation:** Only remove the chat history. The files stay
    changed. (Useful if the code is good but the chat got off track).
2.  **Fork conversation from here:** Create a new independent session from this
    point and switch into it while leaving your original full conversation and
    files untouched.
3.  **Revert code changes:** Keep the chat history but undo the file edits.
    (Useful if you want to keep the context but retry the implementation).
4.  **Rewind both:** Restore everything to exactly how it was.

## How to fork conversations

Sometimes you want to try two different approaches to the same problem without
losing your original thread.

### Fork from the current point

1.  Start a session and get to a decision point.
2.  Run `/fork approach-a` to branch into a new named session while keeping your
    original conversation intact.
3.  To keep working in the current terminal and run a second approach in
    parallel, run `/fork --stay approach-b` and open the printed
    `gemini --resume <session_id>` command in another terminal.

### Fork from an earlier turn

1.  Run `/rewind` (or press **Esc** twice) and select the earlier prompt you
    want to branch from.
2.  Choose **Fork conversation from here**. Gemini CLI switches you to a new
    session at that turn and preserves your original session in `/resume`.

You can also use manual checkpoints (`/resume save <tag>` and
`/resume resume <tag>`) to save and reload named snapshots.

## Next steps

- Learn about [Checkpointing](../../cli/checkpointing.md) to understand the
  underlying safety mechanism.
- Explore [Task planning](task-planning.md) to keep complex sessions organized.
- See the [Command reference](../../reference/commands.md) for `/resume`
  options, grouped checkpoint menus, and `/chat` compatibility aliases.
