# Gemini CLI settings (`/settings` command)

Control your Gemini CLI experience with the `/settings` command. The `/settings`
command opens a dialog to view and edit all your Gemini CLI settings, including
your UI experience, keybindings, and accessibility features.

Your Gemini CLI settings are stored in a `settings.json` file. In addition to
using the `/settings` command, you can also edit them in one of the following
locations:

- **User settings**: `~/.gemini/settings.json`
- **Workspace settings**: `your-project/.gemini/settings.json`

Note: Workspace settings override user settings.

## Settings reference

Here is a list of all the available settings, grouped by category and ordered as
they appear in the UI.

<!-- SETTINGS-AUTOGEN:START -->

### General

| UI Label                        | Setting                            | Description                                              | Default |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------- | ------- |
| Preview Features (e.g., models) | `general.previewFeatures`          | Access early-access features and experimental models.    | `false` |
| Vim Mode                        | `general.vimMode`                  | Use Vim-style keybindings for text input.                | `false` |
| Auto Update                     | `general.autoUpdate`               | Automatically check for and install application updates. | `true`  |
| Prompt Completion               | `general.promptCompletion`         | Show AI-powered completion suggestions while typing.     | `false` |
| Debug Keystroke Logging         | `general.debugKeystrokeLogging`    | Enable debug logging of keystrokes to the console.       | `false` |
| Session Cleanup                 | `general.sessionRetention.enabled` | Automatically delete old or excess sessions.             | `false` |

### Output

| UI Label      | Setting         | Description                                            | Default  |
| ------------- | --------------- | ------------------------------------------------------ | -------- |
| Output Format | `output.format` | The format of the CLI output. Can be `text` or `json`. | `"text"` |

### UI

| UI Label                       | Setting                           | Description                                                                                                                                                       | Default |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Hide Window Title              | `ui.hideWindowTitle`              | Hide the window title bar.                                                                                                                                        | `false` |
| Show Status in Title           | `ui.showStatusInTitle`            | Show Gemini CLI status and thoughts in the terminal window title.                                                                                                 | `false` |
| Show Home Directory Warning    | `ui.showHomeDirectoryWarning`     | Show a warning when running Gemini CLI in the home directory.                                                                                                     | `true`  |
| Hide Tips                      | `ui.hideTips`                     | Hide helpful usage tips in the UI.                                                                                                                                | `false` |
| Hide Banner                    | `ui.hideBanner`                   | Hide the application startup banner.                                                                                                                              | `false` |
| Hide Context Summary           | `ui.hideContextSummary`           | Hide the context summary (GEMINI.md, MCP servers) above the input.                                                                                                | `false` |
| Hide CWD                       | `ui.footer.hideCWD`               | Hide the current working directory path in the footer.                                                                                                            | `false` |
| Hide Sandbox Status            | `ui.footer.hideSandboxStatus`     | Hide the sandbox status indicator in the footer.                                                                                                                  | `false` |
| Hide Model Info                | `ui.footer.hideModelInfo`         | Hide the model name and context usage in the footer.                                                                                                              | `false` |
| Hide Context Window Percentage | `ui.footer.hideContextPercentage` | Hides the context window remaining percentage.                                                                                                                    | `true`  |
| Hide Footer                    | `ui.hideFooter`                   | Hide the footer from the UI.                                                                                                                                      | `false` |
| Show Memory Usage              | `ui.showMemoryUsage`              | Display memory usage information in the UI.                                                                                                                       | `false` |
| Show Line Numbers              | `ui.showLineNumbers`              | Show line numbers in the chat window.                                                                                                                             | `true`  |
| Show Citations                 | `ui.showCitations`                | Show citations for generated text in the chat.                                                                                                                    | `false` |
| Show Model Info In Chat        | `ui.showModelInfoInChat`          | Show the model name in the chat for each model turn.                                                                                                              | `false` |
| Use Full Width                 | `ui.useFullWidth`                 | Use the entire width of the terminal for output.                                                                                                                  | `true`  |
| Use Alternate Screen Buffer    | `ui.useAlternateBuffer`           | Use an alternate screen buffer for the UI, preserving shell history.                                                                                              | `false` |
| Incremental Rendering          | `ui.incrementalRendering`         | Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled. | `true`  |
| Loading Phrases                | `ui.accessibility.loadingPhrases` | Display witty phrases while waiting for operations to complete.                                                                                                   | `true`  |
| Screen Reader Mode             | `ui.accessibility.screenReader`   | Render output in plain-text for better screen reader accessibility.                                                                                               | `false` |

### IDE

