/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import { loadSettings, SettingScope } from '../../config/settings.js';

const STATE_ICONS: Record<string, string> = {
  running: '\u{1F7E2}', // 🟢
  starting: '\u{1F7E1}', // 🟡
  stopped: '\u{26AA}', // ⚪
  failed: '\u{1F534}', // 🔴
};

async function showStatus(
  context: CommandContext,
): Promise<MessageActionReturn> {
  const config = context.services.agentContext?.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not available.',
    };
  }

  if (!config.isLspEnabled()) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'LSP is disabled. Enable it in settings:\n' +
        '```json\n{ "tools": { "lsp": { "enabled": true } } }\n```\n' +
        'Restart the CLI to apply.',
    };
  }

  const lspManager = await config.getLspManager();
  if (!lspManager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'LSP manager not available.',
    };
  }

  const statuses = lspManager.getStatus();
  const settings = lspManager.getSettings();

  const lines: string[] = ['**LSP Integration Status**\n'];

  // Servers section
  lines.push('**Servers:**');
  if (statuses.length === 0) {
    lines.push('  No language servers configured.');
  } else {
    for (const s of statuses) {
      const icon = STATE_ICONS[s.state] ?? '?';
      const langs = s.languageIds.join(', ');
      let line = `${icon} **${s.id}** (${langs})`;

      if (s.state === 'running') {
        line += ` — ${s.filesTracked} files tracked, ${s.diagnosticsCached} diagnostics cached`;
        if (s.projectRoot) {
          line += `\n   Root: \`${s.projectRoot}\``;
        }
      } else if (s.state === 'failed') {
        line += ' — **failed to start**';
        if (s.error) {
          line += `\n   Error: ${s.error}`;
        }
        line += `\n   Command: \`${s.command} ${s.args.join(' ')}\``;
        line += getInstallHint(s.id);
      } else if (s.state === 'stopped') {
        line += ' — not started (will start on first use)';
        line += `\n   Command: \`${s.command} ${s.args.join(' ')}\``;
      }

      lines.push(line);
    }
  }

  // Settings section
  lines.push('\n**Settings:**');
  lines.push(`  Diagnostic timeout: ${settings.diagnosticTimeout}ms`);
  lines.push(`  Max servers: ${settings.maxServers}`);

  return { type: 'message', messageType: 'info', content: lines.join('\n') };
}

function getInstallHint(serverId: string): string {
  const hints: Record<string, string> = {
    typescript:
      '\n   Install: `npm install -g typescript-language-server typescript`',
    pyright: '\n   Install: `pip install pyright` or `npm install -g pyright`',
    gopls: '\n   Install: `go install golang.org/x/tools/gopls@latest`',
    'rust-analyzer': '\n   Install: `rustup component add rust-analyzer`',
  };
  return hints[serverId] ?? '';
}

const statusSubCommand: SlashCommand = {
  name: 'status',
  description: 'Show LSP server status and configuration.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<MessageActionReturn> =>
    showStatus(context),
};

const restartSubCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart all LSP language servers.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<MessageActionReturn> => {
    const config = context.services.agentContext?.config;
    if (!config?.isLspEnabled()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'LSP is not enabled.',
      };
    }

    const lspManager = await config.getLspManager();
    if (!lspManager) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'LSP manager not available.',
      };
    }

    context.ui.addItem(
      { type: 'info', text: 'Restarting LSP servers...' },
      Date.now(),
    );
    await lspManager.restart();

    return showStatus(context);
  },
};

const addSubCommand: SlashCommand = {
  name: 'add',
  description: 'Add a custom LSP server. Usage: /lsp add <id> <command>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    // Parse: /lsp add <id> <command> [args...] [--languages lang1,lang2]
    const tokens = args.trim().split(/\s+/);
    if (tokens.length < 2) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: `/lsp add <id> <command> [args...] [--languages lang1,lang2]`\n\n' +
          'Example: `/lsp add gopls gopls --languages go`',
      };
    }

    const id = tokens[0];
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Server ID must contain only letters, numbers, hyphens, and underscores.',
      };
    }

    let languages: string[] | undefined;
    const commandTokens: string[] = [];

    // Parse tokens, extracting --languages flag.
    let i = 1;
    while (i < tokens.length) {
      if (tokens[i] === '--languages' && i + 1 < tokens.length) {
        languages = tokens[i + 1].split(',').map((s) => s.trim());
        i += 2;
      } else {
        commandTokens.push(tokens[i]);
        i++;
      }
    }

    if (commandTokens.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'A command is required after the server ID.',
      };
    }

    const command = commandTokens[0];
    const serverArgs = commandTokens.slice(1);

    // Build server config.
    const serverConfig: Record<string, unknown> = { command };
    if (serverArgs.length > 0) {
      serverConfig['args'] = serverArgs;
    }
    if (languages && languages.length > 0) {
      serverConfig['languages'] = languages;
    }

    // Write to user settings only — don't leak workspace servers into user scope.
    try {
      const settings = loadSettings(process.cwd());
      const userSettings = settings.forScope(SettingScope.User).settings;
      const existingServers = userSettings.tools?.lsp?.servers ?? {};
      const servers = { ...existingServers, [id]: serverConfig };
      settings.setValue(SettingScope.User, 'tools.lsp.servers', servers);
    } catch (e) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save settings: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const langNote =
      languages && languages.length > 0
        ? ` for ${languages.join(', ')} files`
        : '';
    const msg = `Added LSP server **${id}**${langNote}. Restart the CLI to apply.`;

    return { type: 'message', messageType: 'info', content: msg };
  },
};

const removeSubCommand: SlashCommand = {
  name: 'remove',
  description: 'Remove a custom LSP server. Usage: /lsp remove <id>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (
    _context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const id = args.trim();
    if (!id) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: `/lsp remove <id>`',
      };
    }

    try {
      const settings = loadSettings(process.cwd());
      const userSettings = settings.forScope(SettingScope.User).settings;
      const existingServers = userSettings.tools?.lsp?.servers ?? {};

      if (!existingServers[id]) {
        // Check if it's a built-in server the user is trying to remove.
        const BUILTIN_IDS = ['typescript', 'pyright', 'gopls', 'rust-analyzer'];
        if (BUILTIN_IDS.includes(id)) {
          return {
            type: 'message',
            messageType: 'info',
            content:
              `**${id}** is a built-in server. To disable it, add to your settings:\n` +
              '```json\n' +
              `{ "tools": { "lsp": { "servers": { "${id}": { "enabled": false } } } } }\n` +
              '```',
          };
        }
        return {
          type: 'message',
          messageType: 'error',
          content: `Server **${id}** not found in user settings. Run \`/lsp status\` to see configured servers.`,
        };
      }

      const servers = { ...existingServers };
      delete servers[id];
      settings.setValue(SettingScope.User, 'tools.lsp.servers', servers);
    } catch (e) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save settings: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Removed LSP server **${id}**. Restart the CLI to apply.`,
    };
  },
};

export const lspCommand: SlashCommand = {
  name: 'lsp',
  description: 'Manage Language Server Protocol integration.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    statusSubCommand,
    restartSubCommand,
    addSubCommand,
    removeSubCommand,
  ],
  action: async (context: CommandContext): Promise<MessageActionReturn> =>
    showStatus(context),
};
