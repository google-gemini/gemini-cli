/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'en' | 'zh';

export interface Translations {
  [key: string]: string;
}

const en: Translations = {
  'command.help.description': 'For help on gemini-cli',
  'command.model.description': 'Opens a dialog to configure the model',
  'command.clear.description': 'Clear the screen and conversation history',
  'command.quit.description': 'Exit the cli',
  'command.resume.description': 'Browse and resume auto-saved conversations',
  'command.settings.description': 'View and edit Gemini CLI settings',
  'command.setup-github.description': 'Set up GitHub Actions',
  'command.theme.description': 'Change the theme',
  'command.copy.description':
    'Copy the last result or code snippet to clipboard',
  'command.docs.description':
    'Open full Gemini CLI documentation in your browser',
  'command.bug.description': 'Submit a bug report',
  'command.vim.description': 'Toggle vim mode on/off',
  'command.compress.description':
    'Compresses the context by replacing it with a summary',
  'command.chat.description': 'Manage conversation history',
  'command.chat.list.description': 'List saved conversation checkpoints',
  'command.chat.save.description':
    'Save the current conversation as a checkpoint. Usage: /chat save <tag>',
  'command.chat.resume.description':
    'Resume a conversation from a checkpoint. Usage: /chat resume <tag>',
  'command.chat.delete.description':
    'Delete a conversation checkpoint. Usage: /chat delete <tag>',
  'command.chat.share.description':
    'Share the current conversation to a markdown or json file. Usage: /chat share <file>',
  'command.language.description': 'Change the display language',
  'command.language.prompt': 'Select your preferred language:',
  'command.language.success': 'Language changed to {lang}.',
  'command.about.description': 'Show version info',
  'command.agents.description': 'Manage agents',
  'command.agents.list.description': 'List available local and remote agents',
  'command.agents.refresh.description': 'Reload the agent registry',
  'command.agents.enable.description': 'Enable a disabled agent',
  'command.agents.disable.description': 'Disable an enabled agent',
  'command.agents.config.description': 'Configure an agent',
  'command.auth.description': 'Manage authentication',
  'command.auth.login.description': 'Login or change the auth method',
  'command.auth.logout.description': 'Log out and clear all cached credentials',
  'command.directory.description': 'Manage workspace directories',
  'command.directory.add.description':
    'Add directories to the workspace. Use comma to separate multiple paths',
  'command.directory.show.description': 'Show all directories in the workspace',
  'command.editor.description': 'Set external editor preference',
  'command.extensions.description': 'Manage extensions',
  'command.extensions.list.description': 'List active extensions',
  'command.extensions.update.description':
    'Update extensions. Usage: update <extension-names>|--all',
  'command.extensions.explore.description':
    'Open extensions page in your browser',
  'command.extensions.restart.description': 'Restart all extensions',
  'command.extensions.disable.description': 'Disable an extension',
  'command.extensions.enable.description': 'Enable an extension',
  'command.extensions.install.description':
    'Install an extension from a git repo or local path',
  'command.extensions.link.description': 'Link an extension from a local path',
  'command.extensions.uninstall.description': 'Uninstall an extension',
  'command.extensions.config.description': 'Configure extension settings',
  'command.hooks.description': 'Manage hooks',
  'command.hooks.panel.description':
    'Display all registered hooks with their status',
  'command.hooks.enable.description': 'Enable a hook by name',
  'command.hooks.disable.description': 'Disable a hook by name',
  'command.hooks.enable-all.description': 'Enable all disabled hooks',
  'command.hooks.disable-all.description': 'Disable all enabled hooks',
  'command.ide.description': 'Manage IDE integration',
  'command.ide.status.description': 'Check status of IDE integration',
  'command.ide.install.description': 'Install required IDE companion',
  'command.ide.enable.description': 'Enable IDE integration',
  'command.ide.disable.description': 'Disable IDE integration',
  'command.init.description':
    'Analyzes the project and creates a tailored GEMINI.md file',
  'command.mcp.description':
    'Manage configured Model Context Protocol (MCP) servers',
  'command.mcp.list.description': 'List configured MCP servers and tools',
  'command.mcp.desc.description':
    'List configured MCP servers and tools with descriptions',
  'command.mcp.schema.description':
    'List configured MCP servers and tools with descriptions and schemas',
  'command.mcp.auth.description':
    'Authenticate with an OAuth-enabled MCP server',
  'command.mcp.refresh.description': 'Restarts MCP servers',
  'command.mcp.enable.description': 'Enable a disabled MCP server',
  'command.mcp.disable.description': 'Disable an MCP server',
  'command.memory.description': 'Commands for interacting with memory',
  'command.memory.show.description': 'Show the current memory contents',
  'command.memory.add.description': 'Add content to the memory',
  'command.memory.refresh.description': 'Refresh the memory from the source',
  'command.memory.list.description':
    'Lists the paths of the GEMINI.md files in use',
  'command.oncall.description': 'Oncall related commands',
  'command.oncall.dedup.description':
    'Triage issues labeled as status/possible-duplicate',
  'command.oncall.audit.description':
    'Triage issues labeled as status/need-triage',
  'command.permissions.description':
    'Manage folder trust settings and other permissions',
  'command.permissions.trust.description':
    'Manage folder trust settings. Usage: /permissions trust [<directory-path>]',
  'command.plan.description': 'Switch to Plan Mode and view current plan',
  'command.policies.description': 'Manage policies',
  'command.policies.list.description':
    'List all active policies grouped by mode',
  'command.privacy.description': 'Display the privacy notice',
  'command.restore.description':
    'Restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested',
  'command.rewind.description':
    'Jump back to a specific message and restart the conversation',
  'command.stats.description':
    'Check session stats. Usage: /stats [session|model|tools]',
  'command.stats.session.description': 'Show session-specific usage statistics',
  'command.stats.model.description': 'Show model-specific usage statistics',
  'command.stats.tools.description': 'Show tool-specific usage statistics',
  'command.terminal-setup.description':
    'Configure terminal keybindings for multiline input (VS Code, Cursor, Windsurf)',
  'command.tools.description':
    'List available Gemini CLI tools. Usage: /tools [desc]',
  'command.skills.description':
    'List, enable, disable, or reload Gemini CLI agent skills. Usage: /skills [list | disable <name> | enable <name> | reload]',
  'command.skills.list.description':
    'List available agent skills. Usage: /skills list [nodesc] [all]',
  'command.skills.link.description':
    'Link an agent skill from a local path. Usage: /skills link <path> [--scope user|workspace]',
  'command.skills.disable.description':
    'Disable a skill by name. Usage: /skills disable <name>',
  'command.skills.enable.description':
    'Enable a disabled skill by name. Usage: /skills enable <name>',
  'command.skills.reload.description':
    'Reload the list of discovered skills. Usage: /skills reload',
  'command.shells.description': 'Toggle background shells view',
  'command.corgi.description': 'Toggles corgi mode',
  'setting.category.general': 'General',
  'setting.category.ui': 'UI',
  'setting.category.model': 'Model',
  'setting.category.context': 'Context',
  'setting.category.tools': 'Tools',
  'setting.category.security': 'Security',
  'setting.category.advanced': 'Advanced',
  'setting.category.ide': 'IDE',
  'setting.category.experimental': 'Experimental',
  'setting.category.mcp': 'MCP',
  'setting.category.extensions': 'Extensions',
  'setting.category.privacy': 'Privacy',
  'setting.category.output': 'Output',
  'setting.category.admin': 'Admin',
  'setting.general.previewFeatures.label': 'Preview Features (e.g., models)',
  'setting.general.previewFeatures.description':
    'Enable preview features (e.g., preview models).',
  'setting.general.language.label': 'Language',
  'setting.general.language.description': 'The display language for the CLI.',
  'setting.general.vimMode.label': 'Vim Mode',
  'setting.general.vimMode.description': 'Enable Vim keybindings',
  'setting.general.enableAutoUpdate.label': 'Enable Auto Update',
  'setting.general.enableAutoUpdate.description': 'Enable automatic updates.',
  'setting.general.enablePromptCompletion.label': 'Enable Prompt Completion',
  'setting.general.enablePromptCompletion.description':
    'Enable AI-powered prompt completion suggestions while typing.',
  'setting.general.debugKeystrokeLogging.label': 'Debug Keystroke Logging',
  'setting.general.debugKeystrokeLogging.description':
    'Enable debug logging of keystrokes to the console.',
  'setting.general.sessionRetention.enabled.label': 'Enable Session Cleanup',
  'setting.general.sessionRetention.enabled.description':
    'Enable automatic session cleanup',
  'setting.output.format.label': 'Output Format',
  'setting.output.format.description':
    'The format of the CLI output. Can be `text` or `json`.',
  'setting.ui.autoThemeSwitching.label': 'Auto Theme Switching',
  'setting.ui.autoThemeSwitching.description':
    'Automatically switch between default light and dark themes based on terminal background color.',
  'setting.ui.terminalBackgroundPollingInterval.label':
    'Terminal Background Polling Interval',
  'setting.ui.terminalBackgroundPollingInterval.description':
    'Interval in seconds to poll the terminal background color.',
  'setting.ui.hideWindowTitle.label': 'Hide Window Title',
  'setting.ui.hideWindowTitle.description': 'Hide the window title bar',
  'setting.ui.showStatusInTitle.label': 'Show Thoughts in Title',
  'setting.ui.showStatusInTitle.description':
    'Show Gemini CLI model thoughts in the terminal window title during the working phase',
  'setting.ui.dynamicWindowTitle.label': 'Dynamic Window Title',
  'setting.ui.dynamicWindowTitle.description':
    'Update the terminal window title with current status icons (Ready: ◇, Action Required: ✋, Working: ✦)',
  'setting.ui.showHomeDirectoryWarning.label': 'Show Home Directory Warning',
  'setting.ui.showHomeDirectoryWarning.description':
    'Show a warning when running Gemini CLI in the home directory.',
  'setting.ui.hideTips.label': 'Hide Tips',
  'setting.ui.hideTips.description': 'Hide helpful tips in the UI',
  'setting.ui.hideBanner.label': 'Hide Banner',
  'setting.ui.hideBanner.description': 'Hide the application banner',
  'setting.ui.hideContextSummary.label': 'Hide Context Summary',
  'setting.ui.hideContextSummary.description':
    'Hide the context summary (GEMINI.md, MCP servers) above the input.',
  'setting.ui.footer.hideCWD.label': 'Hide CWD',
  'setting.ui.footer.hideCWD.description':
    'Hide the current working directory path in the footer.',
  'setting.ui.footer.hideSandboxStatus.label': 'Hide Sandbox Status',
  'setting.ui.footer.hideSandboxStatus.description':
    'Hide the sandbox status indicator in the footer.',
  'setting.ui.footer.hideModelInfo.label': 'Hide Model Info',
  'setting.ui.footer.hideModelInfo.description':
    'Hide the model name and context usage in the footer.',
  'setting.ui.footer.hideContextPercentage.label':
    'Hide Context Window Percentage',
  'setting.ui.footer.hideContextPercentage.description':
    'Hides the context window remaining percentage.',
  'setting.ui.hideFooter.label': 'Hide Footer',
  'setting.ui.hideFooter.description': 'Hide the footer from the UI',
  'setting.ui.showMemoryUsage.label': 'Show Memory Usage',
  'setting.ui.showMemoryUsage.description':
    'Display memory usage information in the UI',
  'setting.ui.showLineNumbers.label': 'Show Line Numbers',
  'setting.ui.showLineNumbers.description': 'Show line numbers in the chat.',
  'setting.ui.showCitations.label': 'Show Citations',
  'setting.ui.showCitations.description':
    'Show citations for generated text in the chat.',
  'setting.ui.showModelInfoInChat.label': 'Show Model Info In Chat',
  'setting.ui.showModelInfoInChat.description':
    'Show the model name in the chat for each model turn.',
  'setting.ui.showUserIdentity.label': 'Show User Identity',
  'setting.ui.showUserIdentity.description':
    "Show the logged-in user's identity (e.g. email) in the UI.",
  'setting.ui.useAlternateBuffer.label': 'Use Alternate Screen Buffer',
  'setting.ui.useAlternateBuffer.description':
    'Use an alternate screen buffer for the UI, preserving shell history.',
  'setting.ui.useBackgroundColor.label': 'Use Background Color',
  'setting.ui.useBackgroundColor.description':
    'Whether to use background colors in the UI.',
  'setting.ui.incrementalRendering.label': 'Incremental Rendering',
  'setting.ui.incrementalRendering.description':
    'Enable incremental rendering for the UI. This option will reduce flickering but may cause rendering artifacts. Only supported when useAlternateBuffer is enabled.',
  'setting.ui.showSpinner.label': 'Show Spinner',
  'setting.ui.showSpinner.description': 'Show the spinner during operations.',
  'setting.ui.accessibility.enableLoadingPhrases.label':
    'Enable Loading Phrases',
  'setting.ui.accessibility.enableLoadingPhrases.description':
    'Enable loading phrases during operations.',
  'setting.ui.accessibility.screenReader.label': 'Screen Reader Mode',
  'setting.ui.accessibility.screenReader.description':
    'Render output in plain-text to be more screen reader accessible',
  'setting.ide.enabled.label': 'IDE Mode',
  'setting.ide.enabled.description': 'Enable IDE integration mode.',
  'setting.model.maxSessionTurns.label': 'Max Session Turns',
  'setting.model.maxSessionTurns.description':
    'Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.',
  'setting.model.compressionThreshold.label': 'Compression Threshold',
  'setting.model.compressionThreshold.description':
    'The fraction of context usage at which to trigger context compression (e.g. 0.2, 0.3).',
  'setting.model.disableLoopDetection.label': 'Disable Loop Detection',
  'setting.model.disableLoopDetection.description':
    'Disable automatic detection and prevention of infinite loops.',
  'setting.model.skipNextSpeakerCheck.label': 'Skip Next Speaker Check',
  'setting.model.skipNextSpeakerCheck.description':
    'Skip the next speaker check.',
  'setting.context.discoveryMaxDirs.label': 'Memory Discovery Max Dirs',
  'setting.context.discoveryMaxDirs.description':
    'Maximum number of directories to search for memory.',
  'setting.context.loadMemoryFromIncludeDirectories.label':
    'Load Memory From Include Directories',
  'setting.context.loadMemoryFromIncludeDirectories.description':
    'Controls how /memory refresh loads GEMINI.md files. When true, include directories are scanned; when false, only the current directory is used.',
  'setting.context.fileFiltering.respectGitIgnore.label': 'Respect .gitignore',
  'setting.context.fileFiltering.respectGitIgnore.description':
    'Respect .gitignore files when searching.',
  'setting.context.fileFiltering.respectGeminiIgnore.label':
    'Respect .geminiignore',
  'setting.context.fileFiltering.respectGeminiIgnore.description':
    'Respect .geminiignore files when searching.',
  'setting.context.fileFiltering.enableRecursiveFileSearch.label':
    'Enable Recursive File Search',
  'setting.context.fileFiltering.enableRecursiveFileSearch.description':
    'Enable recursive file search functionality when completing @ references in the prompt.',
  'setting.context.fileFiltering.enableFuzzySearch.label':
    'Enable Fuzzy Search',
  'setting.context.fileFiltering.enableFuzzySearch.description':
    'Enable fuzzy search when searching for files.',
  'setting.context.fileFiltering.customIgnoreFilePaths.label':
    'Custom Ignore File Paths',
  'setting.context.fileFiltering.customIgnoreFilePaths.description':
    'Additional ignore file paths to respect.',
  'setting.tools.shell.enableInteractiveShell.label':
    'Enable Interactive Shell',
  'setting.tools.shell.enableInteractiveShell.description':
    'Use node-pty for an interactive shell experience. Fallback to child_process still applies.',
  'setting.tools.shell.showColor.label': 'Show Color',
  'setting.tools.shell.showColor.description': 'Show color in shell output.',
  'setting.tools.approvalMode.label': 'Approval Mode',
  'setting.tools.approvalMode.description':
    "The default approval mode for tool execution. 'default' prompts for approval, 'auto_edit' auto-approves edit tools, and 'plan' is read-only mode.",
  'setting.tools.useRipgrep.label': 'Use Ripgrep',
  'setting.tools.useRipgrep.description':
    'Use ripgrep for file content search instead of the fallback implementation. Provides faster search performance.',
  'setting.tools.enableToolOutputTruncation.label':
    'Enable Tool Output Truncation',
  'setting.tools.enableToolOutputTruncation.description':
    'Enable truncation of large tool outputs.',
  'setting.tools.truncateToolOutputThreshold.label':
    'Tool Output Truncation Threshold',
  'setting.tools.truncateToolOutputThreshold.description':
    'Truncate tool output if it is larger than this many characters. Set to -1 to disable.',
  'setting.tools.truncateToolOutputLines.label': 'Tool Output Truncation Lines',
  'setting.tools.truncateToolOutputLines.description':
    'The number of lines to keep when truncating tool output.',
  'setting.tools.disableLLMCorrection.label': 'Disable LLM Correction',
  'setting.tools.disableLLMCorrection.description':
    'Disable LLM-based error correction for edit tools. When enabled, tools will fail immediately if exact string matches are not found, instead of attempting to self-correct.',
  'setting.skills.enabled.label': 'Enable Agent Skills',
  'setting.skills.enabled.description': 'Enable Agent Skills.',
  'setting.hooksConfig.enabled.label': 'Enable Hooks',
  'setting.hooksConfig.enabled.description':
    'Canonical toggle for the hooks system. When disabled, no hooks will be executed.',
  'setting.hooksConfig.notifications.label': 'Hook Notifications',
  'setting.hooksConfig.notifications.description':
    'Show visual indicators when hooks are executing.',
  'setting.security.disableYoloMode.label': 'Disable YOLO Mode',
  'setting.security.disableYoloMode.description':
    'Disable YOLO mode, even if enabled by a flag.',
  'setting.security.enablePermanentToolApproval.label':
    'Allow Permanent Tool Approval',
  'setting.security.enablePermanentToolApproval.description':
    'Enable the "Allow for all future sessions" option in tool confirmation dialogs.',
  'setting.security.blockGitExtensions.label': 'Blocks extensions from Git',
  'setting.security.blockGitExtensions.description':
    'Blocks installing and loading extensions from Git.',
  'setting.security.allowedExtensions.label':
    'Extension Source Regex Allowlist',
  'setting.security.allowedExtensions.description':
    'List of Regex patterns for allowed extensions.',
  'setting.security.folderTrust.enabled.label': 'Folder Trust',
  'setting.security.folderTrust.enabled.description':
    'Setting to track whether Folder trust is enabled.',
  'setting.security.environmentVariableRedaction.enabled.label':
    'Enable Environment Variable Redaction',
  'setting.security.environmentVariableRedaction.enabled.description':
    'Enable redaction of environment variables that may contain secrets.',
  'setting.experimental.useOSC52Paste.label': 'Use OSC 52 Paste',
  'setting.experimental.useOSC52Paste.description':
    'Use OSC 52 sequence for pasting instead of clipboardy (useful for remote sessions).',
  'setting.experimental.plan.label': 'Plan',
  'setting.experimental.plan.description':
    'Enable planning features (Plan Mode and tools).',
  'settings.title': 'Settings',
  'settings.search.placeholder': 'Search to filter',
  'settings.restart.prompt':
    'To see changes, Gemini CLI must be restarted. Press r to exit and apply changes now.',
  'settings.scope.applyTo': 'Apply To',
  'settings.help': '(Use Enter to select, Ctrl+L to reset{tab}, Esc to close)',
  'settings.noMatches': 'No matches found.',
  'settings.scope.user': 'User Settings',
  'settings.scope.workspace': 'Workspace Settings',
  'settings.scope.system': 'System Settings',
  'settings.scope.modifiedIn': '(Modified in {scopes})',
  'settings.scope.alsoModifiedIn': '(Also modified in {scopes})',
  'setting.option.text': 'Text',
  'setting.option.json': 'JSON',
  'setting.option.en': 'English',
  'setting.option.zh': 'Chinese (中文)',
  'setting.option.default': 'Default',
  'setting.option.auto_edit': 'Auto Edit',
  'setting.option.plan': 'Plan',
  'tips.header': 'Tips for getting started:',
  'tips.step1': '1. Ask questions, edit files, or run commands.',
  'tips.step2': '2. Be specific for the best results.',
  'tips.step3.custom':
    '3. Create {file} files to customize your interactions with Gemini.',
  'tips.help': '{num} {help} for more information.',
  'trust.title': 'Do you trust this folder?',
  'trust.description':
    'Trusting a folder allows Gemini to execute commands it suggests. This is a security feature to prevent accidental execution in untrusted directories.',
  'trust.option.folder': 'Trust folder ({name})',
  'trust.option.parent': 'Trust parent folder ({name})',
  'trust.option.none': "Don't trust",
  'trust.restarting': 'Gemini CLI is restarting to apply the trust changes...',
  'trust.exiting':
    'A folder trust level must be selected to continue. Exiting since escape was pressed.',
  'update.failed': 'Automatic update failed. Please try updating manually',
  'update.available':
    'A new version of Gemini CLI is available! {current} → {latest}',
  'update.attempting':
    'Installed with {pm}. Attempting to automatically update now...',
  'update.manual': 'Please run {command} to update',
  'update.success':
    'Update successful! The new version will be used on your next run.',
};

