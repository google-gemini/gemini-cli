# Session management

Session management saves your conversation history so you can resume your work
where you left off. Use these features to review past interactions, manage
history across different projects, and configure how long data is retained.

## Automatic saving

Your session history is recorded automatically as you interact with the model.
This background process ensures your work is preserved even if you interrupt a
session.

- **What is saved:** The complete conversation history, including:
  - Your prompts and the model's responses.
  - All tool executions (inputs and outputs).
  - Token usage statistics (input, output, cached, etc.).
  - Assistant thoughts and reasoning summaries (when available).
- **Location:** Sessions are stored in `~/.gemini/tmp/<project_hash>/chats/`,
  where `<project_hash>` is a unique identifier based on your project's root
  directory.
- **Scope:** Sessions are project-specific. Switching directories to a different
  project switches to that project's session history.

## Resuming sessions

You can resume a previous session to continue the conversation with all prior
context restored. Resuming is supported both through command-line flags and an
interactive browser.

### From the command line

When starting Gemini CLI, use the `--resume` (or `-r`) flag to load existing
sessions.

- **Resume latest:**

  ```bash
  gemini --resume
  ```

  This immediately loads the most recent session.

- **Resume by index:** List available sessions first (see
  [Listing sessions](#listing-sessions)), then use the index number:

  ```bash
  gemini --resume 1
  ```

- **Resume by ID:** You can also provide the full session UUID:
  ```bash
  gemini --resume a1b2c3d4-e5f6-7890-abcd-ef1234567890
  ```

### From the interactive interface

While the CLI is running, use the `/resume` slash command to open the **Session
Browser**:

```text
/resume
```

The Session Browser provides an interactive interface where you can perform the
following actions:

- **Browse:** Scroll through a list of your past sessions.
- **Preview:** See details like the session date, message count, and the first
  user prompt.
- **Search:** Press `/` to enter search mode, then type to filter sessions by ID
  or content.
- **Select:** Press **Enter** to resume the selected session.
- **Esc:** Press **Esc** to exit the Session Browser.

## Managing sessions

You can list and delete sessions to keep your history organized and manage disk
space.

### Listing sessions

To see a list of all available sessions for the current project from the command
line, use the `--list-sessions` flag:

```bash
gemini --list-sessions
```

Output example:

```text
Available sessions for this project (3):

  1. Fix bug in auth (2 days ago) [a1b2c3d4]
  2. Refactor database schema (5 hours ago) [e5f67890]
  3. Update documentation (Just now) [abcd1234]
```

### Deleting sessions

You can remove old or unwanted sessions to free up space or declutter your
history.

**From the command line:** Use the `--delete-session` flag with an index or ID:

```bash
gemini --delete-session 2
```

**From the Session Browser:**

1.  Open the browser with `/resume`.
2.  Navigate to the session you want to remove.
3.  Press **x**.

## Configuration

You can configure how Gemini CLI manages your session history in your
`settings.json` file. These settings let you control retention policies and
session lengths.

### Session retention

To prevent your history from growing indefinitely, enable automatic cleanup
policies in your settings.

```json
{
  "general": {
    "sessionRetention": {
      "enabled": true,
      "maxAge": "30d", // Keep sessions for 30 days
      "maxCount": 50 // Keep the 50 most recent sessions
    }
  }
}
```

- **`enabled`**: (boolean) Master switch for session cleanup. Defaults to
  `false`.
- **`maxAge`**: (string) Duration to keep sessions (for example, "24h", "7d",
  "4w"). Sessions older than this are deleted.
- **`maxCount`**: (number) Maximum number of sessions to retain. The oldest
  sessions exceeding this count are deleted.
- **`minRetention`**: (string) Minimum retention period (safety limit). Defaults
  to `"1d"`. Sessions newer than this period are never deleted by automatic
  cleanup.

### Session limits

You can limit the length of individual sessions to prevent context windows from
becoming too large and expensive.

```json
{
  "model": {
    "maxSessionTurns": 100
  }
}
```

- **`maxSessionTurns`**: (number) The maximum number of turns (user and model
  exchanges) allowed in a single session. Set to `-1` for unlimited (default).

  **Behavior when limit is reached:**
  - **Interactive mode:** The CLI shows an informational message and stops
    sending requests to the model. You must manually start a new session.
  - **Non-interactive mode:** The CLI exits with an error.

## Next steps

- Explore the [Memory tool](../tools/memory.md) to save persistent information
  across sessions.
- Learn how to [Checkpoint](./checkpointing.md) your session state.
- Check out the [CLI reference](./cli-reference.md) for all command-line flags.
