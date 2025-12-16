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
} from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  DefaultAgentCardResolver,
  RestTransportFactory,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import { GoogleAuth } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

// Auth is handled via GoogleAuth / ADC in the fetchImpl.
// See createFetchImpl for details.
type SendMessageResult = Message | Task;
/**
 * Manages A2A clients and caches loaded agent information.
 * Follows a singleton pattern to ensure a single client instance.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;

  // Each agent should manage their own context/taskIds/card/etc
  private clients = new Map<string, Client>();
  private agentCards = new Map<string, AgentCard>();

  private auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  private constructor(_config: Config) {
    // Config currently unused by A2AClientManager but kept for Singleton signature
  }

  /**
   * Gets the singleton instance of the A2AClientManager.
   */
  static getInstance(config?: Config): A2AClientManager {
    if (!A2AClientManager.instance) {
      if (!config) {
        throw new Error('A2AClientManager requires config to be initialized.');
      }
      A2AClientManager.instance = new A2AClientManager(config);
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
   * @param agentCardUrl The base URL (Agent Card URL) of the agent.
   * @param accessToken Optional bearer token for authentication.
   * @returns The loaded AgentCard.
   */
  async loadAgent(
    name: string,
    agentCardUrl: string,
    accessToken?: string,
  ): Promise<AgentCard> {
    if (this.clients.has(name)) {
      throw new Error(`Agent with name '${name}' is already loaded.`);
    }

    const fetchImpl = this.createFetchImpl(accessToken);
    const resolver = new DefaultAgentCardResolver({ fetchImpl });
    const factory = new ClientFactory({
      cardResolver: resolver,
      transports: [
        new RestTransportFactory({ fetchImpl }),
        new JsonRpcTransportFactory({ fetchImpl }),
      ],
    });

    // Pass empty string as path to indicate that agentCardUrl is the full URL
    const client = await factory.createFromUrl(agentCardUrl, '');
    // Fetch the card explicitly to cache it, as Client might not expose it directly
    const agentCard = await resolver.resolve(agentCardUrl);

    debugLogger.log(
      'INFO',
      `Loaded AgentCard for ${name}:`,
      JSON.stringify(agentCard, null, 2),
    );

    this.clients.set(name, client);
    this.agentCards.set(name, agentCard);

    return agentCard;
  }

  /**
   * Sends a message to a loaded agent.
   * @param agentName The name of the agent to send the message to.
   * @param message The message content.
   * @param options Optional context and task IDs to maintain conversation state.
   * @returns The response from the agent, including updated context and task IDs.
   */
  async sendMessage(
    agentName: string,
    message: string,
    options?: { contextId?: string; taskId?: string },
  ): Promise<SendMessageResult & { contextId?: string; taskId?: string }> {
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

    debugLogger.log(
      'INFO',
      'DEBUG: A2AClientManager.sendMessage params:',
      JSON.stringify(messageParams, null, 2),
    );

    const response = await client.sendMessage(messageParams);



    debugLogger.log(
      'INFO',
      'DEBUG: A2AClientManager.sendMessage response:',
      JSON.stringify(response, null, 2),
    );

    // Response is already SendMessageResult (Message | Task)
    const result = response;

    let responseContextId: string | undefined = options?.contextId;
    let responseTaskId: string | undefined = options?.taskId;

    // Capture IDs
    if ('contextId' in result && result.contextId) {
      responseContextId = result.contextId;
    }

    if ('kind' in result && result.kind === 'task') {
       // It's a Task
       if (result.id) {
         responseTaskId = result.id;
       }

       // Check for task completion
       if (result.status && (result.status.state === 'completed')) {
          responseTaskId = undefined;
       }
    } else if ('kind' in result && result.kind === 'message') {
       // It's a Message
       if (result.taskId) {
         responseTaskId = result.taskId;
       }
    }

    // Return the result with forced IDs
    return {
      ...result,
      contextId: responseContextId,
      taskId: responseTaskId,
    } as SendMessageResult & { contextId?: string; taskId?: string };
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
    return client.getTask({ id: taskId });
  }

  /**
   * Cancels a task on an agent.
   * @param agentName The name of the agent.
   * @param taskId The ID of the task to cancel.
   * @returns The cancellation response.
   */
  async cancelTask(
    agentName: string,
    taskId: string,
  ): Promise<Task> {
    const client = this.clients.get(agentName);
    if (!client) {
      throw new Error(`Agent '${agentName}' not found.`);
    }
    return client.cancelTask({ id: taskId });
  }

  private createFetchImpl(accessToken?: string) {
    return async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      let urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const headers = new Headers(init?.headers);
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      } else {
        try {
          const client = await this.auth.getClient();
          const token = await client.getAccessToken();
          if (token.token) {
            headers.set('Authorization', `Bearer ${token.token}`);
          }
        } catch (e) {
          debugLogger.log('ERROR', 'Failed to get ADC token:', e);
        }
      }
      const newInit = { ...init, headers };

      const response = await fetch(urlStr, newInit);

      if (!response.ok) {
        try {
          const errorBody = await response.clone().text();
          debugLogger.log(
            'ERROR',
            `A2AClient fetch error response: ${response.status} ${response.statusText}`,
            errorBody,
          );
        } catch (e) {
          debugLogger.log('ERROR', 'Failed to read error response body:', e);
        }
      }

      return response;
    };
  }
}
