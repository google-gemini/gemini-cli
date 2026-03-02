# Neovim IDE integration

Gemini CLI integrates with [Neovim](https://neovim.io/) through a companion
plugin that runs an MCP server directly inside Neovim using its built-in libuv
bindings. No external dependencies are required.

## Features

- **Open buffer context:** The CLI is aware of the files you have open in Neovim
  (up to 10 most recently focused buffers), your cursor position, and any visual
  selection (up to 16KB).

- **Native diffing:** Proposed code changes open in a vimdiff view. Accept with
  `<leader>ga` or reject with `<leader>gr`.

- **Automatic discovery:** The plugin writes a discovery file so Gemini CLI
  finds and connects to Neovim automatically.

## Installation

### Option 1: Automatic nudge

When you run Gemini CLI inside Neovim's integrated terminal (`:terminal`), it
detects the `$NVIM` environment variable and prompts you to install the
companion plugin. Follow the on-screen instructions.

### Option 2: Plugin manager (recommended)

**lazy.nvim:**

```lua
{
  "google/gemini-cli",
  config = function()
    require("gemini-cli").setup()
  end,
}
```

**packer.nvim:**

```lua
use {
  "google/gemini-cli",
  config = function()
    require("gemini-cli").setup()
  end,
}
```

### Option 3: Manual installation

```bash
git clone https://github.com/google-gemini/gemini-cli \
  ~/.local/share/nvim/site/pack/gemini/start/gemini-cli
```

Then add to your `init.lua`:

```lua
require("gemini-cli").setup()
```

> After manual installation, run `/ide enable` in the CLI to activate the
> integration.

## Configuration

```lua
require("gemini-cli").setup({
  auto_start = true,  -- Start the companion server automatically (default: true)
})
```

## Usage

### Commands

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `:GeminiCliStart`  | Start the companion server               |
| `:GeminiCliStop`   | Stop the companion server                |
| `:GeminiCliStatus` | Show server status (port, sessions, etc) |

### Enabling and disabling

From within Gemini CLI:

- `/ide enable` -- Enable IDE integration
- `/ide disable` -- Disable IDE integration
- `/ide status` -- Check connection status

### Working with diffs

When Gemini suggests code modifications, a vimdiff view opens showing the
original file alongside the proposed changes.

**To accept a diff:**

- Press `<leader>ga` in either the original or proposed buffer.
- The proposed content is written to the file and saved.

**To reject a diff:**

- Press `<leader>gr` in either the original or proposed buffer.
- The proposed changes are discarded and the diff view closes.

You can also edit the proposed content in the original buffer before accepting.

### Checking the status

Run `:GeminiCliStatus` to see:

- Server port
- Discovery file location
- Number of active sessions and SSE clients

## How it works

The plugin runs entirely in pure Lua using Neovim's built-in APIs:

1. **Server:** A minimal HTTP/1.1 server using `vim.loop.new_tcp()` (libuv)
   listens on `127.0.0.1` on a random port.
2. **Discovery:** A JSON file is written to `$TMPDIR/gemini/ide/` containing the
   port, auth token, and workspace path. Gemini CLI reads this file to connect.
3. **Context:** Autocmds on `BufEnter`, `BufDelete`, `CursorMoved`, and
   `ModeChanged` track open files, cursor position, and visual selection.
   Changes are debounced (50ms) and broadcast via SSE.
4. **Diffs:** `openDiff` creates a vertical split with `diffthis` on both
   buffers. Accept/reject keymaps send `ide/diffAccepted` or `ide/diffRejected`
   notifications back to the CLI.
5. **Cleanup:** `VimLeavePre` autocmd stops the server and deletes the discovery
   file.

For the full protocol specification, see the
[IDE Companion Spec](./ide-companion-spec.md).

## Troubleshooting

### CLI doesn't detect Neovim

- Run Gemini CLI from Neovim's integrated terminal (`:terminal`). This sets the
  `$NVIM` environment variable that the CLI uses for detection.
- If running in an external terminal, set `GEMINI_CLI_IDE_PID` to your Neovim
  process PID:
  ```bash
  export GEMINI_CLI_IDE_PID=$(pgrep -x nvim)
  ```

### Server won't start

- Ensure Neovim 0.9.0 or newer (`nvim --version`).
- Check `:messages` for error output after running `:GeminiCliStart`.
- Verify `$TMPDIR/gemini/ide/` is writable.

### Diff keymaps not responding

- Check your `<leader>` key setting (`:echo mapleader`). Default is `\`.
- Keymaps are buffer-local and only active while a diff view is open.

### Connection lost after Neovim restart

- The companion server only runs while Neovim is open. Restarting Neovim starts
  a new server with a new port and token.
- Run `/ide enable` in the CLI to reconnect, or restart the CLI.
