# Gemini CLI configuration

Gemini CLI offers several ways to configure its behavior, including environment
variables, command-line arguments, and settings files. This document outlines
the different configuration methods and available options.

## Configuration hierarchy

Settings are loaded and merged in the following order (highest precedence
first):

1.  Command-line arguments (e.g., `--model gemini-pro`)
2.  Project settings (the `settings.json` file in the `.gemini/` directory of the
    current project)
3.  User settings (the `settings.json` file in the `~/.gemini/` directory)
4.  Environment variables (e.g., `GEMINI_MODEL=gemini-pro`)
5.  Default settings

## Environment variables

- `GEMINI_API_KEY`: Your Gemini API key.
- `GOOGLE_CLOUD_PROJECT`: The ID of your Google Cloud project (for Vertex AI).
- `GEMINI_MODEL`: The name of the Gemini model to use.
- `GEMINI_DEBUG`: Set to `true` to enable debug logging.

## Settings file (settings.json)

The `settings.json` file uses a nested JSON structure.

```json
{
  "general": {
    "vimMode": false,
    "defaultApprovalMode": "default"
  },
  "ui": {
    "theme": "default-dark",
    "compactMcpOutputs": true
  }
}
```

### Available settings

<!-- SETTINGS-AUTOGEN:START -->

#### `general` - General application settings.

- `general.preferredEditor`: The preferred editor to open files in.
- `general.vimMode` (default: `false`): Enable Vim keybindings
- `general.defaultApprovalMode` (default: `default`): The default approval mode for tool execution. 'default' prompts for approval, 'auto_edit' auto-approves edit tools, and 'plan' is read-only mode. 'yolo' is not supported yet.
- `general.devtools` (default: `false`): Enable DevTools inspector on launch.
- `general.enableAutoUpdate` (default: `true`): Enable automatic updates.
- `general.enableAutoUpdateNotification` (default: `true`): Enable update notification prompts.
- `general.enableNotifications` (default: `false`): Enable run-event notifications for action-required prompts and session completion. Currently macOS only.
- `general.checkpointing.enabled` (default: `false`): Enable session checkpointing for recovery
- `general.plan.directory`: The directory where planning artifacts are stored. If not specified, defaults to the system temporary directory.
- `general.plan.modelRouting` (default: `true`): Automatically switch between Pro and Flash models based on Plan Mode status. Uses Pro for the planning phase and Flash for the implementation phase.
- `general.retryFetchErrors` (default: `false`): Retry on "exception TypeError: fetch failed sending request" errors.
- `general.maxAttempts` (default: `10`): Maximum number of attempts for requests to the main chat model. Cannot exceed 10.
- `general.debugKeystrokeLogging` (default: `false`): Enable debug logging of keystrokes to the console.
- `general.sessionRetention.enabled` (default: `false`): Enable automatic session cleanup
- `general.sessionRetention.maxAge`: Automatically delete chats older than this time period (e.g., "30d", "7d", "24h", "1w")
- `general.sessionRetention.maxCount`: Alternative: Maximum number of sessions to keep (most recent)
- `general.sessionRetention.minRetention` (default: `1d`): Minimum retention period (safety limit, defaults to "1d")
- `general.sessionRetention.warningAcknowledged` (default: `false`): INTERNAL: Whether the user has acknowledged the session retention warning

#### `output` - Settings for the CLI output.

- `output.format` (default: `text`): The format of the CLI output. Can be `text` or `json`.

#### `ui` - User interface settings.

