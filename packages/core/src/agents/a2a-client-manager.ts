/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentCard,
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
  type AuthenticationHandler,
  createAuthenticatingFetchWithRetry,
} from '@a2a-js/sdk/client';
import { GrpcTransportFactory } from '@a2a-js/sdk/client/grpc';
import { v4 as uuidv4 } from 'uuid';
import { Agent as UndiciAgent } from 'undici';
import {
  getGrpcCredentials,
  normalizeAgentCard,
  getProtocolVersion,
  type VersionedAgentCard,
} from './a2aUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import { sendV1MessageStream } from './v1-bridge.js';

// Remote agents can take 10+ minutes (e.g. Deep Research).
// Use a dedicated dispatcher so the global 5-min timeout isn't affected.
const A2A_TIMEOUT = 1800000; // 30 minutes
const a2aDispatcher = new UndiciAgent({
  headersTimeout: A2A_TIMEOUT,
  bodyTimeout: A2A_TIMEOUT,
});
const a2aFetch: typeof fetch = (input, init) =>
  // @ts-expect-error The `dispatcher` property is a Node.js extension to fetch not present in standard types.
  fetch(input, { ...init, dispatcher: a2aDispatcher });

export type SendMessageResult =
  | Message
  | Task
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

interface ExtendedClient {
  getTask?(arg: { id: string }): Promise<Task>;
  cancelTask?(arg: { id: string }): Promise<Task>;
  sendMessageStream?(
    arg: { message: unknown },
    options?: { signal?: AbortSignal },
  ): AsyncIterable<SendMessageResult>;
}

