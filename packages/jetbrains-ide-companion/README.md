# Gemini CLI Companion for JetBrains IDEs

The Gemini CLI Companion plugin for JetBrains IDEs pairs with
[Gemini CLI](https://github.com/google-gemini/gemini-cli) to provide IDE
integration features across the JetBrains platform.

## Supported IDEs

- IntelliJ IDEA
- WebStorm
- PyCharm
- GoLand
- Android Studio
- CLion
- RustRover
- DataGrip
- PhpStorm

## Features

- **Open Editor File Context:** Gemini CLI gains awareness of the files you have
  open in your editor, providing richer understanding of your project's
  structure and content.

- **Selection Context:** Gemini CLI can access your cursor position and selected
  text, giving it valuable context from your current work.

- **Native Diffing:** View proposed code changes in the IDE's native diff
  viewer. Accept or reject changes directly from the editor.

- **Automatic Discovery:** The plugin starts an MCP server and writes a
  discovery file so Gemini CLI can find and connect automatically.

## Requirements

- A JetBrains IDE (2024.1 or newer recommended)
- Gemini CLI (installed separately) running within the IDE's integrated terminal

## Installation

### Option 1: Automatic nudge (recommended)

When you run Gemini CLI inside a JetBrains IDE terminal, it will automatically
detect your environment and prompt you to install the companion plugin.

### Option 2: From the CLI

Run the following command inside Gemini CLI:

```
/ide install
```

### Option 3: Manual installation from the marketplace

1. Open your JetBrains IDE
2. Go to **Settings > Plugins > Marketplace**
3. Search for "Gemini CLI Companion"
4. Click **Install** and restart the IDE

After manual installation, run `/ide enable` in the CLI to activate the
integration.

## Usage

### Enabling and disabling

From within Gemini CLI:

- `/ide enable` -- Enable IDE integration
- `/ide disable` -- Disable IDE integration
- `/ide status` -- Check connection status

### Working with diffs

When Gemini suggests code modifications, a diff view opens in the IDE showing
the original file alongside the proposed changes. You can:

- **Accept** the changes using the IDE's diff toolbar actions
- **Reject** the changes by closing the diff view
- **Modify** the proposed changes before accepting

## Architecture

The plugin is built with Kotlin and uses the IntelliJ Platform SDK:

```
src/main/kotlin/com/google/geminicli/jetbrains/
  GeminiCliPlugin.kt          -- Main plugin entry point
  context/                     -- Context tracking (open files, cursor)
  discovery/                   -- Discovery file management
  diff/                        -- Diff view management
  server/                      -- MCP server implementation
```

For the full protocol specification, see the
[IDE Companion Spec](../../docs/ide-integration/ide-companion-spec.md).

## Troubleshooting

### CLI doesn't detect JetBrains IDE

- Run Gemini CLI from the IDE's integrated terminal. JetBrains IDEs set the
  `TERMINAL_EMULATOR` environment variable which the CLI uses for detection.
- If running in an external terminal, set `GEMINI_CLI_IDE_PID` to the IDE's
  process ID.

### Plugin installation fails

- Ensure you have an active internet connection for marketplace installs.
- Try manual installation: download the plugin `.zip` from the marketplace and
  install via **Settings > Plugins > Install Plugin from Disk**.

### Connection lost after IDE restart

- The companion server restarts with the IDE. Run `/ide enable` in the CLI to
  reconnect, or restart the CLI.

## Terms of Service and Privacy Notice

By using this plugin, you agree to the
[Terms of Service](https://geminicli.com/docs/resources/tos-privacy/).
