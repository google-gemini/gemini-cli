# Fork session (`/fork`)

The `/fork` command saves a snapshot of your current conversation as a new,
independent session. Both the original and the forked session can continue
independently — changes in one do not affect the other.

## Usage

```text
/fork
```

No arguments are needed. The command forks from the current point in the
conversation.

## What happens

1. The current session is saved to a new file in
   `~/.gemini/tmp/<project_hash>/chats/` with a fresh session ID.
2. A confirmation message is printed with the fork's short ID and instructions
   to resume it.
3. Your original session is unchanged — you can keep working in it.

```text
Fork saved (a1b2c3d4).
Resume with: gemini --resume a1b2c3d4
Or browse sessions with: /chat
```

## When to use it

- **Explore a risky path:** Fork before letting the model attempt a large
  refactor. If things go wrong, your original session is untouched.
- **Compare approaches:** Resume the fork in another terminal and send the same
  next prompt in both windows to see which direction works better.
- **Hand off a sub-task:** Fork the session so a separate window can handle a
  parallel workstream while you continue in the original.

## Relationship to other session commands

| Command   | Effect                                                    |
| --------- | --------------------------------------------------------- |
| `/rewind` | Destructively removes history from the current session    |
| `/fork`   | Non-destructively branches into a new independent session |
| `/resume` | Resumes an existing session (including a forked one)      |
| `/chat`   | Opens the session browser, where forked sessions appear   |

## Why `/fork` instead of `--resume` in a second terminal

`--resume` was designed for sequential use — close a session, pick it up later.
If you `--resume` the same session ID in two terminals simultaneously, both
processes write to the **same file** with no locking. The last write silently
overwrites the other's messages, corrupting the saved session.

`/fork` avoids this entirely: it creates a **new file** with a **new session
ID**, so both sessions are fully independent with no write conflicts.

## Key considerations

- A fork captures the conversation history at the moment `/fork` is run. Any
  messages added after that point in the original session are not reflected in
  the fork, and vice versa.
- Forked sessions are subject to the same retention policy as regular sessions
  (see [Session management](./session-management.md#session-retention)).
- The model's in-memory state (compressed history, system prompt) is
  re-initialized from the saved file when the fork resumes, exactly as with any
  other `/resume`.
