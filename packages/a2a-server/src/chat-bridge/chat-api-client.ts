/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat REST API client for sending proactive messages.
 * Used to push agent responses back to Google Chat after the webhook
 * has already returned an immediate acknowledgment.
 */

import { GoogleAuth } from 'google-auth-library';
import type { ChatCardV2 } from './types.js';
import { logger } from '../utils/logger.js';

const CHAT_API_BASE = 'https://chat.googleapis.com/v1';
/** Google Chat max text length. Leave margin for formatting overhead. */
const MAX_TEXT_LENGTH = 4000;

export interface ChatApiClientConfig {
  /** Path to service account key JSON file. If not set, uses ADC. */
  serviceAccountKeyPath?: string;
}

export class ChatApiClient {
  private auth: GoogleAuth;
  private initialized = false;

  constructor(config?: ChatApiClientConfig) {
    this.auth = new GoogleAuth({
      keyFile: config?.serviceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/chat.bot'],
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.auth.getClient();
    this.initialized = true;
    logger.info('[ChatApiClient] Initialized with chat.bot scope');
  }

  /**
   * Sends a new message to a Google Chat space in a specific thread.
   * Automatically splits text longer than 4000 chars into multiple messages.
   */
  async sendMessage(
    spaceName: string,
    threadName: string,
    options: { text?: string; cardsV2?: ChatCardV2[] },
  ): Promise<string | undefined> {
    if (!this.initialized) await this.initialize();

    const chunks = options.text ? splitText(options.text) : [''];

    // First chunk gets the cards (if any). Subsequent chunks are text-only.
    let lastMessageName: string | undefined;
    for (let i = 0; i < chunks.length; i++) {
      const message: Record<string, unknown> = {};
      if (chunks[i]) message['text'] = chunks[i];
      if (i === 0 && options.cardsV2) message['cardsV2'] = options.cardsV2;
      message['thread'] = { name: threadName };

      const name = await this.postMessage(spaceName, message);
      if (name) lastMessageName = name;
    }

    return lastMessageName;
  }

  /** Posts a single message to the Chat API. */
  private async postMessage(
    spaceName: string,
    message: Record<string, unknown>,
  ): Promise<string | undefined> {
    try {
      const url =
        `${CHAT_API_BASE}/${spaceName}/messages` +
        `?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;

      const client = await this.auth.getClient();
      const headers = await client.getRequestHeaders();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(
          `[ChatApiClient] sendMessage failed: ${response.status} ${body}`,
        );
        return undefined;
      }

      const result: unknown = await response.json();
      let messageName: string | undefined;
      if (typeof result === 'object' && result !== null && 'name' in result) {
        const rec = result as Record<string, unknown>;
        if (typeof rec['name'] === 'string') {
          messageName = rec['name'];
        }
      }

      logger.info(
        `[ChatApiClient] Message sent to ${spaceName}: ${messageName ?? 'unknown'}`,
      );
      return messageName;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatApiClient] sendMessage error: ${msg}`, error);
      return undefined;
    }
  }

  /**
   * Updates an existing message in Google Chat.
   */
  async updateMessage(
    messageName: string,
    options: { text?: string; cardsV2?: ChatCardV2[] },
  ): Promise<void> {
    try {
      if (!this.initialized) await this.initialize();

      const message: Record<string, unknown> = {};
      const updateMasks: string[] = [];

      if (options.text) {
        message['text'] = options.text;
        updateMasks.push('text');
      }
      if (options.cardsV2) {
        message['cardsV2'] = options.cardsV2;
        updateMasks.push('cardsV2');
      }

      const url = `${CHAT_API_BASE}/${messageName}?updateMask=${updateMasks.join(',')}`;

      const client = await this.auth.getClient();
      const headers = await client.getRequestHeaders();

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(
          `[ChatApiClient] updateMessage failed: ${response.status} ${body}`,
        );
      } else {
        logger.info(`[ChatApiClient] Message updated: ${messageName}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatApiClient] updateMessage error: ${msg}`, error);
    }
  }
}

/**
 * Splits text into chunks that fit within Google Chat's character limit.
 * Splits on paragraph boundaries (double newline) first, then single
 * newlines, then hard-splits as a last resort.
 */
function splitText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_TEXT_LENGTH) {
    let splitAt = -1;

    // Try splitting at a paragraph boundary
    const paraIdx = remaining.lastIndexOf('\n\n', MAX_TEXT_LENGTH);
    if (paraIdx > MAX_TEXT_LENGTH * 0.3) {
      splitAt = paraIdx + 2; // include the double newline in the first chunk
    }

    // Fall back to single newline
    if (splitAt < 0) {
      const lineIdx = remaining.lastIndexOf('\n', MAX_TEXT_LENGTH);
      if (lineIdx > MAX_TEXT_LENGTH * 0.3) {
        splitAt = lineIdx + 1;
      }
    }

    // Hard split as last resort
    if (splitAt < 0) {
      splitAt = MAX_TEXT_LENGTH;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
