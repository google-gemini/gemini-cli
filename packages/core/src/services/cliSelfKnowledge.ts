/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CliSelfKnowledge , authoritative, structured reference data about the
 * Gemini CLI's own capabilities (flags, hotkeys, slash commands), derived
 * from the runtime source of truth rather than static documentation.
 *
 * Consumed by the `get_cli_reference` tool so that the `cli_help` subagent
 * can answer user questions without hallucinating deprecated or non-existent
 * flags, hotkeys, or commands.
 */

// ---------------------------------------------------------------------------
// CLI flags , kept in sync with packages/cli/src/config/config.ts (yargs)
// ---------------------------------------------------------------------------

export interface CliFlagEntry {
  flag: string;
  alias?: string;
  type: 'boolean' | 'string' | 'array';
  description: string;
  deprecatedBy?: string;
}

export const CLI_FLAGS: readonly CliFlagEntry[] = [
  { flag: '--model', alias: '-m', type: 'string', description: 'Select the model to use.' },
  { flag: '--prompt', alias: '-p', type: 'string', description: 'Run in non-interactive (headless) mode with the given prompt.' },
  { flag: '--prompt-interactive', alias: '-i', type: 'string', description: 'Execute a prompt then continue interactively.' },
  { flag: '--sandbox', alias: '-s', type: 'boolean', description: 'Run inside a sandboxed environment.' },
  { flag: '--yolo', alias: '-y', type: 'boolean', description: 'Auto-accept all tool actions.', deprecatedBy: '--approval-mode=yolo' },
  { flag: '--approval-mode', type: 'string', description: 'Set approval mode. Choices: default, auto_edit, yolo, plan.' },
  { flag: '--debug', alias: '-d', type: 'boolean', description: 'Run in debug mode (F12 opens debug console).' },
  { flag: '--resume', alias: '-r', type: 'string', description: 'Resume a previous session. "latest" or index number.' },
  { flag: '--session-id', type: 'string', description: 'Start a new session with a given UUID.' },
  { flag: '--session-file', type: 'string', description: 'Load a session from a JSON file.' },
  { flag: '--list-sessions', type: 'boolean', description: 'List available sessions and exit.' },
  { flag: '--delete-session', type: 'string', description: 'Delete a session by index.' },
  { flag: '--output-format', alias: '-o', type: 'string', description: 'Output format. Choices: text, json, stream-json.' },
  { flag: '--policy', type: 'array', description: 'Additional policy files or directories to load.' },
  { flag: '--admin-policy', type: 'array', description: 'Additional admin policy files or directories.' },
  { flag: '--extensions', alias: '-e', type: 'array', description: 'Restrict which extensions to use.' },
  { flag: '--list-extensions', alias: '-l', type: 'boolean', description: 'List all extensions and exit.' },
  { flag: '--include-directories', type: 'array', description: 'Additional workspace directories.' },
  { flag: '--screen-reader', type: 'boolean', description: 'Enable screen reader accessibility mode.' },
  { flag: '--worktree', alias: '-w', type: 'string', description: 'Start in a new git worktree (requires experimental.worktrees).' },
  { flag: '--skip-trust', type: 'boolean', description: 'Trust the current workspace for this session.' },
  { flag: '--acp', type: 'boolean', description: 'Start in ACP (Agent Communication Protocol) mode.' },
  { flag: '--allowed-mcp-server-names', type: 'array', description: 'Restrict allowed MCP server names.' },
  { flag: '--allowed-tools', type: 'array', description: 'Tools allowed without confirmation.', deprecatedBy: '--policy (Policy Engine)' },
  { flag: '--raw-output', type: 'boolean', description: 'Disable output sanitization (security risk).' },
  { flag: '--accept-raw-output-risk', type: 'boolean', description: 'Suppress --raw-output security warning.' },
  { flag: '--version', alias: '-v', type: 'boolean', description: 'Show version number and exit.' },
  { flag: '--help', alias: '-h', type: 'boolean', description: 'Show help and exit.' },
];

// ---------------------------------------------------------------------------
// Keyboard shortcuts , derived from packages/cli/src/ui/key/keyBindings.ts
// ---------------------------------------------------------------------------

export interface HotkeyEntry {
  action: string;
  keys: string[];
  context: string;
  description: string;
}

