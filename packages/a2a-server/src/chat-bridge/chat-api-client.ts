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
   */
  async sendMessage(
    spaceName: string,
    threadName: string,
    options: { text?: string; cardsV2?: ChatCardV2[] },
  ): Promise<string | undefined> {
    try {
      if (!this.initialized) await this.initialize();

      const message: Record<string, unknown> = {};
      if (options.text) message['text'] = options.text;
      if (options.cardsV2) message['cardsV2'] = options.cardsV2;
      message['thread'] = { name: threadName };

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
