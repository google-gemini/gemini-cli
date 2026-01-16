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

| UI Label                        | Setting                            | Description                                                   | Default |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------- | ------- |
| Preview Features (e.g., models) | `general.previewFeatures`          | Enable preview features (e.g., preview models).               | `false` |
| Vim Mode                        | `general.vimMode`                  | Enable Vim keybindings                                        | `false` |
| Disable Auto Update             | `general.disableAutoUpdate`        | Disable automatic updates                                     | `false` |
| Enable Prompt Completion        | `general.enablePromptCompletion`   | Enable AI-powered prompt completion suggestions while typing. | `false` |
| Debug Keystroke Logging         | `general.debugKeystrokeLogging`    | Enable debug logging of keystrokes to the console.            | `false` |
| Enable Session Cleanup          | `general.sessionRetention.enabled` | Enable automatic session cleanup                              | `false` |

### Output

| UI Label      | Setting         | Description                                            | Default  |
| ------------- | --------------- | ------------------------------------------------------ | -------- |
| Output Format | `output.format` | The format of the CLI output. Can be `text` or `json`. | `"text"` |

### UI

| UI Label                       | Setting                                  | Description                                                                                                                                                       | Default |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Hide Window Title              | `ui.hideWindowTitle`                     | Hide the window title bar                                                                                                                                         | `false` |
| Show Thoughts in Title         | `ui.showStatusInTitle`                   | Show Gemini CLI model thoughts in the terminal window title during the working phase                                                                              | `false` |
| Dynamic Window Title           | `ui.dynamicWindowTitle`                  | Update the terminal window title with current status icons (Ready: ◇, Action Required: ✋, Working: ✦)                                                            | `true`  |
| Show Home Directory Warning    | `ui.showHomeDirectoryWarning`            | Show a warning when running Gemini CLI in the home directory.                                                                                                     | `true`  |
| Hide Tips                      | `ui.hideTips`                            | Hide helpful tips in the UI                                                                                                                                       | `false` |
| Hide Banner                    | `ui.hideBanner`                          | Hide the application banner                                                                                                                                       | `false` |
| Hide Context Summary           | `ui.hideContextSummary`                  | Hide the context summary (GEMINI.md, MCP servers) above the input.                                                                                                | `false` |
| Hide CWD                       | `ui.footer.hideCWD`                      | Hide the current working directory path in the footer.                                                                                                            | `false` |
| Hide Sandbox Status            | `ui.footer.hideSandboxStatus`            | Hide the sandbox status indicator in the footer.                                                                                                                  | `false` |
| Hide Model Info                | `ui.footer.hideModelInfo`                | Hide the model name and context usage in the footer.                                                                                                              | `false` |
| Hide Context Window Percentage | `ui.footer.hideContextPercentage`        | Hides the context window remaining percentage.                                                                                                                    | `true`  |
| Hide Footer                    | `ui.hideFooter`                          | Hide the footer from the UI                                                                                                                                       | `false` |
| Show Memory Usage              | `ui.showMemoryUsage`                     | Display memory usage information in the UI                                                                                                                        | `false` |
| Show Line Numbers              | `ui.showLineNumbers`                     | Show line numbers in the chat.                                                                                                                                    | `true`  |
| Show Citations                 | `ui.showCitations`                       | Show citations for generated text in the chat.                                                                                                                    | `false` |
| Show Model Info In Chat        | `ui.showModelInfoInChat`                 | Show the model name in the chat for each model turn.                                                                                                              | `false` |
| Use Full Width                 | `ui.useFullWidth`                        | Use the entire width of the terminal for output.                                                                                                                  | `true`  |
| Use Alternate Screen Buffer    | `ui.useAlternateBuffer`                  | Use an alternate screen buffer for the UI, preserving shell history.                                                                                              | `false` |
| Incremental Rendering          | `ui.incrementalRendering`                | Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled. | `true`  |
| Disable Loading Phrases        | `ui.accessibility.disableLoadingPhrases` | Disable loading phrases for accessibility                                                                                                                         | `false` |
| Screen Reader Mode             | `ui.accessibility.screenReader`          | Render output in plain-text to be more screen reader accessible                                                                                                   | `false` |

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

