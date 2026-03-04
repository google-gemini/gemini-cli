/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Chat bridge for the Gemini CLI forever mode via Cloud Pub/Sub.
 *
 * Architecture:
 *   Google Chat → Pub/Sub topic → this bridge (pull subscriber) → agent (localhost:3100)
 *   Response comes back → bridge pushes to Google Chat via Chat API
 *
 * One agent per VM. Messages are forwarded as-is to the running
 * gemini-cli --forever session via its JSON-RPC external listener.
 */

import http from 'node:http';
import { PubSub } from '@google-cloud/pubsub';
import { ChatApiClient } from './chat-api-client.js';
import { logger } from '../utils/logger.js';

// --- Config from env vars ---

const A2A_URL = process.env['A2A_URL'] ?? 'http://127.0.0.1:3100';
const GOOGLE_CLOUD_PROJECT = process.env['GOOGLE_CLOUD_PROJECT'] ?? '';
const PUBSUB_SUBSCRIPTION =
  process.env['PUBSUB_SUBSCRIPTION'] ?? 'forever-agent-chat-sub';
const HEALTH_PORT = parseInt(process.env['BRIDGE_PORT'] ?? '8081', 10);

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
 * Extract the essentials from a Google Chat event.
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

// --- Async message processing ---

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

// --- Pub/Sub subscriber ---

function startSubscriber(): void {
  if (!GOOGLE_CLOUD_PROJECT) {
    logger.error(
      '[Bridge] GOOGLE_CLOUD_PROJECT not set — cannot start Pub/Sub subscriber',
    );
    process.exit(1);
  }

  const pubsub = new PubSub({ projectId: GOOGLE_CLOUD_PROJECT });
  const subscription = pubsub.subscription(PUBSUB_SUBSCRIPTION);
  const chatApi = new ChatApiClient();

  logger.info(
    `[Bridge] Subscribing to ${PUBSUB_SUBSCRIPTION} in project ${GOOGLE_CLOUD_PROJECT}`,
  );
  logger.info(`[Bridge] Forwarding to agent at ${A2A_URL}`);

  subscription.on('message', (message) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const raw = JSON.parse(message.data.toString()) as Record<
        string,
        unknown
      >;
      message.ack();

      const event = normalizeEvent(raw);
      if (!event) {
        logger.warn(
          `[Bridge] Unknown event format: ${Object.keys(raw).join(',')}`,
        );
        return;
      }

      logger.info(
        `[Bridge] ${event.type}: space=${event.spaceName} text="${event.text.substring(0, 100)}"`,
      );

      if (event.type === 'ADDED_TO_SPACE') {
        chatApi
          .sendMessage(event.spaceName, '', {
            text: 'Gemini CLI forever agent connected. Send me a task!',
          })
          .catch((err) =>
            logger.error(`[Bridge] Welcome message failed: ${err}`),
          );
        return;
      }

      if (event.type !== 'MESSAGE' || !event.text) return;

      processMessageAsync(chatApi, event).catch((err) => {
        logger.error(`[Bridge] Async processing failed: ${err}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Bridge] Failed to parse Pub/Sub message: ${msg}`);
      message.ack(); // ack to avoid redelivery of bad messages
    }
  });

  subscription.on('error', (err) => {
    logger.error(`[Bridge] Pub/Sub subscription error: ${err.message}`);
  });

  // Health check for systemd
  http
    .createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          mode: 'pubsub',
          subscription: PUBSUB_SUBSCRIPTION,
          a2aUrl: A2A_URL,
        }),
      );
    })
    .listen(HEALTH_PORT, '127.0.0.1', () => {
      logger.info(`[Bridge] Health check on port ${HEALTH_PORT}`);
    });
}

// --- Standalone entrypoint ---

if (
  process.argv[1]?.endsWith('bridge.js') ||
  process.argv[1]?.endsWith('bridge.ts')
) {
  startSubscriber();
}