- `ui.theme`: The color theme for the UI. See the CLI themes guide for available options.
- `ui.autoThemeSwitching` (default: `true`): Automatically switch between default light and dark themes based on terminal background color.
- `ui.terminalBackgroundPollingInterval` (default: `60`): Interval in seconds to poll the terminal background color.
- `ui.customThemes` (default: `{}`): Custom theme definitions.
- `ui.hideWindowTitle` (default: `false`): Hide the window title bar
- `ui.inlineThinkingMode` (default: `off`): Display model thinking inline: off or full.
- `ui.showStatusInTitle` (default: `false`): Show Gemini CLI model thoughts in the terminal window title during the working phase
- `ui.dynamicWindowTitle` (default: `true`): Update the terminal window title with current status icons (Ready: ◇, Action Required: ✋, Working: ✦)
- `ui.showHomeDirectoryWarning` (default: `true`): Show a warning when running Gemini CLI in the home directory.
- `ui.showCompatibilityWarnings` (default: `true`): Show warnings about terminal or OS compatibility issues.
- `ui.hideTips` (default: `false`): Hide helpful tips in the UI
- `ui.showShortcutsHint` (default: `true`): Show the "? for shortcuts" hint above the input.
- `ui.showKeyboardShortcutsHint` (default: `true`): Show keyboard shortcut hints in the UI (e.g. "press Ctrl+O to expand").
- `ui.compactMcpOutputs` (default: `true`): Whether to show MCP tool outputs in a compact one-line summary by default.
- `ui.hideBanner` (default: `false`): Hide the application banner
- `ui.hideContextSummary` (default: `false`): Hide the context summary (GEMINI.md, MCP servers) above the input.
- `ui.footer.hideCWD` (default: `false`): Hide the current working directory path in the footer.
- `ui.footer.hideSandboxStatus` (default: `false`): Hide the sandbox status indicator in the footer.
- `ui.footer.hideModelInfo` (default: `false`): Hide the model name and context usage in the footer.
- `ui.footer.hideContextPercentage` (default: `true`): Hides the context window remaining percentage.
- `ui.hideFooter` (default: `false`): Hide the footer from the UI
- `ui.showMemoryUsage` (default: `false`): Display memory usage information in the UI
- `ui.showLineNumbers` (default: `true`): Show line numbers in the chat.
- `ui.showCitations` (default: `false`): Show citations for generated text in the chat.
- `ui.showModelInfoInChat` (default: `false`): Show the model name in the chat for each model turn.
- `ui.showUserIdentity` (default: `true`): Show the logged-in user's identity (e.g. email) in the UI.
- `ui.useAlternateBuffer` (default: `false`): Use an alternate screen buffer for the UI, preserving shell history.
- `ui.useBackgroundColor` (default: `true`): Whether to use background colors in the UI.
- `ui.incrementalRendering` (default: `true`): Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled.
- `ui.showSpinner` (default: `true`): Show the spinner during operations.
- `ui.loadingPhrases` (default: `tips`): What to show while the model is working: tips, witty comments, both, or nothing.
- `ui.errorVerbosity` (default: `low`): Controls whether recoverable errors are hidden (low) or fully shown (full).
- `ui.customWittyPhrases` (default: `[]`): Custom witty phrases to display during loading. When provided, the CLI cycles through these instead of the defaults.
- `ui.accessibility.enableLoadingPhrases` (default: `true`): @deprecated Use ui.loadingPhrases instead. Enable loading phrases during operations.
- `ui.accessibility.screenReader` (default: `false`): Render output in plain-text to be more screen reader accessible

#### `ide` - IDE integration settings.

- `ide.enabled` (default: `false`): Enable IDE integration mode.
- `ide.hasSeenNudge` (default: `false`): Whether the user has seen the IDE integration nudge.

#### `privacy` - Privacy-related settings.

- `privacy.usageStatisticsEnabled` (default: `true`): Enable collection of usage statistics

#### `telemetry` - Telemetry configuration.

#### `billing` - Billing and AI credits settings.

- `billing.overageStrategy` (default: `ask`): How to handle quota exhaustion when AI credits are available. 'ask' prompts each time, 'always' automatically uses credits, 'never' disables credit usage.

#### `model` - Settings related to the generative model.

