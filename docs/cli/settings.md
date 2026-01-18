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

| UI Label                 | Setting                           | Description                                                                                                                                                       | Default |
| ------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Window Title             | `ui.windowTitle`                  | Show the window title bar.                                                                                                                                        | `true`  |
| Window Title Status      | `ui.windowTitleStatus`            | Show Gemini CLI status and thoughts in the terminal window title.                                                                                                 | `false` |
| Home Directory Warning   | `ui.homeDirectoryWarning`         | Show a warning when running Gemini CLI in the home directory.                                                                                                     | `true`  |
| Usage Tips               | `ui.usageTips`                    | Show helpful usage tips in the UI.                                                                                                                                | `true`  |
| Application Banner       | `ui.applicationBanner`            | Show the application startup banner.                                                                                                                              | `true`  |
| Context Summary          | `ui.contextSummary`               | Show the context summary (GEMINI.md, MCP servers) above the input.                                                                                                | `true`  |
| Working Directory        | `ui.footer.workingDirectory`      | Show the current working directory path in the footer.                                                                                                            | `true`  |
| Sandbox Status           | `ui.footer.sandboxStatus`         | Show the sandbox status indicator in the footer.                                                                                                                  | `true`  |
| Model Information        | `ui.footer.modelInfo`             | Show the model name and context usage in the footer.                                                                                                              | `true`  |
| Context Usage Percentage | `ui.footer.contextPercentage`     | Show the context window remaining percentage.                                                                                                                     | `false` |
| Footer                   | `ui.footerEnabled`                | Show the footer in the UI.                                                                                                                                        | `true`  |
| Memory Usage             | `ui.showMemoryUsage`              | Display memory usage information in the UI.                                                                                                                       | `false` |
| Line Numbers             | `ui.showLineNumbers`              | Show line numbers in the chat window.                                                                                                                             | `true`  |
| Citation Display         | `ui.showCitations`                | Show citations for generated text in the chat.                                                                                                                    | `false` |
| Chat Model Info          | `ui.showModelInfoInChat`          | Show the model name in the chat for each model turn.                                                                                                              | `false` |
| Full Width Output        | `ui.useFullWidth`                 | Use the entire width of the terminal for output.                                                                                                                  | `true`  |
| Alternate Screen Buffer  | `ui.useAlternateBuffer`           | Use an alternate screen buffer for the UI, preserving shell history.                                                                                              | `false` |
| Incremental Rendering    | `ui.incrementalRendering`         | Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled. | `true`  |
| Loading Phrases          | `ui.accessibility.loadingPhrases` | Display witty phrases while waiting for operations to complete.                                                                                                   | `true`  |
| Screen Reader Mode       | `ui.accessibility.screenReader`   | Render output in plain-text for better screen reader accessibility.                                                                                               | `false` |

### IDE

| UI Label | Setting       | Description                  | Default |
| -------- | ------------- | ---------------------------- | ------- |
| IDE Mode | `ide.enabled` | Enable IDE integration mode. | `false` |

### Model

| UI Label              | Setting                      | Description                                                                                                                      | Default |
| --------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Max Session Turns     | `model.maxSessionTurns`      | Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.                                                | `-1`    |
| Compression Threshold | `model.compressionThreshold` | The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3).                                           | `0.5`   |
| Next Speaker Check    | `model.skipNextSpeakerCheck` | When enabled, the model skips the check that requires alternating speakers in chat history. Default: Enabled (Check is skipped). | `true`  |

### Context

| UI Label                  | Setting                                     | Description                                                                            | Default |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| Memory Discovery Max Dirs | `context.discoveryMaxDirs`                  | Maximum number of directories to search for memory.                                    | `200`   |
| Directory Memory Scan     | `context.includeDirectoryMemory`            | Scan include directories for GEMINI.md files during memory refresh.                    | `false` |
| .gitignore Rules          | `context.fileFiltering.respectGitIgnore`    | Respect .gitignore files when searching.                                               | `true`  |
| .geminiignore Rules       | `context.fileFiltering.respectGeminiIgnore` | Respect .geminiignore files when searching.                                            | `true`  |
| Recursive File Search     | `context.fileFiltering.recursiveFileSearch` | Enable recursive file search functionality when completing @ references in the prompt. | `true`  |
| Fuzzy Search              | `context.fileFiltering.fuzzySearch`         | Enable fuzzy search when searching for files.                                          | `true`  |

### Tools

| UI Label                         | Setting                             | Description                                                                                        | Default   |
| -------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| Interactive Shell                | `tools.shell.interactiveShell`      | Provide an interactive terminal for executing shell commands.                                      | `true`    |
| Show Color                       | `tools.shell.showColor`             | Show color in shell output.                                                                        | `false`   |
| Auto Accept                      | `tools.autoAccept`                  | Automatically accept and execute tool calls that are considered safe (e.g., read-only operations). | `false`   |
| Ripgrep Integration              | `tools.useRipgrep`                  | Use the ripgrep tool for significantly faster file content searching.                              | `true`    |
| Tool Output Truncation           | `tools.toolOutputTruncation`        | Truncate excessively large tool outputs to conserve context.                                       | `true`    |
| Tool Output Truncation Threshold | `tools.truncateToolOutputThreshold` | Truncate tool output if it is larger than this many characters. Set to -1 to disable.              | `4000000` |
| Tool Output Truncation Lines     | `tools.truncateToolOutputLines`     | The number of lines to keep when truncating tool output.                                           | `1000`    |

### Security

| UI Label                       | Setting                                         | Description                                                            | Default |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| YOLO Mode                      | `security.yoloMode`                             | Allow the use of YOLO mode for automatic tool approval.                | `true`  |
| Permanent Tool Approval        | `security.permanentToolApproval`                | Allow remembering tool approvals across different CLI sessions.        | `false` |
| Git Extension Blocking         | `security.blockGitExtensions`                   | Blocks installing and loading extensions from Git.                     | `false` |
| Folder Trust                   | `security.folderTrust.enabled`                  | Require explicit trust before allowing high-risk tools in a directory. | `false` |
| Environment Variable Redaction | `security.environmentVariableRedaction.enabled` | Automatically mask environment variables that may contain secrets.     | `false` |

### Experimental

| UI Label                            | Setting                                                 | Description                                                                         | Default |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| Agent Skills                        | `experimental.skills`                                   | Enable Agent Skills (experimental).                                                 | `false` |
| Codebase Investigator               | `experimental.codebaseInvestigatorSettings.enabled`     | Allow specialized codebase analysis agent.                                          | `true`  |
| Codebase Investigator Max Num Turns | `experimental.codebaseInvestigatorSettings.maxNumTurns` | Maximum number of turns for the Codebase Investigator agent.                        | `10`    |
| OSC 52 Paste                        | `experimental.useOSC52Paste`                            | Use OSC 52 sequence for pasting instead of clipboardy (useful for remote sessions). | `false` |
| CLI Help Agent                      | `experimental.cliHelpAgentSettings.enabled`             | Allow specialized help and guidance agent.                                          | `true`  |

### Hooks

| UI Label           | Setting               | Description                                      | Default |
| ------------------ | --------------------- | ------------------------------------------------ | ------- |
| Hook Notifications | `hooks.notifications` | Show visual indicators when hooks are executing. | `true`  |

<!-- SETTINGS-AUTOGEN:END -->