/**
 * Orchestrates communication with A2A agents.
 *
 * This manager handles agent discovery, card caching, and client lifecycle.
 * It provides a unified messaging interface by routing requests through either
 * the standard A2A SDK or a specialized gRPC V1 bridge based on protocol version.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;
  private agentCards = new Map<string, AgentCard>();
  private gRPCUrls = new Map<string, string>();
  private clients = new Map<string, ExtendedClient>();

  private constructor() {}

  /**
   * Gets the singleton instance of the A2AClientManager.
   */
  static getInstance(): A2AClientManager {
    if (!A2AClientManager.instance) {
      A2AClientManager.instance = new A2AClientManager();
    }
    return A2AClientManager.instance;
  }

  /**
   * Resets the singleton instance. Only for testing purposes.
   * @internal
   */
  static resetInstanceForTesting() {
    // @ts-expect-error - Resetting singleton for testing
    A2AClientManager.instance = undefined;
  }

  /**
   * Loads an agent by fetching its AgentCard and caches the client.
   * @param name The name to assign to the agent.
   * @param agentCardUrl The full URL to the agent's card.
   * @param authHandler Optional authentication handler to use for this agent.
   * @returns The loaded AgentCard.
   */
  async loadAgent(
    name: string,
    agentCardUrl: string,
    authHandler?: AuthenticationHandler,
  ): Promise<AgentCard> {
    if (this.clients.has(name) && this.agentCards.has(name)) {
      throw new Error(`Agent with name '${name}' is already loaded.`);
    }

    const fetchImpl = this.getFetchImpl(authHandler);
    const resolver = new DefaultAgentCardResolver({ fetchImpl });

    // Detect if the URL is already a full path to an agent card to prevent doubling by the resolver.
    const standardPath = '.well-known/agent-card.json';
    let baseUrl = agentCardUrl;
    let path: string | undefined;

    if (baseUrl.includes(standardPath)) {
      const parts = baseUrl.split(standardPath);
      baseUrl = parts[0] || '';
      path = standardPath;
    }

    // Use SDK resolver to handle .well-known resolution and fetching.
    const rawCard = await resolver.resolve(baseUrl, path);
    const agentCard = normalizeAgentCard(rawCard);

    // Configure standard SDK client for tool registration and discovery
    const clientOptions = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({ fetchImpl }),
          new JsonRpcTransportFactory({ fetchImpl }),
          new GrpcTransportFactory({
            grpcChannelCredentials: getGrpcCredentials(agentCardUrl),
          }),
        ],
        cardResolver: resolver,
      },
    );
    const factory = new ClientFactory(clientOptions);
    const client = (await factory.createFromAgentCard(
      agentCard,
    )) as ExtendedClient;

    this.clients.set(name, client);
    this.agentCards.set(name, agentCard);

    this.registerV1BridgeUrl(name, agentCard);

    debugLogger.debug(
      `[A2AClientManager] Loaded agent '${name}' from ${agentCardUrl}`,
    );
    return agentCard;
  }

  /**
   * Invalidates all cached clients and agent cards.
   */
  clearCache(): void {
    this.agentCards.clear();
    this.gRPCUrls.clear();
    this.clients.clear();
    debugLogger.debug('[A2AClientManager] Cache cleared.');
  }

  /**
   * Sends a message to a loaded agent and returns a stream of responses.
   * @param agentName The name of the agent to send the message to.
   * @param message The message content.
   * @param options Optional context and task IDs to maintain conversation state.
   * @returns An async iterable of responses from the agent (Message or Task).
   * @throws Error if the agent returns an error response.
   */
  async *sendMessageStream(
    agentName: string,
    message: string,
    options?: { contextId?: string; taskId?: string; signal?: AbortSignal },
  ): AsyncIterable<SendMessageResult> {
    const url = this.gRPCUrls.get(agentName);
    const agentCard = this.agentCards.get(agentName) as
      | VersionedAgentCard
      | undefined;

    try {
      // Resolve protocol version
      const version = getProtocolVersion(agentCard, url);

      // Fallback to standard SDK for non-V1 agents
      if (!version?.startsWith('1.')) {
        yield* this.sendSdkMessageStream(agentName, message, options);
        return;
      }

      // Use the V1 Bridge for direct gRPC communication.
      // TODO: Replace with standard SDK call once @a2a-js/sdk supports V1.
      if (!url) {
        throw new Error(
          `Agent '${agentName}' is a V1 agent but no gRPC interface was found.`,
        );
      }
      yield* sendV1MessageStream(url, message, options);
    } catch (error: unknown) {
      const prefix = `[A2AClientManager] sendMessageStream Error [${agentName}]`;
      if (error instanceof Error) {
        throw new Error(`${prefix}: ${error.message}`, { cause: error });
      }
      throw new Error(
        `${prefix}: Unexpected error during sendMessageStream: ${String(error)}`,
      );
    }
  }

  /**
   * Retrieves a loaded agent card.
   * @param name The name of the agent.
   * @returns The agent card, or undefined if not found.
   */
  getAgentCard(name: string): AgentCard | undefined {
    return this.agentCards.get(name);
  }

  /**
   * Retrieves a loaded client.
   * @param name The name of the agent.
   * @returns The client, or undefined if not found.
   */
  getClient(name: string): ExtendedClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Retrieves a task from an agent.
   * @param agentName The name of the agent.
   * @param taskId The ID of the task to retrieve.
   * @returns The task details.
   */
  async getTask(agentName: string, taskId: string): Promise<Task> {
    const client = this.clients.get(agentName);
    if (!client) throw new Error(`Agent '${agentName}' not found.`);
    if (!client.getTask)
      throw new Error(`Agent '${agentName}' does not support getTask.`);
    try {
      return await client.getTask({ id: taskId });
    } catch (error: unknown) {
      const prefix = `A2AClient getTask Error [${agentName}]`;
      if (error instanceof Error) {
        throw new Error(`${prefix}: ${error.message}`, { cause: error });
      }
      throw new Error(`${prefix}: Unexpected error: ${String(error)}`);
    }
  }

  /**
   * Cancels a task on an agent.
   * @param agentName The name of the agent.
   * @param taskId The ID of the task to cancel.
   * @returns The cancellation response.
   */
  async cancelTask(agentName: string, taskId: string): Promise<Task> {
    const client = this.clients.get(agentName);
    if (!client) throw new Error(`Agent '${agentName}' not found.`);
    if (!client.cancelTask)
      throw new Error(`Agent '${agentName}' does not support cancelTask.`);
    try {
      return await client.cancelTask({ id: taskId });
    } catch (error: unknown) {
      const prefix = `A2AClient cancelTask Error [${agentName}]`;
      if (error instanceof Error) {
        throw new Error(`${prefix}: ${error.message}`, { cause: error });
      }
      throw new Error(`${prefix}: Unexpected error: ${String(error)}`);
    }
  }

  /**
   * Resolves the appropriate fetch implementation for an agent.
   */
  private getFetchImpl(authHandler?: AuthenticationHandler): typeof fetch {
    return authHandler
      ? createAuthenticatingFetchWithRetry(a2aFetch, authHandler)
      : a2aFetch;
  }

  /**
   * Stores the gRPC URL for direct V1 communication if available.
   */
  private registerV1BridgeUrl(name: string, agentCard: AgentCard): void {
    const intf = agentCard.additionalInterfaces?.find(
      (i) =>
        i.transport === 'GRPC' && typeof i.url === 'string' && i.url !== '',
    );
    if (intf) {
      this.gRPCUrls.set(name, intf.url);
    }
  }

  /**
   * Fallback method using the standard SDK messaging client.
   */
  private async *sendSdkMessageStream(
    agentName: string,
    message: string,
    options?: { contextId?: string; taskId?: string; signal?: AbortSignal },
  ): AsyncIterable<SendMessageResult> {
    const client = this.clients.get(agentName);
    if (!client) throw new Error(`Agent '${agentName}' not found.`);
    if (!client.sendMessageStream)
      throw new Error(
        `Agent '${agentName}' does not support sendMessageStream.`,
      );

    yield* client.sendMessageStream(
      {
        message: {
          kind: 'message',
          messageId: uuidv4(),
          role: 'user',
          parts: [{ kind: 'text', text: message }],
          contextId: options?.contextId,
          taskId: options?.taskId,
        },
      },
      { signal: options?.signal },
    );
  }
}