export const KEYBOARD_SHORTCUTS: readonly HotkeyEntry[] = [
  { action: 'Confirm', keys: ['Enter'], context: 'Global', description: 'Confirm selection.' },
  { action: 'Cancel / Dismiss', keys: ['Escape', 'Ctrl+['], context: 'Global', description: 'Dismiss dialogs or cancel focus.' },
  { action: 'Interrupt / Quit', keys: ['Ctrl+C'], context: 'Global', description: 'Cancel current request or quit when input is empty.' },
  { action: 'Exit', keys: ['Ctrl+D'], context: 'Global', description: 'Exit when input buffer is empty.' },
  { action: 'Submit prompt', keys: ['Enter'], context: 'Text Input', description: 'Submit current prompt.' },
  { action: 'Queue message', keys: ['Tab'], context: 'Text Input', description: 'Queue prompt for after current task.' },
  { action: 'Insert newline', keys: ['Shift+Enter', 'Ctrl+Enter', 'Ctrl+J'], context: 'Text Input', description: 'Newline without submitting.' },
  { action: 'Open external editor', keys: ['Ctrl+G', 'Ctrl+Shift+G'], context: 'Text Input', description: 'Open prompt in external editor.' },
  { action: 'Paste', keys: ['Ctrl+V', 'Cmd+V', 'Alt+V'], context: 'Text Input', description: 'Paste from clipboard.' },
  { action: 'Toggle YOLO mode', keys: ['Ctrl+Y'], context: 'App', description: 'Toggle auto-approval mode.' },
  { action: 'Cycle approval mode', keys: ['Shift+Tab'], context: 'App', description: 'Cycle: default -> auto_edit -> plan.' },
  { action: 'Toggle Markdown', keys: ['Alt+M'], context: 'App', description: 'Toggle Markdown rendering.' },
  { action: 'Toggle mouse mode', keys: ['Ctrl+S'], context: 'App', description: 'Toggle mouse scrolling/clicking.' },
  { action: 'Toggle copy mode', keys: ['F9'], context: 'App', description: 'Toggle copy mode (alternate buffer).' },
  { action: 'Debug console', keys: ['F12'], context: 'App', description: 'Toggle error details console.' },
  { action: 'TODO list', keys: ['Ctrl+T'], context: 'App', description: 'Toggle full TODO list.' },
  { action: 'Expand/collapse', keys: ['Ctrl+O'], context: 'App', description: 'Expand or collapse content blocks.' },
  { action: 'Focus shell', keys: ['Tab'], context: 'App', description: 'Move focus to active shell.' },
  { action: 'Unfocus shell', keys: ['Shift+Tab'], context: 'Shell', description: 'Return focus to Gemini.' },
  { action: 'Clear screen', keys: ['Ctrl+L'], context: 'App', description: 'Clear terminal and redraw UI.' },
  { action: 'Restart', keys: ['R', 'Shift+R'], context: 'App (idle)', description: 'Restart the application.' },
  { action: 'Suspend', keys: ['Ctrl+Z'], context: 'App', description: 'Suspend CLI to background.' },
  { action: 'Voice push-to-talk', keys: ['Space'], context: 'Voice Mode', description: 'Hold to speak.' },
  { action: 'Scroll up/down', keys: ['Shift+Up', 'Shift+Down'], context: 'Scrolling', description: 'Scroll content.' },
  { action: 'Page up/down', keys: ['PageUp', 'PageDown'], context: 'Scrolling', description: 'Scroll by one page.' },
  { action: 'Scroll to top/bottom', keys: ['Ctrl+Home', 'Ctrl+End'], context: 'Scrolling', description: 'Jump to start or end.' },
  { action: 'History prev/next', keys: ['Ctrl+P', 'Ctrl+N'], context: 'History', description: 'Navigate prompt history.' },
  { action: 'Reverse search', keys: ['Ctrl+R'], context: 'History', description: 'Search through prompt history.' },
  { action: 'Toggle background shell', keys: ['Ctrl+B'], context: 'Background Shell', description: 'Show/hide background shell.' },
  { action: 'Background shell list', keys: ['Ctrl+L'], context: 'Background Shell', description: 'Toggle background shell list.' },
  { action: 'Kill background shell', keys: ['Ctrl+K'], context: 'Background Shell', description: 'Kill active background shell.' },
  { action: 'Undo', keys: ['Ctrl+Z', 'Cmd+Z', 'Alt+Z'], context: 'Editing', description: 'Undo last edit.' },
  { action: 'Redo', keys: ['Ctrl+Shift+Z', 'Cmd+Shift+Z'], context: 'Editing', description: 'Redo last undone edit.' },
];

// ---------------------------------------------------------------------------
// Slash commands , from packages/cli/src/services/BuiltinCommandLoader.ts
// ---------------------------------------------------------------------------

export interface SlashCommandEntry {
  name: string;
  description: string;
  requiresAgents?: boolean;
  devOnly?: boolean;
}

