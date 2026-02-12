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

import type { Message, Task, Part, MessageSendParams } from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { A2UI_EXTENSION_URI, A2UI_MIME_TYPE } from '../a2ui/a2ui-extension.js';

export type A2AResponse = Message | Task;

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
 * Extracts all parts from an A2A response (from status message + artifacts).
 */
export function extractAllParts(result: A2AResponse): Part[] {
  const parts: Part[] = [];

  if (result.kind === 'message') {
    parts.push(...(result.parts ?? []));
  } else if (result.kind === 'task') {
    // Parts from the status message
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
   */
  async initialize(): Promise<void> {
    if (this.client) return;

    const resolver = new DefaultAgentCardResolver({});
    const options = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({}),
          new JsonRpcTransportFactory({}),
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
   * Sends a text message to the A2A server using streaming.
   * Uses streaming to capture all intermediate A2UI content from status-update
   * events, since the final task state may not contain the response content.
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
    };

    return this.collectStreamResponse(params);
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
    };

    return this.collectStreamResponse(params);
  }

  /**
   * Sends a message via streaming and collects all A2UI parts from intermediate
   * status-update events. The A2A server sends response content in "working"
   * status updates, while the final event (e.g. "input-required") may be empty.
   * Streaming captures everything.
   */
  private async collectStreamResponse(
    params: MessageSendParams,
  ): Promise<A2AResponse> {
    if (!this.client) {
      throw new Error('A2A client not initialized.');
    }

    const stream = this.client.sendMessageStream(params);
    const collectedParts: Part[] = [];
    let latestTaskId: string | undefined;
    let latestContextId: string | undefined;
    let latestState = 'working';

    for await (const event of stream) {
      switch (event.kind) {
        case 'status-update':
          latestTaskId = event.taskId;
          latestContextId = event.contextId;
          latestState = event.status.state;
          if (event.status.message?.parts) {
            collectedParts.push(...event.status.message.parts);
          }
          break;
        case 'artifact-update':
          latestTaskId = event.taskId;
          latestContextId = event.contextId;
          if (event.artifact?.parts) {
            collectedParts.push(...event.artifact.parts);
          }
          break;
        case 'task':
          // Full task response from stream - augment with collected parts
          if (
            collectedParts.length > 0 &&
            event.status &&
            !event.status.message?.parts?.length
          ) {
            event.status.message = {
              kind: 'message',
              role: 'agent',
              messageId: uuidv4(),
              parts: collectedParts,
            };
          }
          return event;
        case 'message':
          // Full message response from stream - augment with collected parts
          if (collectedParts.length > 0 && !event.parts?.length) {
            event.parts = collectedParts;
          }
          return event;
        default:
          break;
      }
    }

    // Stream ended with only status-update/artifact-update events.
    // Build a synthetic Message with all collected parts.
    logger.info(
      `[ChatBridge] Stream completed: taskId=${latestTaskId}, state=${latestState}, parts=${collectedParts.length}`,
    );

    // Return as a Message containing all collected A2UI parts
    const response: Message = {
      kind: 'message',
      role: 'agent',
      messageId: uuidv4(),
      parts: collectedParts,
      contextId: latestContextId,
      taskId: latestTaskId,
    };
    return response;
  }
}
