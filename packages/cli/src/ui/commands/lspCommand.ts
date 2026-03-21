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

const STATE_ICONS: Record<string, string> = {
  running: '\u{1F7E2}', // 🟢
  starting: '\u{1F7E1}', // 🟡
  stopped: '\u{26AA}', // ⚪
  failed: '\u{1F534}', // 🔴
};

async function showStatus(
  context: CommandContext,
): Promise<MessageActionReturn> {
  const config = context.services.config;
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
        'LSP integration is **disabled**.\n\n' +
        'To enable it, add to your settings:\n' +
        '```json\n{ "tools": { "lsp": { "enabled": true } } }\n```\n' +
        'Then restart the CLI.',
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
  switch (serverId) {
    case 'typescript':
      return '\n   Install: `npm install -g typescript-language-server typescript`';
    case 'pyright':
      return '\n   Install: `pip install pyright` or `npm install -g pyright`';
    default:
      return '';
  }
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
    const config = context.services.config;
    if (!config?.isLspEnabled()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'LSP is not enabled.',
      };
    }

    await config.shutdownLsp();
    return {
      type: 'message',
      messageType: 'info',
      content: 'All LSP servers shut down. They will restart on next use.',
    };
  },
};

export const lspCommand: SlashCommand = {
  name: 'lsp',
  description: 'Show Language Server Protocol status.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [statusSubCommand, restartSubCommand],
  action: async (context: CommandContext): Promise<MessageActionReturn> =>
    showStatus(context),
};
