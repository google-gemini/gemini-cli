/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat REST API client for pushing messages to spaces.
 */

import { GoogleAuth } from 'google-auth-library';
import { logger } from '../utils/logger.js';

const CHAT_API_BASE = 'https://chat.googleapis.com/v1';
const MAX_TEXT_LENGTH = 4000;

export class ChatApiClient {
  private auth: GoogleAuth;
  private initialized = false;

  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/chat.bot'],
    });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    await this.auth.getClient();
    this.initialized = true;
    logger.info('[ChatApi] Initialized');
  }

  async sendMessage(
    spaceName: string,
    threadName: string,
    options: { text?: string },
  ): Promise<void> {
    await this.init();

    const chunks = options.text ? splitText(options.text) : [''];

    for (const chunk of chunks) {
      const message: Record<string, unknown> = {};
      if (chunk) message['text'] = chunk;
      if (threadName) {
        message['thread'] = { name: threadName };
      }

      await this.postMessage(spaceName, message);
    }
  }

  private async postMessage(
    spaceName: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    try {
      const url =
        `${CHAT_API_BASE}/${spaceName}/messages` +
        `?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;

      const client = await this.auth.getClient();
      const headers = await client.getRequestHeaders();

      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`[ChatApi] Send failed: ${response.status} ${body}`);
      } else {
        logger.info(`[ChatApi] Message sent to ${spaceName}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatApi] Error: ${msg}`);
    }
  }
}

function splitText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_TEXT_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n\n', MAX_TEXT_LENGTH);
    if (splitAt < MAX_TEXT_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH);
    }
    if (splitAt < MAX_TEXT_LENGTH * 0.3) {
      splitAt = MAX_TEXT_LENGTH;
    }
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
