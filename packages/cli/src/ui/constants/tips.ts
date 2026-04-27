/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Tip {
  text: string;
  relatedFeature?: string;
  weight?: number;
}

export const INFORMATIVE_TIPS: Tip[] = [
  //Settings tips start here
  {
    text: 'Set your preferred editor for opening files (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Toggle Vim mode for a modal editing experience (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Disable automatic updates if you prefer manual control (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Turn off nagging update notifications (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable checkpointing to recover your session after a crash (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Change CLI output format to JSON for scripting (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Personalize your CLI with a new color theme (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Create and use your own custom themes (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Hide window title for a more minimal UI (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: "Don't like these tips? You can hide them (/settings)…",
    relatedFeature: 'settings',
  },
  {
    text: 'Hide the startup banner for a cleaner launch (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Hide the context summary above the input (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Reclaim vertical space by hiding the footer (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Hide individual footer elements like CWD or sandbox status (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Hide the context window percentage in the footer (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Show memory usage for performance monitoring (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Show line numbers in the chat for easier reference (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Show citations to see where the model gets information (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Customize loading phrases: tips, witty, all, or off (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Add custom witty phrases to the loading screen (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Use alternate screen buffer to preserve shell history (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Choose a specific Gemini model for conversations (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Limit the number of turns in your session history (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Automatically summarize large tool outputs to save tokens (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Control when chat history gets compressed based on context compression threshold (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Define custom context file names, like CONTEXT.md (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Set max directories to scan for context files (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Expand your workspace with additional directories (/directory)…',
    relatedFeature: 'directory',
  },
  {
    text: 'Control how /memory reload loads context files (/settings)…',
    relatedFeature: 'memory',
  },
  {
    text: 'Toggle respect for .gitignore files in context (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Toggle respect for .geminiignore files in context (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable recursive file search for @-file completions (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Disable fuzzy search when searching for files (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Run tools in a secure sandbox environment (settings.json)…',
    relatedFeature: 'sandbox',
  },
  {
    text: 'Use an interactive terminal for shell commands (/settings)…',
    relatedFeature: 'shell',
  },
  {
    text: 'Show color in shell command output (/settings)…',
    relatedFeature: 'shell',
  },
  {
    text: 'Automatically accept safe read-only tool calls (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Restrict available built-in tools (settings.json)…',
    relatedFeature: 'tools',
  },
  {
    text: 'Exclude specific tools from being used (settings.json)…',
    relatedFeature: 'tools',
  },
  {
    text: 'Bypass confirmation for trusted tools (settings.json)…',
    relatedFeature: 'tools',
  },
  {
    text: 'Use a custom command for tool discovery (settings.json)…',
    relatedFeature: 'tools',
  },
  {
    text: 'Define a custom command for calling discovered tools (settings.json)…',
    relatedFeature: 'tools',
  },
  {
    text: 'Define and manage connections to MCP servers (settings.json)…',
    relatedFeature: 'mcp',
  },
  {
    text: 'Enable folder trust to enhance security (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Disable YOLO mode to enforce confirmations (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Block Git extensions for enhanced security (settings.json)…',
    relatedFeature: 'git',
  },
  {
    text: 'Change your authentication method (/settings)…',
    relatedFeature: 'auth',
  },
  {
    text: 'Enforce auth type for enterprise use (settings.json)…',
    relatedFeature: 'auth',
  },
  {
    text: 'Let Node.js auto-configure memory (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Retry on fetch failed errors automatically (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Customize the DNS resolution order (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Exclude env vars from the context (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Configure a custom command for filing bug reports (settings.json)…',
    relatedFeature: 'bug',
  },
  {
    text: 'Enable or disable telemetry collection (/settings)…',
    relatedFeature: 'telemetry',
  },
  {
    text: 'Send telemetry data to a local file or GCP (settings.json)…',
    relatedFeature: 'telemetry',
  },
  {
    text: 'Configure the OTLP endpoint for telemetry (settings.json)…',
    relatedFeature: 'telemetry',
  },
  {
    text: 'Choose whether to log prompt content (settings.json)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable AI-powered prompt completion while typing (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable debug logging of keystrokes to the console (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable automatic session cleanup of old conversations (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Show Gemini CLI status in the terminal window title (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Use the entire width of the terminal for output (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable screen reader mode for better accessibility (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Skip the next speaker check for faster responses (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Use ripgrep for faster file content search (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable truncation of large tool outputs to save tokens (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Set the character threshold for truncating tool outputs (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Set the number of lines to keep when truncating outputs (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable policy-based tool confirmation via message bus (/settings)…',
    relatedFeature: 'settings',
  },
  {
    text: 'Enable write_todos_list tool to generate task lists (/settings)…',
    relatedFeature: 'todos',
  },
  {
    text: 'Enable experimental subagents for task delegation (/settings)…',
    relatedFeature: 'subagents',
  },
  {
    text: 'Enable extension management features (settings.json)…',
    relatedFeature: 'extensions',
  },
  {
    text: 'Enable extension reloading within the CLI session (settings.json)…',
    relatedFeature: 'extensions',
  },
  //Settings tips end here
  // Keyboard shortcut tips start here
  { text: 'Close dialogs and suggestions with Esc' },
  { text: 'Cancel a request with Ctrl+C, or press twice to exit' },
  { text: 'Exit the app with Ctrl+D on an empty line' },
  { text: 'Clear your screen at any time with Ctrl+L' },
  { text: 'Toggle the debug console display with F12' },
  { text: 'Toggle the todo list display with Ctrl+T', relatedFeature: 'todos' },
  { text: 'See full, untruncated responses with Ctrl+O' },
  {
    text: 'Toggle auto-approval (YOLO mode) for all tools with Ctrl+Y',
    relatedFeature: 'settings',
  },
  {
    text: 'Cycle through approval modes (Default, Auto-Edit, Plan) with Shift+Tab',
    relatedFeature: 'plan_mode',
  },
  { text: 'Toggle Markdown rendering (raw markdown mode) with Alt+M' },
  {
    text: 'Toggle shell mode by typing ! in an empty prompt',
    relatedFeature: 'shell',
  },
  { text: 'Insert a newline with a backslash (\\) followed by Enter' },
  { text: 'Navigate your prompt history with the Up and Down arrows' },
  { text: 'You can also use Ctrl+P (up) and Ctrl+N (down) for history' },
  { text: 'Search through command history with Ctrl+R' },
  { text: 'Accept an autocomplete suggestion with Tab or Enter' },
  { text: 'Move to the start of the line with Ctrl+A or Home' },
  { text: 'Move to the end of the line with Ctrl+E or End' },
  { text: 'Move one character left or right with Ctrl+B/F or the arrow keys' },
  { text: 'Move one word left or right with Ctrl+Left/Right Arrow' },
  { text: 'Delete the character to the left with Ctrl+H or Backspace' },
  { text: 'Delete the character to the right with Ctrl+D or Delete' },
  { text: 'Delete the word to the left of the cursor with Ctrl+W' },
  { text: 'Delete the word to the right of the cursor with Ctrl+Delete' },
  { text: 'Delete from the cursor to the start of the line with Ctrl+U' },
  { text: 'Delete from the cursor to the end of the line with Ctrl+K' },
  { text: 'Clear the entire input prompt with a double-press of Esc' },
  { text: 'Paste from your clipboard with Ctrl+V' },
  { text: 'Undo text edits in the input with Alt+Z or Cmd+Z' },
  { text: 'Redo undone text edits with Shift+Alt+Z or Shift+Cmd+Z' },
  { text: 'Open the current prompt in an external editor with Ctrl+G' },
  { text: 'In menus, move up/down with k/j or the arrow keys' },
  { text: 'In menus, select an item by typing its number' },
  {
    text: "If you're using an IDE, see the context with F4",
    relatedFeature: 'ide',
  },
  {
    text: 'Toggle background shells with Ctrl+B or /shells',
    relatedFeature: 'shell',
  },
  {
    text: 'Toggle the background shell process list with Ctrl+L',
    relatedFeature: 'shell',
  },
  // Keyboard shortcut tips end here
  // Command tips start here
  { text: 'Show version info with /about' },
  {
    text: 'Change your authentication method with /auth',
    relatedFeature: 'auth',
  },
  { text: 'File a bug report directly with /bug', relatedFeature: 'bug' },
  {
    text: 'List your saved chat checkpoints with /resume list',
    relatedFeature: 'resume',
  },
  {
    text: 'Save your current conversation with /resume save <tag>',
    relatedFeature: 'resume',
  },
  {
    text: 'Resume a saved conversation with /resume resume <tag>',
    relatedFeature: 'resume',
  },
  {
    text: 'Delete a conversation checkpoint with /resume delete <tag>',
    relatedFeature: 'resume',
  },
  {
    text: 'Share your conversation to a file with /resume share <file>',
    relatedFeature: 'resume',
  },
  { text: 'Clear the screen and history with /clear' },
  { text: 'Save tokens by summarizing the context with /compress' },
  { text: 'Copy the last response to your clipboard with /copy' },
  { text: 'Open the full documentation in your browser with /docs' },
  {
    text: 'Add directories to your workspace with /directory add <path>',
    relatedFeature: 'directory',
  },
  {
    text: 'Show all directories in your workspace with /directory show',
    relatedFeature: 'directory',
  },
  {
    text: 'Use /dir as a shortcut for /directory',
    relatedFeature: 'directory',
  },
  {
    text: 'Set your preferred external editor with /editor',
    relatedFeature: 'editor',
  },
  {
    text: 'List all active extensions with /extensions list',
    relatedFeature: 'extensions',
  },
  {
    text: 'Update all or specific extensions with /extensions update',
    relatedFeature: 'extensions',
  },
  { text: 'Get help on commands with /help' },
  { text: 'Manage IDE integration with /ide', relatedFeature: 'ide' },
  { text: 'Create a project-specific GEMINI.md file with /init' },
  {
    text: 'List configured MCP servers and tools with /mcp list',
    relatedFeature: 'mcp',
  },
  {
    text: 'Authenticate with an OAuth-enabled MCP server with /mcp auth',
    relatedFeature: 'mcp',
  },
  { text: 'Reload MCP servers with /mcp reload', relatedFeature: 'mcp' },
  {
    text: 'See the current instructional context with /memory show',
    relatedFeature: 'memory',
  },
  {
    text: 'Add content to the instructional memory with /memory add',
    relatedFeature: 'memory',
  },
  {
    text: 'Reload instructional context from GEMINI.md files with /memory reload',
    relatedFeature: 'memory',
  },
  {
    text: 'List the paths of the GEMINI.md files in use with /memory list',
    relatedFeature: 'memory',
  },
  { text: 'Choose your Gemini model with /model' },
  { text: 'Display the privacy notice with /privacy' },
  { text: 'Restore project files to a previous state with /restore' },
  { text: 'Exit the CLI with /quit or /exit' },
  { text: 'Check model-specific usage stats with /stats model' },
  { text: 'Check tool-specific usage stats with /stats tools' },
  { text: "Change the CLI's color theme with /theme", relatedFeature: 'theme' },
  { text: 'List all available tools with /tools' },
  {
    text: 'View and edit settings with the /settings editor',
    relatedFeature: 'settings',
  },
  {
    text: 'Toggle Vim keybindings on and off with /vim',
    relatedFeature: 'settings',
  },
  { text: 'Set up GitHub Actions with /setup-github' },
  {
    text: 'Configure terminal keybindings for multiline input with /terminal-setup',
  },
  { text: 'Find relevant documentation with /find-docs' },
  {
    text: 'Execute any shell command with !<command>',
    relatedFeature: 'shell',
  },
  // Command tips end here
];
