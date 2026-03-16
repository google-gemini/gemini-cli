/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { execSync } from 'node:child_process';
import { debugLogger } from '@google/gemini-cli-core';

let activeBot: Bot | null = null;

export async function startRelay(
  botToken: string,
  allowedUserId: string,
): Promise<void> {
  if (activeBot) {
    return;
  }

  const bot = new Bot(botToken);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id?.toString() === allowedUserId) {
      await next();
    }
  });

  bot.on('message:text', async (ctx) => {
    const placeholder = await ctx.reply('·');
    try {
      const reply = execSync(
        `gemini -y -p ${JSON.stringify(ctx.message.text)}`,
        {
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        },
      ).trim();
      await ctx.api.editMessageText(
        ctx.chat.id,
        placeholder.message_id,
        reply || 'Done.',
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message.slice(0, 200) : String(err);
      await ctx.api
        .editMessageText(ctx.chat.id, placeholder.message_id, `Error: ${msg}`)
        .catch(() => undefined);
    }
  });

  bot.on('message', async (ctx) => {
    await ctx.reply('Text only for now.');
  });

  bot.catch((err) => {
    if (err.error instanceof GrammyError) {
      debugLogger.error(`[telegram] Telegram error: ${err.error.description}`);
    } else if (err.error instanceof HttpError) {
      debugLogger.error(`[telegram] HTTP error: ${err.error.message}`);
    } else {
      debugLogger.error(`[telegram] Error: ${err.error}`);
    }
  });

  bot.start().catch((e) => debugLogger.error(`[telegram] Start error: ${e}`));
  activeBot = bot;
}

export async function stopRelay(): Promise<void> {
  if (!activeBot) {
    return;
  }
  await activeBot.stop();
  activeBot = null;
}

export function isRelayRunning(): boolean {
  return activeBot !== null;
}