const zh: Translations = {
  'command.help.description': '获取 Gemini CLI 的帮助信息',
  'command.model.description': '打开模型配置对话框',
  'command.clear.description': '清除屏幕和会话历史',
  'command.quit.description': '退出命令行界面',
  'command.resume.description': '浏览并恢复自动保存的会话',
  'command.settings.description': '查看并编辑 Gemini CLI 设置',
  'command.setup-github.description': '设置 GitHub Actions',
  'command.theme.description': '切换界面主题',
  'command.copy.description': '将最后的结果或代码片段复制到剪贴板',
  'command.docs.description': '在浏览器中打开完整的文档',
  'command.bug.description': '提交问题反馈',
  'command.vim.description': '开启/关闭 Vim 模式',
  'command.compress.description': '通过摘要压缩当前上下文以节省空间',
  'command.chat.description': '管理会话历史',
  'command.chat.list.description': '列出已保存的会话检查点',
  'command.chat.save.description':
    '将当前会话保存为检查点。用法: /chat save <标签>',
  'command.chat.resume.description':
    '从检查点恢复会话。用法: /chat resume <标签>',
  'command.chat.delete.description':
    '删除会话检查点。用法: /chat delete <标签>',
  'command.chat.share.description':
    '将当前会话分享到 Markdown 或 JSON 文件。用法: /chat share <文件>',
  'command.language.description': '更改显示语言',
  'command.language.prompt': '选择您偏好的语言：',
  'command.language.success': '语言已更改为 {lang}。',
  'command.about.description': '显示版本信息',
  'command.agents.description': '管理智能代理 (Agents)',
  'command.agents.list.description': '列出可用的本地和远程智能代理',
  'command.agents.refresh.description': '重新加载智能代理注册表',
  'command.agents.enable.description': '启用被禁用的智能代理',
  'command.agents.disable.description': '禁用已启用的智能代理',
  'command.agents.config.description': '配置智能代理',
  'command.auth.description': '管理身份验证',
  'command.auth.login.description': '登录或更改身份验证方法',
  'command.auth.logout.description': '退出登录并清除所有缓存的凭据',
  'command.directory.description': '管理工作区目录',
  'command.directory.add.description': '向工作区添加目录。使用逗号分隔多个路径',
  'command.directory.show.description': '显示工作区中的所有目录',
  'command.editor.description': '设置外部编辑器偏好',
  'command.extensions.description': '管理扩展',
  'command.extensions.list.description': '列出已启用的扩展',
  'command.extensions.update.description':
    '更新扩展。用法: update <扩展名称>|--all',
  'command.extensions.explore.description': '在浏览器中打开扩展页面',
  'command.extensions.restart.description': '重启所有扩展',
  'command.extensions.disable.description': '禁用扩展',
  'command.extensions.enable.description': '启用扩展',
  'command.extensions.install.description': '从 Git 仓库或本地路径安装扩展',
  'command.extensions.link.description': '从本地路径链接扩展',
  'command.extensions.uninstall.description': '卸载扩展',
  'command.extensions.config.description': '配置扩展设置',
  'command.hooks.description': '管理钩子 (Hooks)',
  'command.hooks.panel.description': '显示所有已注册钩子的状态',
  'command.hooks.enable.description': '通过名称启用钩子',
  'command.hooks.disable.description': '通过名称禁用钩子',
  'command.hooks.enable-all.description': '启用所有禁用的钩子',
  'command.hooks.disable-all.description': '禁用所有启用的钩子',
  'command.ide.description': '管理 IDE 集成',
  'command.ide.status.description': '检查 IDE 集成状态',
  'command.ide.install.description': '安装所需的 IDE 伴侣 (Companion) 扩展',
  'command.ide.enable.description': '启用 IDE 集成',
  'command.ide.disable.description': '禁用 IDE 集成',
  'command.init.description': '分析项目并创建定制的 GEMINI.md 文件',
  'command.mcp.description': '管理已配置的 Model Context Protocol (MCP) 服务器',
  'command.mcp.list.description': '列出已配置的 MCP 服务器和工具',
  'command.mcp.desc.description': '列出已配置的 MCP 服务器、工具及其描述',
  'command.mcp.schema.description':
    '列出已配置的 MCP 服务器、工具、描述及其 Schema',
  'command.mcp.auth.description': '向支持 OAuth 的 MCP 服务器进行身份验证',
  'command.mcp.refresh.description': '重启 MCP 服务器',
  'command.mcp.enable.description': '启用被禁用的 MCP 服务器',
  'command.mcp.disable.description': '禁用 MCP 服务器',
  'command.memory.description': '与记忆 (Memory) 交互的命令',
  'command.memory.show.description': '显示当前记忆内容',
  'command.memory.add.description': '向记忆添加内容',
  'command.memory.refresh.description': '从源刷新记忆',
  'command.memory.list.description': '列出正在使用的 GEMINI.md 文件路径',
  'command.oncall.description': '值班 (Oncall) 相关命令',
  'command.oncall.dedup.description':
    '分拣标记为 status/possible-duplicate 的问题',
  'command.oncall.audit.description': '分拣标记为 status/need-triage 的问题',
  'command.permissions.description': '管理文件夹信任设置和其他权限',
  'command.permissions.trust.description':
    '管理文件夹信任设置。用法: /permissions trust [<目录路径>]',
  'command.plan.description': '切换到计划模式 (Plan Mode) 并查看当前计划',
  'command.policies.description': '管理策略 (Policies)',
  'command.policies.list.description': '列出按模式分组的所有活动策略',
  'command.privacy.description': '显示隐私声明',
  'command.restore.description':
    '还原工具调用。这将重置会话和文件历史记录到建议该工具调用时的状态',
  'command.rewind.description': '跳转回特定消息并重新开始对话',
  'command.stats.description':
    '查看会话统计。用法: /stats [session|model|tools]',
  'command.stats.session.description': '显示会话特定的使用统计信息',
  'command.stats.model.description': '显示模型特定的使用统计信息',
  'command.stats.tools.description': '显示工具特定的使用统计信息',
  'command.terminal-setup.description':
    '配置终端快捷键以支持多行输入 (VS Code, Cursor, Windsurf)',
  'command.tools.description':
    '列出可用的 Gemini CLI 工具。用法: /tools [desc]',
  'command.skills.description':
    '列出、启用、禁用或重新加载 Gemini CLI 代理技能。用法: /skills [list | disable <名称> | enable <名称> | reload]',
  'command.skills.list.description':
    '列出可用的代理技能。用法: /skills list [nodesc] [all]',
  'command.skills.link.description':
    '从本地路径链接代理技能。用法: /skills link <路径> [--scope user|workspace]',
  'command.skills.disable.description':
    '通过名称禁用技能。用法: /skills disable <名称>',
  'command.skills.enable.description':
    '通过名称启用禁用的技能。用法: /skills enable <名称>',
  'command.skills.reload.description':
    '重新加载已发现的技能列表。用法: /skills reload',
  'command.shells.description': '切换后台 Shell 视图',
  'command.corgi.description': '切换柯基 (Corgi) 模式',
  'setting.category.general': '常规',
  'setting.category.ui': '界面',
  'setting.category.model': '模型',
  'setting.category.context': '上下文',
  'setting.category.tools': '工具',
  'setting.category.security': '安全',
  'setting.category.advanced': '高级',
  'setting.category.ide': 'IDE',
  'setting.category.experimental': '实验性',
  'setting.category.mcp': 'MCP',
  'setting.category.extensions': '扩展',
  'setting.category.privacy': '隐私',
  'setting.category.output': '输出',
  'setting.category.admin': '管理',
  'setting.general.previewFeatures.label': '预览功能 (例如模型)',
  'setting.general.previewFeatures.description':
    '启用预览功能 (例如预览版模型)。',
  'setting.general.language.label': '语言',
  'setting.general.language.description': 'CLI 的显示语言。',
  'setting.general.vimMode.label': 'Vim 模式',
  'setting.general.vimMode.description': '启用 Vim 快捷键',
  'setting.general.enableAutoUpdate.label': '启用自动更新',
  'setting.general.enableAutoUpdate.description': '启用自动更新功能。',
  'setting.general.enablePromptCompletion.label': '启用提示词自动补全',
  'setting.general.enablePromptCompletion.description':
    '在输入时启用 AI 驱动的提示词补全建议。',
  'setting.general.debugKeystrokeLogging.label': '调试按键日志',
  'setting.general.debugKeystrokeLogging.description':
    '在控制台中启用按键的调试日志记录。',
  'setting.general.sessionRetention.enabled.label': '启用会话清理',
  'setting.general.sessionRetention.enabled.description': '启用自动会话清理',
  'setting.output.format.label': '输出格式',
  'setting.output.format.description':
    'CLI 输出的格式。可以是 `text` 或 `json`。',
  'setting.ui.autoThemeSwitching.label': '自动主题切换',
  'setting.ui.autoThemeSwitching.description':
    '根据终端背景颜色自动在默认的浅色和深色主题之间切换。',
  'setting.ui.terminalBackgroundPollingInterval.label': '终端背景轮询间隔',
  'setting.ui.terminalBackgroundPollingInterval.description':
    '轮询终端背景颜色的时间间隔 (秒)。',
  'setting.ui.hideWindowTitle.label': '隐藏窗口标题',
  'setting.ui.hideWindowTitle.description': '隐藏窗口标题栏',
  'setting.ui.showStatusInTitle.label': '在标题中显示思考过程',
  'setting.ui.showStatusInTitle.description':
    '在工作阶段于终端窗口标题中显示 Gemini 模型思考过程',
  'setting.ui.dynamicWindowTitle.label': '动态窗口标题',
  'setting.ui.dynamicWindowTitle.description':
    '使用当前状态图标更新终端窗口标题 (就绪: ◇, 需要操作: ✋, 工作中: ✦)',
  'setting.ui.showHomeDirectoryWarning.label': '显示主目录警告',
  'setting.ui.showHomeDirectoryWarning.description':
    '在主目录中运行 Gemini CLI 时显示警告。',
  'setting.ui.hideTips.label': '隐藏提示',
  'setting.ui.hideTips.description': '在界面中隐藏帮助提示',
  'setting.ui.hideBanner.label': '隐藏横幅',
  'setting.ui.hideBanner.description': '隐藏应用程序横幅',
  'setting.ui.hideContextSummary.label': '隐藏上下文摘要',
  'setting.ui.hideContextSummary.description':
    '隐藏输入框上方的上下文摘要 (GEMINI.md, MCP 服务器)。',
  'setting.ui.footer.hideCWD.label': '隐藏当前工作目录',
  'setting.ui.footer.hideCWD.description': '在页脚中隐藏当前工作目录路径。',
  'setting.ui.footer.hideSandboxStatus.label': '隐藏沙箱状态',
  'setting.ui.footer.hideSandboxStatus.description':
    '在页脚中隐藏沙箱状态指示器。',
  'setting.ui.footer.hideModelInfo.label': '隐藏模型信息',
  'setting.ui.footer.hideModelInfo.description':
    '在页脚中隐藏模型名称和上下文使用情况。',
  'setting.ui.footer.hideContextPercentage.label': '隐藏上下文窗口百分比',
  'setting.ui.footer.hideContextPercentage.description':
    '隐藏上下文窗口剩余百分比。',
  'setting.ui.hideFooter.label': '隐藏页脚',
  'setting.ui.hideFooter.description': '从界面中隐藏页脚',
  'setting.ui.showMemoryUsage.label': '显示内存使用情况',
  'setting.ui.showMemoryUsage.description': '在界面中显示内存使用信息',
  'setting.ui.showLineNumbers.label': '显示行号',
  'setting.ui.showLineNumbers.description': '在聊天中显示行号。',
  'setting.ui.showCitations.label': '显示引用',
  'setting.ui.showCitations.description': '在聊天中为生成的文本显示引用来源。',
  'setting.ui.showModelInfoInChat.label': '在聊天中显示模型信息',
  'setting.ui.showModelInfoInChat.description':
    '在聊天的每一轮中显示模型名称。',
  'setting.ui.showUserIdentity.label': '显示用户身份',
  'setting.ui.showUserIdentity.description':
    '在界面中显示登录用户的身份 (例如电子邮件)。',
  'setting.ui.useAlternateBuffer.label': '使用备用屏幕缓冲区',
  'setting.ui.useAlternateBuffer.description':
    '为界面使用备用屏幕缓冲区，保留 Shell 历史记录。',
  'setting.ui.useBackgroundColor.label': '使用背景颜色',
  'setting.ui.useBackgroundColor.description': '是否在界面中使用背景颜色。',
  'setting.ui.incrementalRendering.label': '增量渲染',
  'setting.ui.incrementalRendering.description':
    '启用界面的增量渲染。此选项将减少闪烁，但可能会导致渲染伪影。仅在启用备用缓冲区时支持。',
  'setting.ui.showSpinner.label': '显示加载动画',
  'setting.ui.showSpinner.description': '在操作期间显示加载动画 (Spinner)。',
  'setting.ui.accessibility.enableLoadingPhrases.label': '启用加载短语',
  'setting.ui.accessibility.enableLoadingPhrases.description':
    '在操作期间启用加载短语。',
  'setting.ui.accessibility.screenReader.label': '屏幕阅读器模式',
  'setting.ui.accessibility.screenReader.description':
    '以纯文本形式渲染输出，以便更好地支持屏幕阅读器',
  'setting.ide.enabled.label': 'IDE 模式',
  'setting.ide.enabled.description': '启用 IDE 集成模式。',
  'setting.model.maxSessionTurns.label': '最大会话轮数',
  'setting.model.maxSessionTurns.description':
    '会话中保留的用户/模型/工具最大轮数。-1 表示无限制。',
  'setting.model.compressionThreshold.label': '压缩阈值',
  'setting.model.compressionThreshold.description':
    '触发上下文压缩的上下文使用比例 (例如 0.2, 0.3)。',
  'setting.model.disableLoopDetection.label': '禁用循环检测',
  'setting.model.disableLoopDetection.description':
    '禁用无限循环的自动检测和预防。',
  'setting.model.skipNextSpeakerCheck.label': '跳过下一发言者检查',
  'setting.model.skipNextSpeakerCheck.description': '跳过下一发言者检查。',
  'setting.context.discoveryMaxDirs.label': '内存发现最大目录数',
  'setting.context.discoveryMaxDirs.description':
    '搜索内存文件的最大目录数量。',
  'setting.context.loadMemoryFromIncludeDirectories.label':
    '从包含的目录加载内存',
  'setting.context.loadMemoryFromIncludeDirectories.description':
    '控制 /memory refresh 如何加载 GEMINI.md 文件。为 true 时扫描包含的目录；为 false 时仅使用当前目录。',
  'setting.context.fileFiltering.respectGitIgnore.label': '遵循 .gitignore',
  'setting.context.fileFiltering.respectGitIgnore.description':
    '搜索时遵循 .gitignore 文件。',
  'setting.context.fileFiltering.respectGeminiIgnore.label':
    '遵循 .geminiignore',
  'setting.context.fileFiltering.respectGeminiIgnore.description':
    '搜索时遵循 .geminiignore 文件。',
  'setting.context.fileFiltering.enableRecursiveFileSearch.label':
    '启用递归文件搜索',
  'setting.context.fileFiltering.enableRecursiveFileSearch.description':
    '在提示词中补全 @ 引用时启用递归文件搜索功能。',
  'setting.context.fileFiltering.enableFuzzySearch.label': '启用模糊搜索',
  'setting.context.fileFiltering.enableFuzzySearch.description':
    '搜索文件时启用模糊搜索。',
  'setting.context.fileFiltering.customIgnoreFilePaths.label':
    '自定义忽略文件路径',
  'setting.context.fileFiltering.customIgnoreFilePaths.description':
    '要遵循的额外忽略文件路径。',
  'setting.tools.shell.enableInteractiveShell.label': '启用交互式 Shell',
  'setting.tools.shell.enableInteractiveShell.description':
    '使用 node-pty 以获得交互式 Shell 体验。仍支持回退到 child_process。',
  'setting.tools.shell.showColor.label': '显示颜色',
  'setting.tools.shell.showColor.description': '在 Shell 输出中显示颜色。',
  'setting.tools.approvalMode.label': '审批模式',
  'setting.tools.approvalMode.description':
    "工具执行的默认审批模式。'default' 提示审批，'auto_edit' 自动批准编辑工具，'plan' 是只读模式。",
  'setting.tools.useRipgrep.label': '使用 Ripgrep',
  'setting.tools.useRipgrep.description':
    '使用 ripgrep 进行文件内容搜索，而不是回退实现。提供更快的搜索性能。',
  'setting.tools.enableToolOutputTruncation.label': '启用工具输出截断',
  'setting.tools.enableToolOutputTruncation.description':
    '启用大型工具输出的截断。',
  'setting.tools.truncateToolOutputThreshold.label': '工具输出截断阈值',
  'setting.tools.truncateToolOutputThreshold.description':
    '如果工具输出大于此字符数，则进行截断。设置为 -1 以禁用。',
  'setting.tools.truncateToolOutputLines.label': '工具输出截断行数',
  'setting.tools.truncateToolOutputLines.description':
    '截断工具输出时保留的行数。',
  'setting.tools.disableLLMCorrection.label': '禁用 LLM 纠错',
  'setting.tools.disableLLMCorrection.description':
    '禁用编辑工具的基于 LLM 的错误纠正。启用后，如果未找到精确字符串匹配，工具将立即失败，而不是尝试自我纠正。',
  'setting.skills.enabled.label': '启用代理技能',
  'setting.skills.enabled.description': '启用代理技能。',
  'setting.hooksConfig.enabled.label': '启用钩子',
  'setting.hooksConfig.enabled.description':
    '钩子系统的总开关。禁用后，将不会执行任何钩子。',
  'setting.hooksConfig.notifications.label': '钩子通知',
  'setting.hooksConfig.notifications.description':
    '在执行钩子时显示视觉指示器。',
  'setting.security.disableYoloMode.label': '禁用 YOLO 模式',
  'setting.security.disableYoloMode.description':
    '禁用 YOLO 模式，即使通过标志启用。',
  'setting.security.enablePermanentToolApproval.label': '允许永久工具批准',
  'setting.security.enablePermanentToolApproval.description':
    '在工具确认对话框中启用“以后所有会话均允许”选项。',
  'setting.security.blockGitExtensions.label': '阻止来自 Git 的扩展',
  'setting.security.blockGitExtensions.description':
    '阻止从 Git 安装和加载扩展。',
  'setting.security.allowedExtensions.label': '扩展源正则白名单',
  'setting.security.allowedExtensions.description':
    '允许的扩展源的正则表达式模式列表。',
  'setting.security.folderTrust.enabled.label': '文件夹信任',
  'setting.security.folderTrust.enabled.description':
    '跟踪是否启用文件夹信任的设置。',
  'setting.security.environmentVariableRedaction.enabled.label':
    '启用环境变量脱敏',
  'setting.security.environmentVariableRedaction.enabled.description':
    '启用可能包含机密信息的环境变量的脱敏。',
  'setting.experimental.useOSC52Paste.label': '使用 OSC 52 粘贴',
  'setting.experimental.useOSC52Paste.description':
    '使用 OSC 52 序列进行粘贴而不是 clipboardy (对远程会话很有用)。',
  'setting.experimental.plan.label': '计划',
  'setting.experimental.plan.description': '启用计划功能 (计划模式和工具)。',
  'settings.title': '设置',
  'settings.search.placeholder': '输入以搜索',
  'settings.restart.prompt':
    '需要重启 Gemini CLI 才能看到更改。按 r 退出并立即应用。',
  'settings.scope.applyTo': '应用于',
  'settings.help': '(使用 Enter 选择, Ctrl+L 重置{tab}, Esc 关闭)',
  'settings.noMatches': '未找到匹配项。',
  'settings.scope.user': '用户设置',
  'settings.scope.workspace': '工作区设置',
  'settings.scope.system': '系统设置',
  'settings.scope.modifiedIn': '(已在 {scopes} 中修改)',
  'settings.scope.alsoModifiedIn': '(也在 {scopes} 中修改)',
  'setting.option.text': '文本',
  'setting.option.json': 'JSON',
  'setting.option.en': '英语',
  'setting.option.zh': '中文 (Chinese)',
  'setting.option.default': '默认',
  'setting.option.auto_edit': '自动编辑',
  'setting.option.plan': '计划',
  'tips.header': '上手提示词：',
  'tips.step1': '1. 提问、编辑文件或运行命令。',
  'tips.step2': '2. 描述越具体，效果越好。',
  'tips.step3.custom': '3. 创建 {file} 文件来定制 Gemini 的行为。',
  'tips.help': '{num} 输入 {help} 获取更多信息。',
  'trust.title': '你信任这个文件夹吗？',
  'trust.description':
    '信任文件夹允许 Gemini 执行它建议的命令。这是一项安全功能，旨在防止在不信任的目录中意外执行操作。',
  'trust.option.folder': '信任当前文件夹 ({name})',
  'trust.option.parent': '信任父文件夹 ({name})',
  'trust.option.none': '不信任',
  'trust.restarting': 'Gemini CLI 正在重启以应用信任设置...',
  'trust.exiting': '必须选择文件夹信任级别才能继续。按下 Esc 键，正在退出。',
  'update.failed': '自动更新失败。请尝试手动更新',
  'update.available': '发现 Gemini CLI 新版本！{current} → {latest}',
  'update.attempting': '检测到通过 {pm} 安装。正在尝试自动更新...',
  'update.manual': '请运行 {command} 手动更新',
  'update.success': '更新成功！下次启动将使用新版本。',
};

const translations: Record<Language, Translations> = {
  en,
  zh,
};

let currentLanguage: Language = 'en';

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(
  key: string,
  params?: Record<string, string> & { default?: string },
): string {
  let text =
    translations[currentLanguage][key] ||
    translations['en'][key] ||
    params?.default ||
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'default') {
        text = text.replace(`{${k}}`, v);
      }
    }
  }
  return text;
}
