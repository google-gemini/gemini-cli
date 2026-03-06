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
import type { AuthenticationHandler, Client } from '@a2a-js/sdk/client';
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  RestTransportFactory,
  createAuthenticatingFetchWithRetry,
} from '@a2a-js/sdk/client';
import { GrpcTransportFactory } from '@a2a-js/sdk/client/grpc';
import { v4 as uuidv4 } from 'uuid';
import { Agent as UndiciAgent } from 'undici';
import {
  getGrpcChannelOptions,
  getGrpcCredentials,
  normalizeAgentCard,
  pinUrlToIp,
  splitAgentCardUrl,
} from './a2aUtils.js';
import {
  isPrivateIpAsync,
  safeLookup,
  isLoopbackHost,
} from '../utils/fetch.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Result of sending a message, which can be a full message, a task,
 * or an incremental status/artifact update.
 */
export type SendMessageResult =
  | Message
  | Task
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

// Local extension of RequestInit to support Node.js/undici dispatcher
interface NodeFetchInit extends RequestInit {
  dispatcher?: UndiciAgent;
}

// Remote agents can take 10+ minutes (e.g. Deep Research).
// Use a dedicated dispatcher so the global 5-min timeout isn't affected.
const A2A_TIMEOUT = 1800000; // 30 minutes
const a2aDispatcher = new UndiciAgent({
  headersTimeout: A2A_TIMEOUT,
  bodyTimeout: A2A_TIMEOUT,
  connect: {
    // SSRF protection at the connection level (mitigates DNS rebinding)
    lookup: safeLookup,
  },
});
const a2aFetch: typeof fetch = (input, init) => {
  const nodeInit: NodeFetchInit = { ...init, dispatcher: a2aDispatcher };
  return fetch(input, nodeInit as RequestInit);
};

/**
 * Orchestrates communication with remote A2A agents.
 * Manages protocol negotiation, authentication, and transport selection.
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
   * Loads an agent by fetching its AgentCard and caches the client.
   * @param name The name to assign to the agent.
   * @param agentCardUrl {string} The full URL to the agent's card.
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

    // Pin URL to IP to prevent DNS rebinding for gRPC (connection-level SSRF protection)
    const grpcInterface = agentCard.additionalInterfaces?.find(
      (i) => i.transport === 'GRPC',
    );
    const urlToPin = grpcInterface?.url ?? agentCard.url;
    const { pinnedUrl, hostname } = await pinUrlToIp(urlToPin, name);

    // Prepare base gRPC options
    const baseGrpcOptions: ConstructorParameters<
      typeof GrpcTransportFactory
    >[0] = {
      grpcChannelCredentials: getGrpcCredentials(urlToPin),
    };

    // Include extension properties required for SSRF pinning using object spread.
    // This allows us to pass additional properties that the SDK uses internally
    // without triggering narrow-to-broad type assertion warnings.
    const fullGrpcOptions = {
      ...baseGrpcOptions,
      target: pinnedUrl,
      grpcChannelOptions: getGrpcChannelOptions(hostname),
    };

    // Configure standard SDK client for tool registration and discovery
    const clientOptions = ClientFactoryOptions.createFrom(
      ClientFactoryOptions.default,
      {
        transports: [
          new RestTransportFactory({ fetchImpl }),
          new JsonRpcTransportFactory({ fetchImpl }),
          new GrpcTransportFactory(
            fullGrpcOptions as ConstructorParameters<
              typeof GrpcTransportFactory
            >[0],
          ),
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
      }) as AsyncIterable<SendMessageResult>;
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
    // Validate URL to prevent SSRF (with DNS resolution)
    if (await isPrivateIpAsync(url)) {
      // Local/private IPs are allowed ONLY for localhost for testing.
      const parsed = new URL(url);
      if (!isLoopbackHost(parsed.hostname)) {
        throw new Error(
          `Refusing to load agent '${agentName}' from private IP range: ${url}. Remote agents must use public URLs.`,
        );
      }
    }

    const { baseUrl, path } = splitAgentCardUrl(url);
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
        if (!isLoopbackHost(parsed.hostname)) {
          throw new Error(
            `Refusing to load agent '${agentName}': contains transport URL pointing to private IP range: ${url}.`,
          );
        }
      }
    }
  }
}
