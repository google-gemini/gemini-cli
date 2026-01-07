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
    if (this.clients.has(name)) {
      throw new Error(`Agent with name '${name}' is already loaded.`);
    }

    let fetchImpl: typeof fetch = fetch;
    if (authHandler) {
      fetchImpl = createAuthenticatingFetchWithRetry(fetch, authHandler);
    }

    // Wrap with custom adapter for ADK Reasoning Engine compatibility
    // TODO: Remove this when a2a-js fixes compatibility
    fetchImpl = createAdapterFetch(fetchImpl);

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
    const client = await factory.createFromUrl(agentCardUrl, '');
    const agentCard = await client.getAgentCard();

    this.clients.set(name, client);
    this.agentCards.set(name, agentCard);

    debugLogger.debug(
      `[A2AClientManager] Loaded agent '${name}' from ${agentCardUrl}`,
    );

    return agentCard;
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
    options?: { contextId?: string; taskId?: string },
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
        blocking: true,
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

/**
 * Maps TaskState proto-JSON enums to lower-case strings.
 */
function mapTaskState(state: string | undefined): string | undefined {
  if (!state) return state;
  if (state.startsWith('TASK_STATE_')) {
    return state.replace('TASK_STATE_', '').toLowerCase();
  }
  return state.toLowerCase();
}

/**
 * Creates a fetch implementation that adapts standard A2A SDK requests to the
 * proto-JSON dialect and endpoint shapes required by Vertex AI Agent Engine.
 */
export function createAdapterFetch(baseFetch: typeof fetch): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = input as string;

    // 2. Dialect Mapping (Request)
    let body = init?.body;
    let isRpc = false;
    let rpcId: string | number | undefined;

    if (typeof body === 'string') {
      try {
        let jsonBody = JSON.parse(body);

        // Unwrap JSON-RPC if present
        if (jsonBody.jsonrpc === '2.0') {
          isRpc = true;
          rpcId = jsonBody.id;
          jsonBody = jsonBody.params;
        }

        // Apply dialect translation to the message object
        const message = jsonBody.message || jsonBody;
        if (message && typeof message === 'object') {
          // Role: user -> ROLE_USER, agent/model -> ROLE_AGENT
          if (message.role === 'user') message.role = 'ROLE_USER';
          if (message.role === 'agent' || message.role === 'model') {
            message.role = 'ROLE_AGENT';
          }

          // Strip SDK-specific 'kind' field
          delete message.kind;

          // Map 'parts' to 'content' (Proto-JSON dialect often uses 'content' or typed parts)
          // Also strip 'kind' from parts.
          if (Array.isArray(message.parts)) {
            message.content = message.parts.map(
              (p: { kind?: string; text?: string }) => {
                const { kind: _k, ...rest } = p;
                // If it's a simple text part, ensure it matches { text: "..." }
                if (p.kind === 'text') return { text: p.text };
                return rest;
              },
            );
            delete message.parts;
          }
        }

        body = JSON.stringify(jsonBody);
      } catch (error) {
        debugLogger.debug(
          '[A2AClientManager] Failed to parse request body for dialect translation:',
          error,
        );
        // Non-JSON or parse error; let the baseFetch handle it.
      }
    }

    const response = await baseFetch(urlStr, { ...init, body });

    // Map response back
    if (response.ok) {
      try {
        const responseData = await response.clone().json();

        const result =
          responseData.task || responseData.message || responseData;

        // Restore 'kind' for the SDK and a2aUtils parsing
        if (result && typeof result === 'object' && !result.kind) {
          if (responseData.task || (result.id && result.status)) {
            result.kind = 'task';
          } else if (responseData.message || result.messageId) {
            result.kind = 'message';
          }
        }

        // Restore 'kind' on parts so extractMessageText works
        if (result?.parts && Array.isArray(result.parts)) {
          for (const part of result.parts) {
            if (!part.kind) {
              if (part.file) part.kind = 'file';
              else if (part.data) part.kind = 'data';
              else if (part.text) part.kind = 'text';
            }
          }
        }

        // Recursively restore 'kind' on artifact parts
        if (result?.artifacts && Array.isArray(result.artifacts)) {
          for (const artifact of result.artifacts) {
            if (artifact.parts && Array.isArray(artifact.parts)) {
              for (const part of artifact.parts) {
                if (!part.kind) {
                  if (part.file) part.kind = 'file';
                  else if (part.data) part.kind = 'data';
                  else if (part.text) part.kind = 'text';
                }
              }
            }
          }
        }

        // Map Task States back to SDK expectations
        if (result && typeof result === 'object' && result.status) {
          result.status.state = mapTaskState(result.status.state);
        }

        if (isRpc) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpcId,
              result,
            }),
            response,
          );
        }
        return new Response(JSON.stringify(result), response);
      } catch (_e) {
        // Non-JSON response or unwrapping failure
      }
    }

    return response;
  };
}
