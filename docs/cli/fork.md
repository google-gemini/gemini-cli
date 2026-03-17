# Fork

The `/fork` command creates an independent copy of your current conversation
session. This allows you to explore different directions from the same
conversation point without write conflicts that occur when using `--resume` in
multiple terminals.

## Problem it solves

When you use `--resume` in multiple terminals to work on the same session, both
processes write to the same session file with no locking. This can lead to data
loss due to last-write-wins corruption.

The `/fork` command solves this by creating a completely independent session
with its own file, allowing safe parallel work.

## Usage

To fork your current session, simply type `/fork` into the input prompt and
press **Enter**.

## Output

When you create a fork, you'll see a confirmation message with:

1.  **Short ID:** An 8-character identifier for your forked session
2.  **Resume command:** The exact command to resume the fork in another terminal
3.  **Browse hint:** A reminder that you can list all sessions with `/chat`

Example output:

```text
> /fork
Fork saved (a1b2c3d4).
Resume with: gemini --resume a1b2c3d4
Or browse sessions with: /chat
```

## Use cases

### Explore a risky path

Fork before attempting a large refactor or experimental change. If it goes
wrong, the original session remains untouched and you can simply resume it
instead.

```text
1. Start working on a feature
2. Run /fork to save your current state
3. Attempt the risky refactor in the current session
4. If it fails, use /chat to find and resume your fork
```

### Compare approaches

Resume the fork in another terminal to try a different implementation approach
while keeping the original session intact.

```text
Terminal 1: Original session
> /fork
Fork saved (a1b2c3d4).
Resume with: gemini --resume a1b2c3d4

Terminal 2: Forked session
$ gemini --resume a1b2c3d4
> Now you can explore a different direction
```

### Hand off a sub-task

Fork your session so a separate window handles a parallel workstream, allowing
you to work on two related tasks simultaneously without conflicts.

## Key considerations

- **Independent sessions:** Each fork is a completely independent session with
  its own file. Changes in one session don't affect the other.
- **Full conversation copy:** The fork includes all messages, context, and
  history from the original session at the time of forking.
- **New session ID:** The fork receives a new unique session ID for proper
  tracking and resumption.
- **No file locking needed:** Since each fork has its own file, there's no risk
  of write conflicts or data corruption.
- **Discoverable:** Forks appear in `/chat` listings alongside your regular
  sessions, making them easy to find and resume.

## Combining with other commands

The `/fork` command composes well with other session management commands:

- **`/fork` + `/rewind`:** Fork to preserve your current state, then rewind to
  explore earlier points
- **`/chat`:** Browse and select from all your sessions including forks
- **`--resume`:** Resume any fork by its short ID or index number
