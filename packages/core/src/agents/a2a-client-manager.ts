/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentCard,
  Message,
  MessageSendParams,
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
  type Client,
} from '@a2a-js/sdk/client';
import { GrpcTransportFactory } from '@a2a-js/sdk/client/grpc';
import { v4 as uuidv4 } from 'uuid';
import { Agent as UndiciAgent } from 'undici';
import { getGrpcCredentials, normalizeAgentCard } from './a2aUtils.js';
import { isPrivateIpAsync } from '../utils/fetch.js';
import { debugLogger } from '../utils/debugLogger.js';

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

/**
 * Orchestrates communication with A2A agents.
 *
 * This manager handles agent discovery, card caching, and client lifecycle.
 * It provides a unified messaging interface using the standard A2A SDK.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;

  // Each agent should manage their own context/taskIds/card/etc
  private clients = new Map<string, Client>();
  private agentCards = new Map<string, AgentCard>();

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
    const agentCard = await this.resolveAgentCard(name, agentCardUrl, resolver);

    // Configure standard SDK client for tool registration and discovery
    const clientOptions = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({ fetchImpl }),
          new JsonRpcTransportFactory({ fetchImpl }),
          new GrpcTransportFactory({
            grpcChannelCredentials: getGrpcCredentials(agentCard.url),
          }),
        ],
        cardResolver: resolver,
      },
    );
    const factory = new ClientFactory(clientOptions);
    const client = await factory.createFromAgentCard(agentCard);

    this.clients.set(name, client);
    this.agentCards.set(name, agentCard);

    debugLogger.debug(
      `[A2AClientManager] Loaded agent '${name}' from ${agentCardUrl}`,
    );

    return agentCard;
  }

  /**
   * Invalidates all cached clients and agent cards.
   */
  clearCache(): void {
    this.clients.clear();
    this.agentCards.clear();
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
    const client = this.clients.get(agentName);
    if (!client) throw new Error(`Agent '${agentName}' not found.`);

    const messageParams: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text: message }],
        contextId: options?.contextId,
        taskId: options?.taskId,
      },
    };

    try {
      yield* client.sendMessageStream(messageParams, {
        signal: options?.signal,
      });
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
  getClient(name: string): Client | undefined {
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
   * Resolves and normalizes an agent card from a given URL.
   * Handles splitting the URL if it already contains the standard .well-known path.
   * Also performs basic SSRF validation to prevent internal IP access.
   */
  private async resolveAgentCard(
    agentName: string,
    url: string,
    resolver: DefaultAgentCardResolver,
  ): Promise<AgentCard> {
    const standardPath = '.well-known/agent-card.json';
    let baseUrl = url;
    let path: string | undefined;

    // Validate URL to prevent SSRF (with DNS resolution)
    if (await isPrivateIpAsync(url)) {
      // Local/private IPs are allowed ONLY for localhost for testing.
      const parsed = new URL(url);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        throw new Error(
          `Refusing to load agent '${agentName}' from private IP range: ${url}. Remote agents must use public URLs.`,
        );
      }
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith(standardPath)) {
        // Correctly split the URL into baseUrl and standard path
        path = standardPath;
        baseUrl = url.substring(0, url.lastIndexOf(standardPath));
      }
    } catch (e) {
      throw new Error(`Invalid agent card URL: ${url}`, { cause: e });
    }

    const rawCard = await resolver.resolve(baseUrl, path);
    const agentCard = normalizeAgentCard(rawCard);

    // Deep validation of all transport URLs within the card to prevent SSRF
    await this.validateAgentCardUrls(agentName, agentCard);

    return agentCard;
  }

  /**
   * Validates all URLs (top-level and interfaces) within an AgentCard for SSRF.
   */
  private async validateAgentCardUrls(
    agentName: string,
    card: AgentCard,
  ): Promise<void> {
    const urlsToValidate = [card.url];
    if (card.additionalInterfaces) {
      for (const intf of card.additionalInterfaces) {
        if (intf.url) urlsToValidate.push(intf.url);
      }
    }

    for (const url of urlsToValidate) {
      if (!url) continue;

      // Ensure URL has a scheme for the parser (gRPC often provides raw IP:port)
      const validationUrl = url.includes('://') ? url : `http://${url}`;

      if (await isPrivateIpAsync(validationUrl)) {
        const parsed = new URL(validationUrl);
        if (
          parsed.hostname !== 'localhost' &&
          parsed.hostname !== '127.0.0.1'
        ) {
          throw new Error(
            `Refusing to load agent '${agentName}': contains transport URL pointing to private IP range: ${url}.`,
          );
        }
      }
    }
  }
}
