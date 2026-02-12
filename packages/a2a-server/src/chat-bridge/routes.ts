/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Express routes for the Google Chat bridge webhook.
 * Adds a POST /chat/webhook endpoint to the existing Express app.
 * Includes JWT verification for Google Chat requests when configured.
 */

import type { Router, Request, Response, NextFunction } from 'express';
import { Router as createRouter } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { ChatEvent, ChatBridgeConfig } from './types.js';
import { ChatBridgeHandler } from './handler.js';
import { logger } from '../utils/logger.js';

const CHAT_ISSUER = 'chat@system.gserviceaccount.com';

/**
 * Creates middleware that verifies Google Chat JWT tokens.
 *
 * On Cloud Run (detected via K_SERVICE env var), authentication is handled by
 * Cloud Run's IAM layer — only principals with roles/run.invoker can reach the
 * container. Cloud Run strips the Authorization header after validation, so our
 * middleware cannot re-verify the token. We trust Cloud Run's IAM instead.
 *
 * When NOT on Cloud Run and projectNumber is set, requests must include a valid
 * Bearer token signed by Google Chat with the correct audience.
 *
 * When neither condition applies, verification is skipped (local testing).
 */
function createAuthMiddleware(
  projectNumber: string | undefined,
): (req: Request, res: Response, next: NextFunction) => void {
  // On Cloud Run, IAM handles auth — the Authorization header is stripped
  // before reaching the container, so we cannot verify it ourselves.
  if (process.env['K_SERVICE']) {
    logger.info(
      '[ChatBridge] Running on Cloud Run — auth delegated to Cloud Run IAM.',
    );
    return (_req: Request, _res: Response, next: NextFunction) => {
      next();
    };
  }

  if (!projectNumber) {
    logger.warn(
      '[ChatBridge] CHAT_PROJECT_NUMBER not set — JWT verification disabled. ' +
        'Set it in production to verify requests come from Google Chat.',
    );
    return (_req: Request, _res: Response, next: NextFunction) => {
      next();
    };
  }

  const authClient = new OAuth2Client();

  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('[ChatBridge] Missing or invalid Authorization header');
      res.status(401).json({ error: 'Unauthorized: missing Bearer token' });
      return;
    }

    const token = authHeader.substring(7);
    authClient
      .verifyIdToken({
        idToken: token,
        audience: projectNumber,
      })
      .then((ticket) => {
        const payload = ticket.getPayload();
        if (payload?.iss !== CHAT_ISSUER) {
          logger.warn(
            `[ChatBridge] Invalid token issuer: ${payload?.iss ?? 'unknown'}`,
          );
          res.status(403).json({ error: 'Forbidden: invalid token issuer' });
          return;
        }
        next();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`[ChatBridge] Token verification failed: ${msg}`);
        res.status(401).json({ error: 'Unauthorized: invalid token' });
      });
  };
}

/**
 * Creates Express routes for the Google Chat bridge.
 */
export function createChatBridgeRoutes(config: ChatBridgeConfig): Router {
  const router = createRouter();
  const handler = new ChatBridgeHandler(config);
  const authMiddleware = createAuthMiddleware(config.projectNumber);

  // Google Chat sends webhook events as POST requests
  router.post(
    '/chat/webhook',
    authMiddleware,
    async (req: Request, res: Response) => {
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
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[ChatBridge] Webhook error: ${errorMsg}`, error);
        res.status(500).json({
          text: `Internal error: ${errorMsg}`,
        });
      }
    },
  );

  // Health check endpoint for the chat bridge (no auth required)
  router.get('/chat/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      bridge: 'google-chat',
      a2aServerUrl: config.a2aServerUrl,
    });
  });

  return router;
}