| UI Label                             | Setting                                           | Description                                                                                                                                     | Default |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Memory Discovery Max Dirs            | `context.discoveryMaxDirs`                        | Maximum number of directories to search for memory.                                                                                             | `200`   |
| Load Memory From Include Directories | `context.loadMemoryFromIncludeDirectories`        | Controls how /memory refresh loads GEMINI.md files. When true, include directories are scanned; when false, only the current directory is used. | `false` |
| Respect .gitignore                   | `context.fileFiltering.respectGitIgnore`          | Respect .gitignore files when searching.                                                                                                        | `true`  |
| Respect .geminiignore                | `context.fileFiltering.respectGeminiIgnore`       | Respect .geminiignore files when searching.                                                                                                     | `true`  |
| Enable Recursive File Search         | `context.fileFiltering.enableRecursiveFileSearch` | Enable recursive file search functionality when completing @ references in the prompt.                                                          | `true`  |
| Disable Fuzzy Search                 | `context.fileFiltering.disableFuzzySearch`        | Disable fuzzy search when searching for files.                                                                                                  | `false` |

### Tools

| UI Label                         | Setting                              | Description                                                                                                                                                                | Default   |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Enable Interactive Shell         | `tools.shell.enableInteractiveShell` | Use node-pty for an interactive shell experience. Fallback to child_process still applies.                                                                                 | `true`    |
| Show Color                       | `tools.shell.showColor`              | Show color in shell output.                                                                                                                                                | `false`   |
| Auto Accept                      | `tools.autoAccept`                   | Automatically accept and execute tool calls that are considered safe (e.g., read-only operations).                                                                         | `false`   |
| Use Ripgrep                      | `tools.useRipgrep`                   | Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance.                                                            | `true`    |
| Enable Tool Output Truncation    | `tools.enableToolOutputTruncation`   | Enable truncation of large tool outputs.                                                                                                                                   | `true`    |
| Tool Output Truncation Threshold | `tools.truncateToolOutputThreshold`  | Truncate tool output if it is larger than this many characters. Set to -1 to disable.                                                                                      | `4000000` |
| Tool Output Truncation Lines     | `tools.truncateToolOutputLines`      | The number of lines to keep when truncating tool output.                                                                                                                   | `1000`    |
| Disable LLM Correction           | `tools.disableLLMCorrection`         | Disable LLM-based error correction for edit tools. When enabled, tools will fail immediately if exact string matches are not found, instead of attempting to self-correct. | `false`   |

### Security

| UI Label                              | Setting                                         | Description                                                                     | Default |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- | ------- |
| Disable YOLO Mode                     | `security.disableYoloMode`                      | Disable YOLO mode, even if enabled by a flag.                                   | `false` |
| Allow Permanent Tool Approval         | `security.enablePermanentToolApproval`          | Enable the "Allow for all future sessions" option in tool confirmation dialogs. | `false` |
| Blocks extensions from Git            | `security.blockGitExtensions`                   | Blocks installing and loading extensions from Git.                              | `false` |
| Folder Trust                          | `security.folderTrust.enabled`                  | Setting to track whether Folder trust is enabled.                               | `false` |
| Enable Environment Variable Redaction | `security.environmentVariableRedaction.enabled` | Enable redaction of environment variables that may contain secrets.             | `false` |

### Experimental

| UI Label                            | Setting                                                 | Description                                                                         | Default |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| Agent Skills                        | `experimental.skills`                                   | Enable Agent Skills (experimental).                                                 | `false` |
| Enable Codebase Investigator        | `experimental.codebaseInvestigatorSettings.enabled`     | Enable the Codebase Investigator agent.                                             | `true`  |
| Codebase Investigator Max Num Turns | `experimental.codebaseInvestigatorSettings.maxNumTurns` | Maximum number of turns for the Codebase Investigator agent.                        | `10`    |
| Use OSC 52 Paste                    | `experimental.useOSC52Paste`                            | Use OSC 52 sequence for pasting instead of clipboardy (useful for remote sessions). | `false` |
| Enable CLI Help Agent               | `experimental.cliHelpAgentSettings.enabled`             | Enable the CLI Help Agent.                                                          | `true`  |
| Plan                                | `experimental.plan`                                     | Enable planning features (Plan Mode and tools).                                     | `false` |

### Hooks

| UI Label           | Setting               | Description                                      | Default |
| ------------------ | --------------------- | ------------------------------------------------ | ------- |
| Hook Notifications | `hooks.notifications` | Show visual indicators when hooks are executing. | `true`  |

<!-- SETTINGS-AUTOGEN:END -->
