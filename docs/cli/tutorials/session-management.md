# Manage conversation history and sessions

Gemini CLI automatically saves your conversation history so you can pick up
exactly where you left off. You can resume past sessions, browse your history,
and even "rewind" time to a previous state.

## Resume a session

You can continue a previous conversation by using the `--resume` (or `-r`) flag
when starting the CLI.

- **Resume latest:** `gemini --resume`
- **Resume by index:** `gemini --resume 1`
- **Resume by ID:** `gemini --resume a1b2c3d4...`

Alternatively, use the `/resume` command while the CLI is running to open the
interactive **Session Browser**.

## Manage your history

You can list all available sessions or delete unwanted history to keep your
workspace clean.

- **List sessions:** `gemini --list-sessions`
- **Delete a session:** `gemini --delete-session 2`

In the Session Browser (`/resume`), you can also press **x** to delete the
currently selected session.

## Rewind conversation and files

The `/rewind` command allows you to navigate backward through your current
session history. This is useful for undoing mistakes or exploring different
approaches.

When you rewind, you can choose to:

- Revert the conversation history only.
- Revert file changes made by the AI only.
- Revert both history and file changes simultaneously.

## Next steps

- Read the full [Session management guide](../../cli/session-management.md) for
  configuration and details.
- See the [Rewind guide](../../cli/rewind.md) for more details on the interface.
- Explore the [Command reference](../../cli/commands.md) for all session-related
  commands.
