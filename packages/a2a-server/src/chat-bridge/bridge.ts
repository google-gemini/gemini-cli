/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal Google Chat bridge for the Gemini CLI forever mode.
 *
 * Architecture:
 *   Google Chat webhook -> this bridge (port 8081) -> external listener (port 3100)
 *   Response comes back -> bridge pushes to Google Chat via Chat API
 *
 * One agent per space. Messages are forwarded as-is to the running
 * gemini-cli --forever session via its JSON-RPC external listener.
 */

import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ChatApiClient } from './chat-api-client.js';
import { logger } from '../utils/logger.js';

// --- Config from env vars ---

const BRIDGE_PORT = parseInt(process.env['BRIDGE_PORT'] ?? '8081', 10);
const A2A_URL = process.env['A2A_URL'] ?? 'http://127.0.0.1:3100';
const CHAT_PROJECT_NUMBER = process.env['CHAT_PROJECT_NUMBER'];
const CHAT_ISSUER = 'chat@system.gserviceaccount.com';

// --- Types ---

interface ChatMessagePart {
  kind?: string;
  text?: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: {
    kind: string;
    id: string;
    status: {
      state: string;
      message?: {
        parts: ChatMessagePart[];
      };
    };
  };
  error?: { code: number; message: string };
}

// --- Auth middleware ---

function createAuthMiddleware(): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => void {
  // On Cloud Run, IAM handles auth
  if (process.env['K_SERVICE']) {
    logger.info('[Bridge] Running on Cloud Run — auth delegated to IAM.');
    return (_req, _res, next) => next();
  }

  if (!CHAT_PROJECT_NUMBER) {
    logger.warn(
      '[Bridge] CHAT_PROJECT_NUMBER not set — JWT verification disabled.',
    );
    return (_req, _res, next) => next();
  }

  const authClient = new OAuth2Client();

  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    authClient
      .verifyIdToken({
        idToken: authHeader.substring(7),
        audience: CHAT_PROJECT_NUMBER,
      })
      .then((ticket) => {
        const payload = ticket.getPayload();
        if (payload?.iss !== CHAT_ISSUER) {
          res.status(403).json({ error: 'Forbidden: invalid issuer' });
          return;
        }
        next();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`[Bridge] JWT verification failed: ${msg}`);
        res.status(401).json({ error: 'Unauthorized' });
      });
  };
}

// --- Event normalization ---

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

interface NormalizedEvent {
  type: string;
  text: string;
  spaceName: string;
  threadName: string;
}

/**
 * Extract the essentials from a Google Chat webhook event.
 * Handles both legacy and Workspace Add-ons format.
 */
function normalizeEvent(raw: Record<string, unknown>): NormalizedEvent | null {
  // Legacy format
  if (typeof raw['type'] === 'string') {
    const message = isObj(raw['message']) ? raw['message'] : {};
    const space = isObj(raw['space'])
      ? raw['space']
      : isObj(message['space'])
        ? message['space']
        : {};
    const thread = isObj(message['thread']) ? message['thread'] : {};
    return {
      type: raw['type'],
      text: str(message, 'text'),
      spaceName: str(space, 'name'),
      threadName: str(thread, 'name'),
    };
  }

  // Workspace Add-ons format
  const chat = raw['chat'];
  if (!isObj(chat)) return null;

  if (isObj(chat['messagePayload'])) {
    const payload = chat['messagePayload'];
    const message = isObj(payload['message']) ? payload['message'] : {};
    const space = isObj(payload['space'])
      ? payload['space']
      : isObj(message['space'])
        ? message['space']
        : {};
    const thread = isObj(message['thread']) ? message['thread'] : {};
    return {
      type: 'MESSAGE',
      text: str(message, 'text'),
      spaceName: str(space, 'name'),
      threadName: str(thread, 'name'),
    };
  }

  if (isObj(chat['addedToSpacePayload'])) {
    const payload = chat['addedToSpacePayload'];
    const space = isObj(payload['space']) ? payload['space'] : {};
    return {
      type: 'ADDED_TO_SPACE',
      text: '',
      spaceName: str(space, 'name'),
      threadName: '',
    };
  }

  return null;
}

// --- JSON-RPC call to external listener ---

async function sendToAgent(text: string): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        parts: [{ kind: 'text', text }],
      },
    },
  });

  const response = await fetch(A2A_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Agent returned ${response.status}: ${await response.text()}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const result = (await response.json()) as JsonRpcResponse;

  if (result.error) {
    throw new Error(`Agent error: ${result.error.message}`);
  }

  // Extract text from the response
  const parts = result.result?.status?.message?.parts ?? [];
  const texts = parts
    .filter((p) => p.kind === 'text' && p.text)
    .map((p) => p.text!);

  return texts.join('\n') || '(no response)';
}

// --- Express app ---

export function createBridgeApp(): express.Express {
  const app = express();
  app.use(express.json());

  const chatApi = new ChatApiClient();
  const auth = createAuthMiddleware();

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', a2aUrl: A2A_URL });
  });

  // Google Chat webhook
  app.post('/chat/webhook', auth, (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const raw = req.body as Record<string, unknown>;
    const event = normalizeEvent(raw);

    if (!event) {
      logger.warn(
        `[Bridge] Unknown event format: ${Object.keys(raw).join(',')}`,
      );
      res.json({});
      return;
    }

    logger.info(
      `[Bridge] ${event.type}: space=${event.spaceName} text="${event.text.substring(0, 100)}"`,
    );

    // Handle non-message events
    if (event.type === 'ADDED_TO_SPACE') {
      res.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: {
              message: {
                text: 'Gemini CLI forever agent connected. Send me a task!',
              },
            },
          },
        },
      });
      return;
    }

    if (event.type !== 'MESSAGE' || !event.text) {
      res.json({});
      return;
    }

    // Immediately ack the webhook (30s timeout)
    res.json({});

    // Process async — send to agent, push response back via Chat API
    processMessageAsync(chatApi, event).catch((err) => {
      logger.error(`[Bridge] Async processing failed: ${err}`);
    });
  });

  return app;
}

async function processMessageAsync(
  chatApi: ChatApiClient,
  event: NormalizedEvent,
): Promise<void> {
  const { text, spaceName, threadName } = event;

  try {
    logger.info(`[Bridge] Sending to agent: "${text.substring(0, 100)}"`);
    const responseText = await sendToAgent(text);
    logger.info(
      `[Bridge] Agent response (${responseText.length} chars): "${responseText.substring(0, 100)}..."`,
    );

    // Push response back to Google Chat
    await chatApi.sendMessage(spaceName, threadName, { text: responseText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Bridge] Error: ${msg}`);
    await chatApi.sendMessage(spaceName, threadName, {
      text: `Error: ${msg}`,
    });
  }
}

// --- Standalone entrypoint ---

if (
  process.argv[1]?.endsWith('bridge.js') ||
  process.argv[1]?.endsWith('bridge.ts')
) {
  const app = createBridgeApp();
  app.listen(BRIDGE_PORT, '0.0.0.0', () => {
    logger.info(`[Bridge] Google Chat bridge listening on port ${BRIDGE_PORT}`);
    logger.info(`[Bridge] Forwarding to agent at ${A2A_URL}`);
  });
}
