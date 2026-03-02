# Zed IDE integration

Gemini CLI integrates with [Zed](https://zed.dev/) through a standalone
companion binary that runs alongside the editor. The companion implements the
MCP-based IDE Companion Protocol and communicates with Gemini CLI over HTTP on
localhost.

## Features

- **Workspace context:** The CLI is aware of your workspace path for
  project-scoped interactions.

- **Diff management:** Proposed code changes are stored by the companion and can
  be reviewed and accepted/rejected from the CLI.

## Known limitations

- **No open file tracking:** Zed does not currently expose open files, cursor
  position, or text selection to external processes. The companion reports only
  the workspace path. This will improve as Zed adds extension APIs.

- **No native diff view:** The companion cannot open Zed's diff UI
  programmatically. Diffs are managed from the CLI side.

## Installation

### Using cargo (recommended)

```bash
cargo install gemini-cli-zed-companion
```

### Building from source

```bash
cd packages/zed-ide-companion
cargo build --release
# Binary is at target/release/gemini-cli-zed-companion
```

## Usage

### Starting the companion

Start the companion binary before or alongside Gemini CLI:

```bash
gemini-cli-zed-companion --workspace-path /path/to/your/project
```

If `--workspace-path` is omitted, it defaults to the current directory.

The companion will:

1. Start an MCP server on a random port on `127.0.0.1`
2. Write a discovery file to `$TMPDIR/gemini/ide/`
3. Print the port and discovery file path to stderr
4. Wait for Gemini CLI connections

### Stopping the companion

Press `Ctrl+C` to shut down gracefully. The discovery file is cleaned up
automatically.

### Automatic startup

To start the companion automatically when using Zed's terminal, add to your
shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
if [ "$ZED_TERM" = "1" ] || [ "$TERM_PROGRAM" = "zed" ]; then
  gemini-cli-zed-companion --workspace-path "$(pwd)" &
fi
```

Or use Zed's task system by adding to your `tasks.json`:

```json
[
  {
    "label": "Start Gemini CLI Companion",
    "command": "gemini-cli-zed-companion",
    "args": ["--workspace-path", "$ZED_WORKTREE_ROOT"]
  }
]
```

### From the CLI

Once the companion is running, use standard Gemini CLI commands:

- `/ide enable` -- Enable IDE integration
- `/ide disable` -- Disable IDE integration
- `/ide status` -- Check connection status

### Working with diffs

When Gemini suggests code modifications:

1. The CLI sends an `openDiff` request to the companion, which stores the
   proposed content.
2. You review and accept/reject the changes from within the CLI.
3. The companion sends `ide/diffAccepted` or `ide/diffRejected` notifications
   back to the CLI.

## How it works

The companion is a standalone Rust binary using axum (HTTP) and tokio (async
runtime):

1. **Server:** An axum HTTP server listens on `127.0.0.1:0` (random port) with
   Bearer auth, CORS rejection, and host validation middleware.
2. **Discovery:** A JSON file at `$TMPDIR/gemini/ide/` contains the port, auth
   token, workspace path, and IDE info (`name: "zed"`).
3. **Context:** Returns workspace path only (empty `openFiles` array) due to Zed
   API limitations.
4. **Diffs:** Proposed content is stored in memory. `closeDiff` returns the
   stored content.
5. **Cleanup:** SIGINT/SIGTERM triggers graceful shutdown and discovery file
   deletion.

### Why a standalone binary?

Zed's WASM extension system cannot open TCP servers or access editor state
programmatically. A standalone binary follows the same pattern as language
servers, which Zed already communicates with effectively.

For the full protocol specification, see the
[IDE Companion Spec](./ide-companion-spec.md).

## Troubleshooting

### CLI doesn't detect Zed

- Run Gemini CLI from Zed's integrated terminal. This sets `$ZED_TERM=1` or
  `$TERM_PROGRAM=zed`.
- If running in an external terminal, set `GEMINI_CLI_IDE_PID` to Zed's PID:
  ```bash
  export GEMINI_CLI_IDE_PID=$(pgrep -x zed)
  ```

### Companion can't write discovery file

- Verify `$TMPDIR/gemini/ide/` exists and is writable (the companion creates it
  if needed).
- On macOS, `$TMPDIR` typically points to a user-specific temp directory.

### CLI shows "Disconnected" after companion restart

- Each companion start creates a new server with a new port and token.
- Run `/ide enable` in the CLI to reconnect.