- `model.name`: The Gemini model to use for conversations.
- `model.maxSessionTurns` (default: `-1`): Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.
- `model.summarizeToolOutput`: Enables or disables summarization of tool output. Configure per-tool token budgets (for example {"run_shell_command": {"tokenBudget": 2000}}). Currently only the run_shell_command tool supports summarization.
- `model.compressionThreshold` (default: `0.5`): The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3).
- `model.disableLoopDetection` (default: `false`): Disable automatic detection and prevention of infinite loops.
- `model.skipNextSpeakerCheck` (default: `true`): Skip the next speaker check.

#### `modelConfigs` - Model configurations.

- `modelConfigs.aliases` (default: `...`): Named presets for model configs. Can be used in place of a model name and can inherit from other aliases using an `extends` property.
- `modelConfigs.customAliases` (default: `{}`): Custom named presets for model configs. These are merged with (and override) the built-in aliases.
- `modelConfigs.customOverrides` (default: `[]`): Custom model config overrides. These are merged with (and added to) the built-in overrides.
- `modelConfigs.overrides` (default: `[]`): Apply specific configuration overrides based on matches, with a primary key of model (or alias). The most specific match will be used.

#### `agents` - Settings for subagents.

- `agents.overrides` (default: `{}`): Override settings for specific agents, e.g. to disable the agent, set a custom model config, or run config.
- `agents.browser.sessionMode` (default: `persistent`): Session mode: 'persistent', 'isolated', or 'existing'.
- `agents.browser.headless` (default: `false`): Run browser in headless mode.
- `agents.browser.profilePath`: Path to browser profile directory for session persistence.
- `agents.browser.visualModel`: Model override for the visual agent.

#### `context` - Settings for managing context provided to the model.

- `context.fileName`: The name of the context file or files to load into memory. Accepts either a single string or an array of strings.
- `context.importFormat`: The format to use when importing memory.
- `context.includeDirectoryTree` (default: `true`): Whether to include the directory tree of the current working directory in the initial request to the model.
- `context.discoveryMaxDirs` (default: `200`): Maximum number of directories to search for memory.
- `context.includeDirectories` (default: `[]`): Additional directories to include in the workspace context. Missing directories will be skipped with a warning.
- `context.loadMemoryFromIncludeDirectories` (default: `false`): Controls how /memory refresh loads GEMINI.md files. When true, include directories are scanned; when false, only the current directory is used.
- `context.fileFiltering.respectGitIgnore` (default: `true`): Respect .gitignore files when searching.
- `context.fileFiltering.respectGeminiIgnore` (default: `true`): Respect .geminiignore files when searching.
- `context.fileFiltering.enableRecursiveFileSearch` (default: `true`): Enable recursive file search functionality when completing @ references in the prompt.
- `context.fileFiltering.enableFuzzySearch` (default: `true`): Enable fuzzy search when searching for files.
- `context.fileFiltering.customIgnoreFilePaths` (default: `[]`): Additional ignore file paths to respect. These files take precedence over .geminiignore and .gitignore. Files earlier in the array take precedence over files later in the array, e.g. the first file takes precedence over the second one.

#### `tools` - Settings for built-in and custom tools.

