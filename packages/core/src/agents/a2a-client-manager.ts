/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentCard, Message, MessageSendParams, Task } from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
  type AuthenticationHandler,
  createAuthenticatingFetchWithRetry,
} from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import { debugLogger } from '../utils/debugLogger.js';

export type SendMessageResult = Message | Task;

/**
 * Manages A2A clients and caches loaded agent information.
 * Follows a singleton pattern to ensure a single client instance.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;

  // Each agent should manage their own context/taskIds/card/etc
  private clients = new Map<string, Client>();
  private agentCards = new Map<string, AgentCard>();

  private constructor() { }

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


  /**
   * Loads an agent by fetching its AgentCard and caches the client.
   * @param name The name to assign to the agent.
   * @param agentCardUrl The full URL to the agent's card.
   * @param authHandler Optional authentication handler to use for this agent.
   * @param timeoutMs Optional timeout in milliseconds for the initial load.
   * @returns The loaded AgentCard.
   */
  async loadAgent(
    name: string,
    agentCardUrl: string,
    authHandler?: AuthenticationHandler,
    timeoutMs?: number,
  ): Promise<AgentCard> {
    if (this.clients.has(name) && this.agentCards.has(name)) {
      throw new Error(`Agent with name '${name}' is already loaded.`);
    }

    let fetchImpl: typeof fetch = fetch;
    if (authHandler) {
      fetchImpl = createAuthenticatingFetchWithRetry(fetch, authHandler);
    }

    // Apply a timeout specifically for the initial load if requested
    let loadFetchImpl = fetchImpl;
    if (timeoutMs) {
      loadFetchImpl = async (input, init) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error(`Fetch timed out after ${timeoutMs}ms`)), timeoutMs);
        try {
          return await fetchImpl(input, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
      };
    }

    const resolver = new DefaultAgentCardResolver({ fetchImpl: loadFetchImpl });

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

    console.error(`[A2AClientManager] Attempting to load card for ${name} at ${agentCardUrl}`);
    const factory = new ClientFactory(options);

    try {
      const client = await factory.createFromUrl(agentCardUrl, '');
      console.error(`[A2AClientManager] Created client for ${name}. Fetching card...`);
      const agentCard = await client.getAgentCard();
      console.error(`[A2AClientManager] Successfully fetched card for ${name}`);

      this.clients.set(name, client);
      this.agentCards.set(name, agentCard);

      debugLogger.debug(
        `[A2AClientManager] Loaded agent '${name}' from ${agentCardUrl}`,
      );

      return agentCard;
    } catch (e) {
      console.error(`[A2AClientManager] Fatal error fetching ${name}: ${e}`);
      throw e;
    }
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
   * Sends a message to a loaded agent.
   * @param agentName The name of the agent to send the message to.
   * @param message The message content.
   * @param options Optional context and task IDs to maintain conversation state.
   * @returns The response from the agent (Message or Task).
   * @throws Error if the agent returns an error response.
   */
  async sendMessage(
    agentName: string,
    message: string,
    options?: { contextId?: string; taskId?: string; blocking?: boolean; pushNotificationUrl?: string },
  ): Promise<SendMessageResult> {
    const client = this.clients.get(agentName);
    if (!client) {
      throw new Error(`Agent '${agentName}' not found.`);
    }

    const messageParams: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text: message }],
        contextId: options?.contextId,
        taskId: options?.taskId,
      },
      configuration: {
        blocking: options?.blocking ?? true,
        pushNotificationConfig: options?.pushNotificationUrl ? { url: options.pushNotificationUrl } : undefined,
      },
    };

    try {
      return await client.sendMessage(messageParams);
    } catch (error: unknown) {
      const prefix = `A2AClient SendMessage Error [${agentName}]`;
      if (error instanceof Error) {
        throw new Error(`${prefix}: ${error.message}`, { cause: error });
      }
      throw new Error(
        `${prefix}: Unexpected error during sendMessage: ${String(error)}`,
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
    if (!client) {
      throw new Error(`Agent '${agentName}' not found.`);
    }
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
    if (!client) {
      throw new Error(`Agent '${agentName}' not found.`);
    }
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
}