| UI Label | Setting       | Description                  | Default |
| -------- | ------------- | ---------------------------- | ------- |
| IDE Mode | `ide.enabled` | Enable IDE integration mode. | `false` |

### Model

| UI Label                | Setting                      | Description                                                                            | Default |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------- | ------- |
| Max Session Turns       | `model.maxSessionTurns`      | Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.      | `-1`    |
| Compression Threshold   | `model.compressionThreshold` | The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3). | `0.5`   |
| Skip Next Speaker Check | `model.skipNextSpeakerCheck` | Skip the next speaker check.                                                           | `true`  |

### Context

| UI Label                             | Setting                                     | Description                                                                                                                                     | Default |
| ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Memory Discovery Max Dirs            | `context.discoveryMaxDirs`                  | Maximum number of directories to search for memory.                                                                                             | `200`   |
| Load Memory From Include Directories | `context.loadMemoryFromIncludeDirectories`  | Controls how /memory refresh loads GEMINI.md files. When true, include directories are scanned; when false, only the current directory is used. | `false` |
| Respect .gitignore                   | `context.fileFiltering.respectGitIgnore`    | Respect .gitignore files when searching.                                                                                                        | `true`  |
| Respect .geminiignore                | `context.fileFiltering.respectGeminiIgnore` | Respect .geminiignore files when searching.                                                                                                     | `true`  |
| Recursive File Search                | `context.fileFiltering.recursiveFileSearch` | Enable recursive file search functionality when completing @ references in the prompt.                                                          | `true`  |
| Fuzzy Search                         | `context.fileFiltering.fuzzySearch`         | Enable fuzzy search when searching for files.                                                                                                   | `true`  |

### Tools

| UI Label                         | Setting                             | Description                                                                                        | Default   |
| -------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| Interactive Shell                | `tools.shell.interactiveShell`      | Provide an interactive terminal for executing shell commands.                                      | `true`    |
| Show Color                       | `tools.shell.showColor`             | Show color in shell output.                                                                        | `false`   |
| Auto Accept                      | `tools.autoAccept`                  | Automatically accept and execute tool calls that are considered safe (e.g., read-only operations). | `false`   |
| Use Ripgrep                      | `tools.useRipgrep`                  | Use the ripgrep tool for significantly faster file content searching.                              | `true`    |
| Tool Output Truncation           | `tools.toolOutputTruncation`        | Truncate excessively large tool outputs to conserve context.                                       | `true`    |
| Tool Output Truncation Threshold | `tools.truncateToolOutputThreshold` | Truncate tool output if it is larger than this many characters. Set to -1 to disable.              | `4000000` |
| Tool Output Truncation Lines     | `tools.truncateToolOutputLines`     | The number of lines to keep when truncating tool output.                                           | `1000`    |

### Security

| UI Label                       | Setting                                         | Description                                                            | Default |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| Disable YOLO Mode              | `security.disableYoloMode`                      | Disable YOLO mode, even if enabled by a flag.                          | `false` |
| Permanent Tool Approval        | `security.permanentToolApproval`                | Allow remembering tool approvals across different CLI sessions.        | `false` |
| Blocks extensions from Git     | `security.blockGitExtensions`                   | Blocks installing and loading extensions from Git.                     | `false` |
| Folder Trust                   | `security.folderTrust.enabled`                  | Require explicit trust before allowing high-risk tools in a directory. | `false` |
| Environment Variable Redaction | `security.environmentVariableRedaction.enabled` | Automatically mask environment variables that may contain secrets.     | `false` |

### Experimental

| UI Label                            | Setting                                                 | Description                                                                         | Default |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| Agent Skills                        | `experimental.skills`                                   | Enable Agent Skills (experimental).                                                 | `false` |
| Codebase Investigator               | `experimental.codebaseInvestigatorSettings.enabled`     | Allow specialized codebase analysis agent.                                          | `true`  |
| Codebase Investigator Max Num Turns | `experimental.codebaseInvestigatorSettings.maxNumTurns` | Maximum number of turns for the Codebase Investigator agent.                        | `10`    |
| Use OSC 52 Paste                    | `experimental.useOSC52Paste`                            | Use OSC 52 sequence for pasting instead of clipboardy (useful for remote sessions). | `false` |
| CLI Help Agent                      | `experimental.cliHelpAgentSettings.enabled`             | Allow specialized help and guidance agent.                                          | `true`  |

### Hooks

| UI Label           | Setting               | Description                                      | Default |
| ------------------ | --------------------- | ------------------------------------------------ | ------- |
| Hook Notifications | `hooks.notifications` | Show visual indicators when hooks are executing. | `true`  |

<!-- SETTINGS-AUTOGEN:END -->
