# Manage sessions and history

Resume, browse, and rewind your conversations with Gemini CLI. In this guide,
you'll learn how to switch between tasks, manage your session history, and undo
mistakes using the rewind feature.

## Prerequisites

- Gemini CLI installed and authenticated.
- At least one active or past session.

## 1. Resume where you left off

It's common to switch context—maybe you're waiting for a build and want to work
on a different feature. Gemini makes it easy to jump back in.

### Resume the last session

The fastest way to pick up your most recent work is with the `--resume` flag (or
`-r`).

```bash
gemini -r
```

This restores your chat history and memory, so you can say "Continue with the
next step" immediately.

### Browse past sessions

If you want to find a specific conversation from yesterday, use the interactive
browser.

**Command:** `/resume`

This opens a searchable list of all your past sessions. You'll see:

- A timestamp (e.g., "2 hours ago").
- The first user message (helping you identify the topic).
- The number of turns in the conversation.

Select a session and press **Enter** to load it.

## 2. Manage your workspace

Over time, you'll accumulate a lot of history. Keeping your session list clean
helps you find what you need.

### Deleting sessions

In the `/resume` browser, navigate to a session you no longer need and press
**x**. This permanently deletes the history for that specific conversation.

You can also manage sessions from the command line:

```bash
# List all sessions with their IDs
gemini --list-sessions

# Delete a specific session by ID or index
gemini --delete-session 1
```

## 3. Rewind time (Undo mistakes)

We've all been there: you ask the agent to refactor a file, and it deletes
something critical. Or maybe you just went down a rabbit hole and want to start
over.

Gemini CLI's **Rewind** feature is like `Ctrl+Z` for your entire workflow.

### Triggering rewind

At any point in a chat, type `/rewind` or press **Esc** twice.

### Choosing a restore point

You'll see a list of your recent interactions. Select the point _before_ the
mistake happened.

### Choosing what to revert

Gemini gives you granular control over the undo process. You can choose to:

1.  **Rewind conversation:** Only remove the chat history. The files stay
    changed. (Useful if the code is good but the chat got off track).
2.  **Revert code changes:** Keep the chat history but undo the file edits.
    (Useful if you want to keep the context but retry the implementation).
3.  **Rewind both:** Restore everything to exactly how it was. (The "Panic
    Button").

**Tip:** This uses a hidden Git history, so it's safe even if you haven't
committed your changes to your actual Git repo yet.

## 4. Forking conversations

Sometimes you want to try two different approaches to the same problem.

1.  Start a session and get to a decision point.
2.  **Save** the current state with `/chat save decision-point`.
3.  Try "Approach A".
4.  Later, use `/chat resume decision-point` to fork the conversation back to
    that moment and try "Approach B".

This creates a new branch of history without losing your original work.

## Next steps

- Learn about [Checkpointing](../../cli/checkpointing.md) to understand the
  underlying safety mechanism.
- Explore [Task planning](task-planning.md) to keep complex sessions organized.
- See the [Command reference](../../cli/commands.md) for all `/chat` and
  `/resume` options.
