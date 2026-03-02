# Gemini CLI Companion for Neovim

The Gemini CLI Companion plugin for Neovim pairs with
[Gemini CLI](https://github.com/google-gemini/gemini-cli) to provide IDE
integration features directly in your Neovim editor.

## Features

- **Open Buffer Context:** Gemini CLI gains awareness of the files you have open
  in Neovim (up to 10 most recently focused buffers), providing richer
  understanding of your project's structure and content.

- **Cursor and Selection Context:** Gemini CLI can access your cursor position
  and visually selected text (up to 16KB), giving it valuable context from your
  current work.

- **Native Diffing:** View proposed code changes in a side-by-side vimdiff view.
  Accept with `<leader>ga` or reject with `<leader>gr` directly from Neovim.

- **Automatic Discovery:** The plugin starts an MCP server on a random port and
  writes a discovery file so Gemini CLI can find and connect to it
  automatically.

## Requirements

- Neovim 0.9.0 or newer (requires `vim.loop` / libuv bindings)
- Gemini CLI (installed separately) running within Neovim's integrated terminal
  or a terminal with the `$NVIM` environment variable set

## Installation

### Using lazy.nvim (recommended)

Add the following to your lazy.nvim plugin spec:

```lua
{
  "google/gemini-cli",
  config = function()
    require("gemini-cli").setup()
  end,
}
```

### Using packer.nvim

```lua
use {
  "google/gemini-cli",
  config = function()
    require("gemini-cli").setup()
  end,
}
```

### Manual installation

Clone the plugin into your Neovim packages directory:

```bash
git clone https://github.com/google-gemini/gemini-cli \
  ~/.local/share/nvim/site/pack/gemini/start/gemini-cli
```

Then add to your `init.lua`:

```lua
require("gemini-cli").setup()
```

## Configuration

The `setup()` function accepts an optional configuration table:

```lua
require("gemini-cli").setup({
  -- Whether to start the companion server automatically on plugin load.
  -- Default: true
  auto_start = true,
})
```

## Usage

### Commands

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `:GeminiCliStart`  | Start the companion server               |
| `:GeminiCliStop`   | Stop the companion server                |
| `:GeminiCliStatus` | Show server status (port, sessions, etc) |

### Working with diffs

When Gemini CLI suggests code changes, a vimdiff view opens in a vertical split
showing the original file alongside the proposed changes.

| Keymap       | Action                                       |
| ------------ | -------------------------------------------- |
| `<leader>ga` | Accept the diff (writes changes to the file) |
| `<leader>gr` | Reject the diff (discards proposed changes)  |

### From the CLI

You can also use standard Gemini CLI IDE commands:

- `/ide enable` -- Enable IDE integration
- `/ide disable` -- Disable IDE integration
- `/ide status` -- Check connection status

## Architecture

The plugin implements the
[IDE Companion Protocol](../../docs/ide-integration/ide-companion-spec.md) using
pure Lua with Neovim's built-in libuv bindings (`vim.loop`):

```
lua/gemini-cli/
  init.lua       -- Entry point, setup(), lifecycle, user commands
  server.lua     -- HTTP server via vim.loop (libuv TCP)
  mcp.lua        -- JSON-RPC dispatch, tool definitions
  context.lua    -- Context tracking via autocmds (BufEnter, CursorMoved, etc)
  diff.lua       -- vimdiff-based diff view with accept/reject
  discovery.lua  -- Discovery file write/cleanup
  auth.lua       -- Token generation + validation
plugin/
  gemini-cli.vim -- Auto-load entry point
```

**No external dependencies required.** The plugin uses only Neovim's built-in
Lua APIs and `vim.loop` (libuv).

## Troubleshooting

### Server won't start

- Ensure you are running Neovim 0.9.0 or newer (`nvim --version`).
- Check for errors with `:messages` after running `:GeminiCliStart`.
- Verify the discovery directory is writable: `$TMPDIR/gemini/ide/` (or
  `/tmp/gemini/ide/` if `$TMPDIR` is not set).

### CLI can't find Neovim

- Run Gemini CLI from Neovim's integrated terminal (`:terminal`) so that the
  `$NVIM` environment variable is set.
- Alternatively, set `GEMINI_CLI_IDE_PID` to your Neovim process ID manually.

### Diff keymaps don't work

- Ensure your `<leader>` key is configured. The default is `\` (backslash).
- The keymaps are buffer-local and only active while a diff view is open.

## Terms of Service and Privacy Notice

By using this plugin, you agree to the
[Terms of Service](https://geminicli.com/docs/resources/tos-privacy/).