- `tools.sandbox`: Sandbox execution environment. Set to a boolean to enable or disable the sandbox, or provide a string path to a sandbox profile.
- `tools.shell.enableInteractiveShell` (default: `true`): Use node-pty for an interactive shell experience. Fallback to child_process still applies.
- `tools.shell.pager` (default: `cat`): The pager command to use for shell output. Defaults to `cat`.
- `tools.shell.showColor` (default: `false`): Show color in shell output.
- `tools.shell.inactivityTimeout` (default: `300`): The maximum time in seconds allowed without output from the shell command. Defaults to 5 minutes.
- `tools.shell.enableShellOutputEfficiency` (default: `true`): Enable shell output efficiency optimizations for better performance.
- `tools.core`: Restrict the set of built-in tools with an allowlist. Match semantics mirror tools.allowed; see the built-in tools documentation for available names.
- `tools.allowed`: Tool names that bypass the confirmation dialog. Useful for trusted commands (for example ["run_shell_command(git)", "run_shell_command(npm test)"]). See shell tool command restrictions for matching details.
- `tools.exclude`: Tool names to exclude from discovery.
- `tools.discoveryCommand`: Command to run for tool discovery.
- `tools.callCommand`: Defines a custom shell command for invoking discovered tools. The command must take the tool name as the first argument, read JSON arguments from stdin, and emit JSON results on stdout.
- `tools.useRipgrep` (default: `true`): Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance.
- `tools.truncateToolOutputThreshold` (default: `40000`): Maximum characters to show when truncating large tool outputs. Set to 0 or negative to disable truncation.
- `tools.disableLLMCorrection` (default: `true`): Disable LLM-based error correction for edit tools. When enabled, tools will fail immediately if exact string matches are not found, instead of attempting to self-correct.

#### `mcp` - Settings for Model Context Protocol (MCP) servers.

- `mcp.serverCommand`: Command to start an MCP server.
- `mcp.allowed`: A list of MCP servers to allow.
- `mcp.excluded`: A list of MCP servers to exclude.

#### `useWriteTodos` (default: `true`): Enable the write_todos tool.

#### `security` - Security-related settings.

- `security.disableYoloMode` (default: `false`): Disable YOLO mode, even if enabled by a flag.
- `security.enablePermanentToolApproval` (default: `false`): Enable the "Allow for all future sessions" option in tool confirmation dialogs.
- `security.blockGitExtensions` (default: `false`): Blocks installing and loading extensions from Git.
- `security.allowedExtensions` (default: `[]`): List of Regex patterns for allowed extensions. If nonempty, only extensions that match the patterns in this list are allowed. Overrides the blockGitExtensions setting.
- `security.folderTrust.enabled` (default: `true`): Setting to track whether Folder trust is enabled.
- `security.environmentVariableRedaction.allowed` (default: `[]`): Environment variables to always allow (bypass redaction).
- `security.environmentVariableRedaction.blocked` (default: `[]`): Environment variables to always redact.
- `security.environmentVariableRedaction.enabled` (default: `false`): Enable redaction of environment variables that may contain secrets.
- `security.auth.useExternal`: Whether to use an external authentication flow.
- `security.enableConseca` (default: `false`): Enable the context-aware security checker. This feature uses an LLM to dynamically generate and enforce security policies for tool use based on your prompt, providing an additional layer of protection against unintended actions.

#### `advanced` - Advanced settings for power users.

- `advanced.autoConfigureMemory` (default: `false`): Automatically configure Node.js memory limits
- `advanced.dnsResolutionOrder`: The DNS resolution order.
- `advanced.excludedEnvVars` (default: `["DEBUG","DEBUG_MODE"]`): Environment variables to exclude from project context.
- `advanced.bugCommand`: Configuration for the bug report command.

#### `experimental` - Setting to enable experimental features

