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
import type { ChatEvent, ChatBridgeConfig, ChatResponse } from './types.js';
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

    // Debug: decode token payload without verification to inspect claims
    try {
      const payloadB64 = token.split('.')[1];
      if (payloadB64) {
        const decoded = JSON.parse(
          Buffer.from(payloadB64, 'base64').toString(),
        );
        logger.info(
          `[ChatBridge] Token claims: iss=${String(decoded.iss ?? 'none')} ` +
            `aud=${String(decoded.aud ?? 'none')} ` +
            `email=${String(decoded.email ?? 'none')} ` +
            `sub=${String(decoded.sub ?? 'none')}`,
        );
      }
    } catch {
      logger.warn('[ChatBridge] Could not decode token for debug logging');
    }

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

/** Safely extract a string from an unknown record. */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/** Safely check if a value is a plain object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Normalizes a Google Chat event to the legacy ChatEvent format.
 * Workspace Add-ons send: {chat: {messagePayload, user, ...}, commonEventObject}
 * Legacy format: {type: "MESSAGE", message: {...}, space: {...}, user: {...}}
 */
function normalizeEvent(raw: Record<string, unknown>): ChatEvent | null {
  // Already in legacy format
  if (typeof raw['type'] === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return raw as unknown as ChatEvent;
  }

  // Workspace Add-ons format
  const chat = raw['chat'];
  if (!isObj(chat)) return null;

  const user = isObj(chat['user']) ? chat['user'] : {};
  const eventTime = str(chat, 'eventTime');

  // Check for card click actions (button clicks) via commonEventObject
  const common = raw['commonEventObject'];
  if (isObj(common) && typeof common['invokedFunction'] === 'string') {
    const invokedFunction = common['invokedFunction'];
    const params = isObj(common['parameters']) ? common['parameters'] : {};

    // Build action parameters array from commonEventObject.parameters
    const actionParams = Object.entries(params)
      .filter(([, v]) => typeof v === 'string')
      .map(([key, value]) => ({ key, value: String(value) }));

    // Extract message/thread/space from chat object
    const message = isObj(chat['message']) ? chat['message'] : {};
    const thread = isObj(message['thread']) ? message['thread'] : {};
    const space = isObj(chat['space'])
      ? chat['space']
      : isObj(message['space'])
        ? message['space']
        : {};

    logger.info(
      `[ChatBridge] Add-ons CARD_CLICKED: function=${invokedFunction} ` +
        `params=${JSON.stringify(params)} thread=${str(thread, 'name')}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      type: 'CARD_CLICKED',
      eventTime,
      message: { ...message, thread, space },
      space,
      user,
      action: {
        actionMethodName: invokedFunction,
        parameters: actionParams,
      },
    } as unknown as ChatEvent;
  }

  // Determine event type from which payload field is present
  if (isObj(chat['messagePayload'])) {
    const payload = chat['messagePayload'];
    const message = isObj(payload['message']) ? payload['message'] : {};
    const space = isObj(payload['space'])
      ? payload['space']
      : isObj(message['space'])
        ? message['space']
        : {};
    const thread = isObj(message['thread']) ? message['thread'] : {};

    logger.info(
      `[ChatBridge] Add-ons MESSAGE: text="${str(message, 'text')}" ` +
        `space=${str(space, 'name')} thread=${str(thread, 'name')}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      type: 'MESSAGE',
      eventTime,
      message: {
        ...message,
        sender: message['sender'] ?? user,
        thread,
        space,
      },
      space,
      user,
    } as unknown as ChatEvent;
  }

  if (isObj(chat['addedToSpacePayload'])) {
    const payload = chat['addedToSpacePayload'];
    const space = isObj(payload['space']) ? payload['space'] : {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      type: 'ADDED_TO_SPACE',
      eventTime,
      space,
      user,
    } as unknown as ChatEvent;
  }

  if (isObj(chat['removedFromSpacePayload'])) {
    const payload = chat['removedFromSpacePayload'];
    const space = isObj(payload['space']) ? payload['space'] : {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      type: 'REMOVED_FROM_SPACE',
      eventTime,
      space,
      user,
    } as unknown as ChatEvent;
  }

  logger.warn(
    `[ChatBridge] Unknown Add-ons event, chat keys: ${Object.keys(chat).join(',')}`,
  );
  return null;
}

/**
 * Wraps a legacy ChatResponse in the Workspace Add-ons response format.
 * Add-ons expects: {hostAppDataAction: {chatDataAction: {createMessageAction: {message}}}}
 */
function wrapAddOnsResponse(response: ChatResponse): Record<string, unknown> {
  // Build the message object for the Add-ons format
  const message: Record<string, unknown> = {};
  if (response.text) {
    message['text'] = response.text;
  }
  if (response.cardsV2) {
    message['cardsV2'] = response.cardsV2;
  }

  // For action responses (like CARD_CLICKED acknowledgments), use updateMessageAction
  if (response.actionResponse?.type === 'UPDATE_MESSAGE') {
    return {
      hostAppDataAction: {
        chatDataAction: {
          updateMessageAction: { message },
        },
      },
    };
  }

  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: { message },
      },
    },
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
        const rawBody = req.body as Record<string, unknown>;

        // Normalize to legacy ChatEvent format. Google Chat HTTP endpoints
        // configured as Workspace Add-ons send a different event structure:
        //   {chat: {messagePayload, user, eventTime}, commonEventObject: {...}}
        // We convert to the legacy format our handler expects:
        //   {type: "MESSAGE", message: {...}, space: {...}, user: {...}}
        const event = normalizeEvent(rawBody);

        if (!event || !event.type) {
          logger.warn(
            `[ChatBridge] Could not parse event. Keys: ${Object.keys(rawBody).join(',')}`,
          );
          res.status(400).json({ error: 'Invalid event: missing type field' });
          return;
        }

        logger.info(`[ChatBridge] Webhook received: type=${event.type}`);

        // Detect if the request came in Add-ons format
        const isAddOnsFormat = Boolean(rawBody['chat'] && !rawBody['type']);

        const response = await handler.handleEvent(event);

        // For CARD_CLICKED events, force UPDATE_MESSAGE so the card is
        // replaced in-place rather than posting a new message.
        if (event.type === 'CARD_CLICKED' && !response.actionResponse) {
          response.actionResponse = { type: 'UPDATE_MESSAGE' };
        }

        if (isAddOnsFormat) {
          // Wrap in Workspace Add-ons response format
          const addOnsResponse = wrapAddOnsResponse(response);
          logger.info(
            `[ChatBridge] Add-ons response: ${JSON.stringify(addOnsResponse).substring(0, 200)}`,
          );
          res.json(addOnsResponse);
        } else {
          res.json(response);
        }
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