export const SLASH_COMMANDS: readonly SlashCommandEntry[] = [
  { name: 'help', description: 'Show the help menu.' },
  { name: 'shortcuts', description: 'Show keyboard shortcuts reference.' },
  { name: 'commands', description: 'List all available slash commands.' },
  { name: 'about', description: 'Show version and environment info.' },
  { name: 'model', description: 'Switch the active model.' },
  { name: 'chat', description: 'Manage chat sessions (share, checkpoints).' },
  { name: 'resume', description: 'Resume a previous session.' },
  { name: 'clear', description: 'Clear conversation history.' },
  { name: 'compress', description: 'Summarize chat history to save tokens.' },
  { name: 'copy', description: 'Copy last response to clipboard.' },
  { name: 'bug', description: 'File a bug report with diagnostics.' },
  { name: 'auth', description: 'Manage authentication (login/logout).' },
  { name: 'docs', description: 'Open documentation in browser.' },
  { name: 'editor', description: 'Configure external text editor.' },
  { name: 'extensions', description: 'Manage installed extensions.' },
  { name: 'mcp', description: 'Manage MCP servers.' },
  { name: 'memory', description: 'Manage the auto-memory system.' },
  { name: 'permissions', description: 'Manage workspace folder trust.' },
  { name: 'plan', description: 'Enter or manage plan mode.' },
  { name: 'policies', description: 'View active policy rules.' },
  { name: 'privacy', description: 'Open the privacy notice.' },
  { name: 'settings', description: 'Open the settings dialog.' },
  { name: 'stats', description: 'Show token usage and session statistics.' },
  { name: 'theme', description: 'Change terminal color theme.' },
  { name: 'tools', description: 'List all available tools.' },
  { name: 'skills', description: 'Manage agent skills.', requiresAgents: true },
  { name: 'agents', description: 'List and configure agents.', requiresAgents: true },
  { name: 'tasks', description: 'View and manage tracked tasks.' },
  { name: 'vim', description: 'Toggle vim-style keybindings.' },
  { name: 'init', description: 'Initialize a GEMINI.md project context file.' },
  { name: 'hooks', description: 'View and manage lifecycle hooks.' },
  { name: 'restore', description: 'Restore files from a checkpoint.' },
  { name: 'export', description: 'Export current session to JSON.' },
  { name: 'quit', description: 'Quit Gemini CLI.' },
  { name: 'voice', description: 'Toggle voice input mode.' },
  { name: 'upgrade', description: 'Show account upgrade options.' },
  { name: 'corgi', description: 'Toggle corgi mode.' },
  { name: 'ide', description: 'Check or configure IDE integration.' },
  { name: 'setup-github', description: 'Set up GitHub integration.' },
  { name: 'terminal-setup', description: 'Configure terminal integration.' },
  { name: 'profile', description: 'Show developer profiling info.', devOnly: true },
];

// ---------------------------------------------------------------------------
// Reference formatting & retrieval
// ---------------------------------------------------------------------------

export type CliReferenceCategory = 'flags' | 'hotkeys' | 'commands' | 'all';

export function formatFlagsReference(): string {
  const lines: string[] = ['# Gemini CLI Flags Reference\n', 'Usage: `gemini [options] [query..]`\n'];
  for (const f of CLI_FLAGS) {
    const alias = f.alias ? ` (${f.alias})` : '';
    const dep = f.deprecatedBy ? ` ⚠️ DEPRECATED, use ${f.deprecatedBy}` : '';
    lines.push(`- **\`${f.flag}\`**${alias} [${f.type}]: ${f.description}${dep}`);
  }
  lines.push('\n> **Important:** `--yolo` is deprecated. Use `--approval-mode=yolo` instead.');
  lines.push('> Sub-commands: `gemini mcp`, `gemini extensions`, `gemini skills`, `gemini hooks`, `gemini gemma`.');
  return lines.join('\n');
}

export function formatHotkeysReference(): string {
  const lines: string[] = ['# Gemini CLI Keyboard Shortcuts Reference\n'];
  const byCtx = new Map<string, HotkeyEntry[]>();
  for (const h of KEYBOARD_SHORTCUTS) {
    const g = byCtx.get(h.context) ?? [];
    g.push(h);
    byCtx.set(h.context, g);
  }
  for (const [ctx, entries] of byCtx) {
    lines.push(`\n## ${ctx}\n`);
    for (const e of entries) {
      lines.push(`- **${e.action}**: \`${e.keys.join('` / `')}\`, ${e.description}`);
    }
  }
  return lines.join('\n');
}

export function formatCommandsReference(): string {
  const lines: string[] = ['# Gemini CLI Slash Commands Reference\n', 'Type a command in the prompt to execute it.\n'];
  for (const c of SLASH_COMMANDS) {
    const tags: string[] = [];
    if (c.requiresAgents) tags.push('agents required');
    if (c.devOnly) tags.push('dev-only');
    const t = tags.length > 0 ? ` _(${tags.join(', ')})_` : '';
    lines.push(`- **\`/${c.name}\`**: ${c.description}${t}`);
  }
  return lines.join('\n');
}

export function getCliReference(category: CliReferenceCategory): string {
  switch (category) {
    case 'flags': return formatFlagsReference();
    case 'hotkeys': return formatHotkeysReference();
    case 'commands': return formatCommandsReference();
    case 'all': return [formatFlagsReference(), '\n---\n', formatHotkeysReference(), '\n---\n', formatCommandsReference()].join('\n');
    default: return formatFlagsReference();
  }
}
