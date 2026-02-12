/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Express routes for the Google Chat bridge webhook.
 * Adds a POST /chat/webhook endpoint to the existing Express app.
 */

import type { Router, Request, Response } from 'express';
import { Router as createRouter } from 'express';
import type { ChatEvent, ChatBridgeConfig } from './types.js';
import { ChatBridgeHandler } from './handler.js';
import { logger } from '../utils/logger.js';

/**
 * Creates Express routes for the Google Chat bridge.
 */
export function createChatBridgeRoutes(config: ChatBridgeConfig): Router {
  const router = createRouter();
  const handler = new ChatBridgeHandler(config);

  // Google Chat sends webhook events as POST requests
  router.post('/chat/webhook', async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const event = req.body as ChatEvent;

      if (!event || !event.type) {
        res.status(400).json({ error: 'Invalid event: missing type field' });
        return;
      }

      logger.info(`[ChatBridge] Webhook received: type=${event.type}`);

      const response = await handler.handleEvent(event);
      res.json(response);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[ChatBridge] Webhook error: ${errorMsg}`, error);
      res.status(500).json({
        text: `Internal error: ${errorMsg}`,
      });
    }
  });

  // Health check endpoint for the chat bridge
  router.get('/chat/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      bridge: 'google-chat',
      a2aServerUrl: config.a2aServerUrl,
    });
  });

  return router;
}
