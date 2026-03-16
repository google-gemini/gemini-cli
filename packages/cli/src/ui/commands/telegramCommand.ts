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
import { MessageType } from '../types.js';
import { startRelay, stopRelay, isRelayRunning } from '../../telegram/relay.js';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.gemini', 'telegram');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

interface TelegramConfig {
  botToken: string;
  allowedUserId: string;
}

function loadConfig(): TelegramConfig | null {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    const lines: string[] = data.trim().split('\n');
    const botToken: string | undefined = lines[0]?.trim();
    const allowedUserId: string | undefined = lines[1]?.trim();
    if (botToken && allowedUserId) {
      return { botToken, allowedUserId };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveConfig(config: TelegramConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, `${config.botToken}\n${config.allowedUserId}`);
}

function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    try {
      unlinkSync(CONFIG_FILE);
    } catch {
      // Ignore errors
    }
  }
}

async function startAction(
  context: CommandContext,
  args: string,
): Promise<void> {
  const telegramConfig = loadConfig();

  if (isRelayRunning()) {
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Telegram relay is already running.',
    });
    return;
  }

  // If args provided, treat as token configuration
  if (args?.trim()) {
    const parts = args.trim().split(/\s+/);
    if (parts.length >= 2) {
      const [botToken, allowedUserId] = parts;
      saveConfig({ botToken, allowedUserId });
      await startRelay(botToken, allowedUserId);
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'Telegram relay online — your bot is now listening. Type /telegram stop to stop it.',
      });
      return;
    }
  }

  // If no args but config exists, start with saved config
  if (telegramConfig) {
    await startRelay(telegramConfig.botToken, telegramConfig.allowedUserId);
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Telegram relay online — your bot is now listening. Type /telegram stop to stop it.',
    });
    return;
  }

  // No config, show setup instructions
  context.ui.addItem({
    type: MessageType.INFO,
    text: `Telegram relay setup required.

1. Open Telegram → search @BotFather → /newbot → copy the token
2. Open Telegram → search @userinfobot → copy your numeric ID
3. Run: /telegram start YOUR_BOT_TOKEN YOUR_USER_ID`,
  });
}

async function stopAction(context: CommandContext): Promise<void> {
  await stopRelay();
  context.ui.addItem({
    type: MessageType.INFO,
    text: 'Telegram relay stopped.',
  });
}

async function resetAction(context: CommandContext): Promise<void> {
  await stopRelay();
  clearConfig();
  context.ui.addItem({
    type: MessageType.INFO,
    text: 'Telegram config cleared — run /telegram start to set up again.',
  });
}

export const telegramCommand: SlashCommand = {
  name: 'telegram',
  description:
    'Start a Telegram bot relay. Usage: /telegram start | /telegram stop | /telegram reset',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext) => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: `Telegram relay commands:
/telegram start - Start relay (add token and user_id to configure)
/telegram stop - Stop relay
/telegram reset - Clear saved config

Examples:
/telegram start BOT_TOKEN USER_ID
/telegram start (uses saved config)`,
    });
  },
  subCommands: [
    {
      name: 'start',
      description:
        'Start the Telegram relay. Usage: /telegram start [BOT_TOKEN] [USER_ID]',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext, args: string) => {
        await startAction(context, args);
      },
    },
    {
      name: 'stop',
      description: 'Stop the Telegram relay',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await stopAction(context);
      },
    },
    {
      name: 'reset',
      description: 'Clear saved Telegram config',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await resetAction(context);
      },
    },
  ],
};