- `experimental.toolOutputMasking.enabled` (default: `true`): Enables tool output masking to save tokens.
- `experimental.toolOutputMasking.toolProtectionThreshold` (default: `50000`): Minimum number of tokens to protect from masking (most recent tool outputs).
- `experimental.toolOutputMasking.minPrunableTokensThreshold` (default: `30000`): Minimum prunable tokens required to trigger a masking pass.
- `experimental.toolOutputMasking.protectLatestTurn` (default: `true`): Ensures the absolute latest turn is never masked, regardless of token count.
- `experimental.enableAgents` (default: `false`): Enable local and remote subagents. Warning: Experimental feature, uses YOLO mode for subagents
- `experimental.extensionManagement` (default: `true`): Enable extension management features.
- `experimental.extensionConfig` (default: `true`): Enable requesting and fetching of extension settings.
- `experimental.extensionRegistry` (default: `false`): Enable extension registry explore UI.
- `experimental.extensionReloading` (default: `false`): Enables extension loading/unloading within the CLI session.
- `experimental.jitContext` (default: `false`): Enable Just-In-Time (JIT) context loading.
- `experimental.useOSC52Paste` (default: `false`): Use OSC 52 for pasting. This may be more robust than the default system when using remote terminal sessions (if your terminal is configured to allow it).
- `experimental.useOSC52Copy` (default: `false`): Use OSC 52 for copying. This may be more robust than the default system when using remote terminal sessions (if your terminal is configured to allow it).
- `experimental.plan` (default: `false`): Enable planning features (Plan Mode and tools).
- `experimental.modelSteering` (default: `false`): Enable model steering (user hints) to guide the model during tool execution.
- `experimental.directWebFetch` (default: `false`): Enable web fetch behavior that bypasses LLM summarization.
- `experimental.gemmaModelRouter.enabled` (default: `false`): Enable the Gemma Model Router. Requires a local endpoint serving Gemma via the Gemini API using LiteRT-LM shim.
- `experimental.gemmaModelRouter.classifier.host` (default: `http://localhost:9379`): The host of the classifier.
- `experimental.gemmaModelRouter.classifier.model` (default: `gemma3-1b-gpu-custom`): The model to use for the classifier. Only tested on `gemma3-1b-gpu-custom`.

#### `extensions` - Settings for extensions.

- `extensions.disabled` (default: `[]`): List of disabled extensions.
- `extensions.workspacesWithMigrationNudge` (default: `[]`): List of workspaces for which the migration nudge has been shown.

#### `skills` - Settings for agent skills.

- `skills.enabled` (default: `true`): Enable Agent Skills.
- `skills.disabled` (default: `[]`): List of disabled skills.

#### `hooksConfig` - Hook configurations for intercepting and customizing agent behavior.

- `hooksConfig.enabled` (default: `true`): Canonical toggle for the hooks system. When disabled, no hooks will be executed.
- `hooksConfig.disabled` (default: `[]`): List of hook names (commands) that should be disabled. Hooks in this list will not execute even if configured.
- `hooksConfig.notifications` (default: `true`): Show visual indicators when hooks are executing.

#### `hooks` - Event-specific hook configurations.

- `hooks.BeforeTool` (default: `[]`): Hooks that execute before tool execution. Can intercept, validate, or modify tool calls.
- `hooks.AfterTool` (default: `[]`): Hooks that execute after tool execution. Can process results, log outputs, or trigger follow-up actions.
- `hooks.BeforeAgent` (default: `[]`): Hooks that execute before agent loop starts. Can set up context or initialize resources.
- `hooks.AfterAgent` (default: `[]`): Hooks that execute after agent loop completes. Can perform cleanup or summarize results.
- `hooks.Notification` (default: `[]`): Hooks that execute on notification events (errors, warnings, info). Can log or alert on specific conditions.
- `hooks.SessionStart` (default: `[]`): Hooks that execute when a session starts. Can initialize session-specific resources or state.
- `hooks.SessionEnd` (default: `[]`): Hooks that execute when a session ends. Can perform cleanup or persist session data.
- `hooks.PreCompress` (default: `[]`): Hooks that execute before chat history compression. Can back up or analyze conversation before compression.
- `hooks.BeforeModel` (default: `[]`): Hooks that execute before LLM requests. Can modify prompts, inject context, or control model parameters.
- `hooks.AfterModel` (default: `[]`): Hooks that execute after LLM responses. Can process outputs, extract information, or log interactions.
- `hooks.BeforeToolSelection` (default: `[]`): Hooks that execute before tool selection. Can filter or prioritize available tools dynamically.

<!-- SETTINGS-AUTOGEN:END -->

## Privacy

Gemini CLI collects usage statistics to help improve the tool. You can opt out
of usage statistics collection at any time by setting the
`usageStatisticsEnabled` property to `false` under the `privacy` category in
your `settings.json` file:

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```
