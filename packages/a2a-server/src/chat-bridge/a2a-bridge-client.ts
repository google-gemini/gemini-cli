/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A2A client wrapper for the Google Chat bridge.
 * Connects to the A2A server (local or remote) and sends/receives messages.
 * Follows the patterns from core/agents/a2a-client-manager.ts and
 * core/agents/remote-invocation.ts.
 */

import type {
  Message,
  Task,
  Part,
  MessageSendParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import { GoogleAuth } from 'google-auth-library';
import { Agent } from 'undici';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * Undici agent with long timeouts for SSE streaming.
 * Default body/headers timeouts are ~30s which kills idle SSE connections
 * when the agent runs long tools (npm install, tsc builds, etc.).
 */
const sseDispatcher = new Agent({
  bodyTimeout: 10 * 60 * 1000, // 10 minutes
  headersTimeout: 10 * 60 * 1000,
  keepAliveTimeout: 10 * 60 * 1000,
});

// Inline A2UI constants so the chat bridge has no dependency on ../a2ui/
const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.10';
const A2UI_MIME_TYPE = 'application/json+a2ui';

export type A2AResponse = Message | Task;
export type A2AStreamEventData =
  | Message
  | Task
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

/**
 * Extracts contextId and taskId from an A2A response.
 * Follows extractIdsFromResponse pattern from a2aUtils.ts.
 */
export function extractIdsFromResponse(result: A2AResponse): {
  contextId?: string;
  taskId?: string;
} {
  if (result.kind === 'message') {
    return {
      contextId: result.contextId,
      taskId: result.taskId,
    };
  }

  if (result.kind === 'task') {
    const contextId = result.contextId;
    let taskId: string | undefined = result.id;

    // Clear taskId on terminal states so next interaction starts a fresh task
    const state = result.status?.state;
    if (state === 'completed' || state === 'failed' || state === 'canceled') {
      taskId = undefined;
    }

    return { contextId, taskId };
  }

  return {};
}

/**
 * Extracts all parts from an A2A response.
 * For Tasks, checks history (accumulated from intermediate status-update events),
 * the final status message, and artifacts. The blocking DefaultRequestHandler
 * accumulates intermediate events into task.history, so the A2UI response content
 * from "working" events lives there even if the final status message is empty.
 */
export function extractAllParts(result: A2AResponse): Part[] {
  const parts: Part[] = [];

  if (result.kind === 'message') {
    parts.push(...(result.parts ?? []));
  } else if (result.kind === 'task') {
    // Parts from task history (accumulated intermediate status-update messages)
    if (result.history) {
      for (const msg of result.history) {
        if (msg.parts) {
          parts.push(...msg.parts);
        }
      }
    }
    // Parts from the final status message
    if (result.status?.message?.parts) {
      parts.push(...result.status.message.parts);
    }
    // Parts from artifacts
    if (result.artifacts) {
      for (const artifact of result.artifacts) {
        parts.push(...(artifact.parts ?? []));
      }
    }
  }

  return parts;
}

/**
 * Extracts plain text content from response parts.
 */
export function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((p) => p.kind === 'text')
    .map(
      (p) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (p as unknown as { text: string }).text,
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Extracts A2UI data parts from response parts.
 * A2UI parts are DataParts with metadata.mimeType === 'application/json+a2ui'.
 */
export function extractA2UIParts(parts: Part[]): unknown[][] {
  const a2uiMessages: unknown[][] = [];

  for (const part of parts) {
    if (
      part.kind === 'data' &&
      part.metadata != null &&
      part.metadata['mimeType'] === A2UI_MIME_TYPE
    ) {
      // The data field is an array of A2UI messages
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const data = (part as unknown as { data: unknown }).data;
      if (Array.isArray(data)) {
        a2uiMessages.push(data);
      }
    }
  }

  return a2uiMessages;
}

/**
 * A2A client for the chat bridge.
 * Manages connection to the A2A server and provides message send/receive.
 */
export class A2ABridgeClient {
  private client: Client | null = null;
  private agentUrl: string;

  constructor(agentUrl: string) {
    this.agentUrl = agentUrl;
  }

  /**
   * Initializes the client connection to the A2A server.
   * On Cloud Run (K_SERVICE is set), wraps fetch with an identity token
   * for service-to-service authentication.
   */
  async initialize(): Promise<void> {
    if (this.client) return;

    // Create fetch wrapper with long SSE timeouts.
    // On Cloud Run, also add identity tokens for service-to-service auth.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseFetch = (input: any, init?: any) =>
      fetch(input, { ...init, dispatcher: sseDispatcher });

    let fetchImpl: typeof fetch = baseFetch;
    if (process.env['K_SERVICE']) {
      const auth = new GoogleAuth();
      const idTokenClient = await auth.getIdTokenClient(this.agentUrl);
      fetchImpl = async (input, init?) => {
        const authHeaders = await idTokenClient.getRequestHeaders();
        const merged = new Headers(init?.headers);
        for (const [key, value] of Object.entries(authHeaders)) {
          merged.set(key, value);
        }
        return baseFetch(input, { ...init, headers: merged });
      };
      logger.info(
        '[ChatBridge] Using Cloud Run identity token for A2A server auth',
      );
    }

    const resolver = new DefaultAgentCardResolver({ fetchImpl });
    const options = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({ fetchImpl }),
          new JsonRpcTransportFactory({ fetchImpl }),
        ],
        cardResolver: resolver,
      },
    );

    const factory = new ClientFactory(options);
    // createFromUrl expects the agent card URL, not just the base URL
    const agentCardUrl =
      this.agentUrl.replace(/\/$/, '') + '/.well-known/agent-card.json';
    this.client = await factory.createFromUrl(agentCardUrl, '');

    const card = await this.client.getAgentCard();
    logger.info(
      `[ChatBridge] Connected to A2A agent: ${card.name} (${card.url})`,
    );
  }

  /**
   * Sends a text message to the A2A server using blocking mode.
   * The blocking DefaultRequestHandler accumulates all intermediate events
   * (including A2UI content from "working" status updates) into the Task's
   * history array, so extractAllParts can find them.
   */
  async sendMessage(
    text: string,
    options: { contextId?: string; taskId?: string },
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text }],
        contextId: options.contextId,
        taskId: options.taskId,
        // Signal A2UI support in message metadata
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
      configuration: {
        blocking: true,
      },
    };

    return this.client.sendMessage(params);
  }

  /**
   * Sends a text message and returns a streaming async generator.
   * Each yielded event is a Message, Task, TaskStatusUpdateEvent,
   * or TaskArtifactUpdateEvent.
   */
  sendMessageStream(
    text: string,
    options: { contextId?: string; taskId?: string },
  ): AsyncGenerator<A2AStreamEventData, void, undefined> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text }],
        contextId: options.contextId,
        taskId: options.taskId,
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
    };

    return this.client.sendMessageStream(params);
  }

  /**
   * Sends a tool confirmation action back to the A2A server.
   * The action is sent as a DataPart containing the A2UI action message.
   */
  async sendToolConfirmation(
    callId: string,
    outcome: string,
    taskId: string,
    options: { contextId?: string },
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    // Build the A2UI action message as a DataPart
    const actionPart: Part = {
      kind: 'data',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      data: [
        {
          version: 'v0.10',
          action: {
            name: 'tool_confirmation',
            surfaceId: `tool_approval_${taskId}_${callId}`,
            sourceComponentId:
              outcome === 'cancel' ? 'reject_button' : 'approve_button',
            timestamp: new Date().toISOString(),
            context: { callId, outcome, taskId },
          },
        },
      ] as unknown as Record<string, unknown>,
      metadata: {
        mimeType: A2UI_MIME_TYPE,
      },
    } as Part;

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [actionPart],
        contextId: options.contextId,
        taskId,
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
      configuration: {
        blocking: true,
      },
    };

    return this.client.sendMessage(params);
  }

  /**
   * Sends a tool confirmation via streaming (SSE) so the caller can
   * follow the full task lifecycle after approval.
   */
  sendToolConfirmationStream(
    callId: string,
    outcome: string,
    taskId: string,
    options: { contextId?: string },
  ): AsyncGenerator<A2AStreamEventData, void, undefined> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    const actionPart: Part = {
      kind: 'data',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      data: [
        {
          version: 'v0.10',
          action: {
            name: 'tool_confirmation',
            surfaceId: `tool_approval_${taskId}_${callId}`,
            sourceComponentId:
              outcome === 'cancel' ? 'reject_button' : 'approve_button',
            timestamp: new Date().toISOString(),
            context: { callId, outcome, taskId },
          },
        },
      ] as unknown as Record<string, unknown>,
      metadata: {
        mimeType: A2UI_MIME_TYPE,
      },
    } as Part;

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [actionPart],
        contextId: options.contextId,
        taskId,
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
    };

    return this.client.sendMessageStream(params);
  }

  /**
   * Sends multiple tool confirmations in a single A2A message.
   * Needed when the agent requests multiple tool approvals at once —
   * sending them one at a time with blocking mode would hang because
   * the agent waits for ALL approvals before proceeding.
   */
  async sendBatchToolConfirmations(
    approvals: Array<{ callId: string; outcome: string; taskId: string }>,
    options: { contextId?: string },
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    const parts: Part[] = approvals.map(
      (approval) =>
        ({
          kind: 'data',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          data: [
            {
              version: 'v0.10',
              action: {
                name: 'tool_confirmation',
                surfaceId: `tool_approval_${approval.taskId}_${approval.callId}`,
                sourceComponentId:
                  approval.outcome === 'cancel'
                    ? 'reject_button'
                    : 'approve_button',
                timestamp: new Date().toISOString(),
                context: {
                  callId: approval.callId,
                  outcome: approval.outcome,
                  taskId: approval.taskId,
                },
              },
            },
          ] as unknown as Record<string, unknown>,
          metadata: {
            mimeType: A2UI_MIME_TYPE,
          },
        }) as Part,
    );

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts,
        contextId: options.contextId,
        taskId: approvals[0]?.taskId,
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
      configuration: {
        blocking: true,
      },
    };

    return this.client.sendMessage(params);
  }

  /**
   * Sends batch tool confirmations via streaming (SSE) so the caller can
   * follow the full task lifecycle after approval. Returns an async generator
   * that yields events until the task reaches a terminal state.
   */
  sendBatchToolConfirmationsStream(
    approvals: Array<{ callId: string; outcome: string; taskId: string }>,
    options: { contextId?: string },
  ): AsyncGenerator<A2AStreamEventData, void, undefined> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }

    const parts: Part[] = approvals.map(
      (approval) =>
        ({
          kind: 'data',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          data: [
            {
              version: 'v0.10',
              action: {
                name: 'tool_confirmation',
                surfaceId: `tool_approval_${approval.taskId}_${approval.callId}`,
                sourceComponentId:
                  approval.outcome === 'cancel'
                    ? 'reject_button'
                    : 'approve_button',
                timestamp: new Date().toISOString(),
                context: {
                  callId: approval.callId,
                  outcome: approval.outcome,
                  taskId: approval.taskId,
                },
              },
            },
          ] as unknown as Record<string, unknown>,
          metadata: {
            mimeType: A2UI_MIME_TYPE,
          },
        }) as Part,
    );

    const params: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts,
        contextId: options.contextId,
        taskId: approvals[0]?.taskId,
        metadata: {
          extensions: [A2UI_EXTENSION_URI],
        },
      },
    };

    return this.client.sendMessageStream(params);
  }

  /**
   * Cancels a running task on the A2A agent server.
   */
  async cancelTask(taskId: string): Promise<void> {
    if (!this.client) {
      throw new Error('A2A client not initialized. Call initialize() first.');
    }
    await this.client.cancelTask({ id: taskId });
  }
}
