# Gemini CLI Companion for Zed

The Gemini CLI Companion for Zed is a standalone binary that pairs with
[Gemini CLI](https://github.com/google-gemini/gemini-cli) to provide IDE
integration when working in the [Zed](https://zed.dev/) editor.

## Features

- **Workspace Context:** Gemini CLI gains awareness of your workspace path,
  enabling project-scoped interactions.

- **Diff Management:** Proposed code changes are stored and can be reviewed and
  accepted/rejected from the CLI.

- **Automatic Discovery:** The companion writes a discovery file so Gemini CLI
  can find and connect to it automatically.

## Known Limitations

- **No file context tracking:** Zed does not currently expose open files, cursor
  position, or text selection to external processes. The companion reports only
  the workspace path. Open file tracking will be added when Zed provides the
  necessary APIs.

- **No programmatic diff view:** The `openDiff` tool stores proposed content but
  cannot open Zed's native diff UI from an external process. Users accept or
  reject diffs from the CLI side.

## Requirements

- Rust toolchain (for building from source) or a pre-built binary
- Gemini CLI (installed separately)
- Zed editor

## Installation

### Using cargo

```bash
cargo install gemini-cli-zed-companion
```

### Building from source

```bash
cd packages/zed-ide-companion
cargo build --release
```

The binary will be at `target/release/gemini-cli-zed-companion`.

## Usage

### Starting the companion

Run the companion binary, optionally specifying your workspace path:

```bash
gemini-cli-zed-companion --workspace-path /path/to/your/project
```

If `--workspace-path` is omitted, it defaults to the current working directory.

The companion will:

1. Start an MCP server on a random port on `127.0.0.1`
2. Write a discovery file to `$TMPDIR/gemini/ide/`
3. Print the port and discovery file path to stderr
4. Wait for connections from Gemini CLI

### Stopping the companion

Press `Ctrl+C` (SIGINT) to gracefully shut down. The companion will clean up the
discovery file automatically.

### From the CLI

Once the companion is running, use standard Gemini CLI IDE commands:

- `/ide enable` -- Enable IDE integration
- `/ide disable` -- Disable IDE integration
- `/ide status` -- Check connection status

### Automatic startup with Zed

To start the companion automatically when Zed opens a project, you can add a
task to your Zed `tasks.json`:

```json
[
  {
    "label": "Start Gemini CLI Companion",
    "command": "gemini-cli-zed-companion",
    "args": ["--workspace-path", "$ZED_WORKTREE_ROOT"]
  }
]
```

Or use a shell alias / startup script that detects Zed:

```bash
# In your .zshrc or .bashrc
if [ "$ZED_TERM" = "1" ] || [ "$TERM_PROGRAM" = "zed" ]; then
  gemini-cli-zed-companion --workspace-path "$(pwd)" &
fi
```

## Architecture

The companion is a standalone Rust binary that implements the
[IDE Companion Protocol](../../docs/ide-integration/ide-companion-spec.md):

```
src/
  main.rs       -- CLI args, init sequence, signal handling
  server.rs     -- axum HTTP server (POST/GET /mcp)
  mcp.rs        -- JSON-RPC types + dispatch
  context.rs    -- Minimal context (workspace path only)
  diff.rs       -- In-memory diff content store
  discovery.rs  -- Discovery file lifecycle
  auth.rs       -- UUID token + Bearer validation middleware
```

### Why a standalone binary?

Zed's WASM extension system cannot open TCP servers or track editor state
programmatically. A standalone binary is the practical approach -- the same
pattern used by language servers that Zed communicates with.

### Dependencies

| Crate        | Purpose                |
| ------------ | ---------------------- |
| axum         | HTTP server framework  |
| tokio        | Async runtime          |
| serde        | JSON serialization     |
| serde_json   | JSON parsing           |
| uuid         | Auth token generation  |
| tokio-stream | SSE streaming support  |
| tower-http   | HTTP middleware (CORS) |

## Troubleshooting

### CLI can't find the companion

- Ensure the companion binary is running before starting Gemini CLI.
- Check that the discovery file exists at `$TMPDIR/gemini/ide/` (run `ls` to
  verify).
- Run Gemini CLI from Zed's integrated terminal so the `$ZED_TERM` or
  `$TERM_PROGRAM` environment variable is set.

### Permission denied on discovery file

- The discovery file is created with `0600` permissions (owner read/write only).
  Ensure you are running both the companion and Gemini CLI as the same user.

### Port already in use

- The companion binds to port `0` (OS-assigned random port), so port conflicts
  should not occur. If you see a bind error, check for zombie companion
  processes.

## Terms of Service and Privacy Notice

By using this companion, you agree to the
[Terms of Service](https://geminicli.com/docs/resources/tos-privacy/).
