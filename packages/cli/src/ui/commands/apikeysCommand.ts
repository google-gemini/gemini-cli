/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  loadApiKeys,
  addApiKey,
  removeApiKey,
  resetBlockedKeys,
  clearAllApiKeys,
} from '@google/gemini-cli-core';

/**
 * Format timestamp to readable date
 */
function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format API key for display (show only first/last 4 chars)
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * List all API keys
 */
async function listApiKeys(
  context: CommandContext,
): Promise<MessageActionReturn> {
  const data = await loadApiKeys();

  if (!data || data.keys.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'No API keys configured.\nUse `/apikeys add <key> [label]` to add your first API key.',
    };
  }

  let output = `**API Keys (${data.keys.length} total)**\n\n`;

  data.keys.forEach((entry, index) => {
    const isCurrent = index === data.currentIndex;
    const status = entry.isBlocked ? '🚫 BLOCKED' : '✓ Active';
    const marker = isCurrent ? '→ ' : '  ';

    output += `${marker}[${index}] ${maskApiKey(entry.key)}\n`;
    if (entry.label) {
      output += `    Label: ${entry.label}\n`;
    }
    output += `    Status: ${status}\n`;
    output += `    Added: ${formatTimestamp(entry.addedAt)}\n`;
    output += `    Last Used: ${formatTimestamp(entry.lastUsed)}\n`;
    output += `    Failures: ${entry.failureCount}\n\n`;
  });

  output += '\n**Commands:**\n';
  output += '• `/apikeys add <key> [label]` - Add a new API key\n';
  output += '• `/apikeys remove <index>` - Remove an API key\n';
  output += '• `/apikeys reset` - Reset all blocked keys\n';
  output += '• `/apikeys clear` - Remove all API keys\n';

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * Add a new API key
 */
async function addApiKeyCommand(
  context: CommandContext,
  args: string,
): Promise<MessageActionReturn> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 1 || !parts[0]) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Usage: /apikeys add <key> [label]\nExample: /apikeys add AIza... "Production Key"',
    };
  }

  const key = parts[0];
  const label = parts.slice(1).join(' ') || undefined;

  try {
    const data = await addApiKey(key, label);
    return {
      type: 'message',
      messageType: 'info',
      content: `✓ API key added successfully!\nTotal keys: ${data.keys.length}\nLabel: ${label || 'None'}`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to add API key: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Remove an API key
 */
async function removeApiKeyCommand(
  context: CommandContext,
  args: string,
): Promise<MessageActionReturn> {
  const index = parseInt(args.trim(), 10);

  if (isNaN(index)) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Usage: /apikeys remove <index>\nUse `/apikeys list` to see key indices.',
    };
  }

  try {
    const data = await removeApiKey(index);
    return {
      type: 'message',
      messageType: 'info',
      content: `✓ API key removed successfully!\nRemaining keys: ${data.keys.length}`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to remove API key: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Reset all blocked keys
 */
async function resetBlockedKeysCommand(
  context: CommandContext,
): Promise<MessageActionReturn> {
  try {
    const data = await resetBlockedKeys();
    if (!data) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No API keys configured.',
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `✓ All blocked keys have been reset!\nTotal keys: ${data.keys.length}`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to reset keys: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clear all API keys
 */
async function clearAllApiKeysCommand(
  context: CommandContext,
): Promise<MessageActionReturn> {
  try {
    await clearAllApiKeys();
    return {
      type: 'message',
      messageType: 'info',
      content: '✓ All API keys have been cleared.',
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to clear API keys: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const apikeysCommand: SlashCommand = {
  name: 'apikeys',
  description: 'Manage multiple API keys with automatic rotation',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      description: 'List all configured API keys',
      kind: CommandKind.BUILT_IN,
      action: listApiKeys,
    },
    {
      name: 'add',
      description: 'Add a new API key',
      kind: CommandKind.BUILT_IN,
      action: addApiKeyCommand,
    },
    {
      name: 'remove',
      description: 'Remove an API key by index',
      kind: CommandKind.BUILT_IN,
      action: removeApiKeyCommand,
    },
    {
      name: 'reset',
      description: 'Reset all blocked keys',
      kind: CommandKind.BUILT_IN,
      action: resetBlockedKeysCommand,
    },
    {
      name: 'clear',
      description: 'Remove all API keys',
      kind: CommandKind.BUILT_IN,
      action: clearAllApiKeysCommand,
    },
  ],
  action: listApiKeys, // Default action when just /apikeys is called
};
