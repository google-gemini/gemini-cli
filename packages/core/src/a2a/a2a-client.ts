/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AgentCard,
  CancelTaskResponse,
  GetTaskResponse,
  MessageSendParams,
  SendMessageResponse,
} from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

const AGENT_CARD_WELL_KNOWN_PATH = '/.well-known/agent-card.json';

/**
 * Manages the A2A client and caches loaded agent information.
 * Follows a singleton pattern to ensure a single client instance.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;
  private registeredAgents = new Map<string, A2AClient>(); // { agentName : A2AClient}
  private taskMap = new Map<string, Set<string>>(); // { agentName : taskId}

  /**
   * Gets the singleton instance of the A2AClientManager.
   */
  public static getInstance(): A2AClientManager {
    if (!A2AClientManager.instance) {
      A2AClientManager.instance = new A2AClientManager();
    }
    console.error('created new A2AClientManager instance');
    return A2AClientManager.instance;
  }

  /**
   * Initializes the A2A client.
   */
  public async initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * InitializedFetches and caches an agent's card.
   * @param url The URL of the agent.
   * @returns The agent's card.
   */
  public async loadAgent(
    url: string,
    agent_card_path?: string,
  ): Promise<AgentCard> {
    console.error(`Loading agent from URL: ${url}`);

    const a2aClient = new A2AClient(
      url,
      agent_card_path || AGENT_CARD_WELL_KNOWN_PATH,
    );
    const agentCard = await a2aClient.getAgentCard();
    this.registeredAgents.set(agentCard.name, a2aClient!);

    return agentCard;
  }

  /**
   * Lists all cached agent cards.
   * @returns An array of loaded agent cards.
   */
  public async listAgents(): Promise<AgentCard[]> {
    console.error('Listing all registered agents.');
    const agentCardsPromises = Array.from(this.registeredAgents.values()).map(
      (agentClient) => agentClient.getAgentCard(),
    );
    // Wait for all the promises to resolve
    const agentCards = await Promise.all(agentCardsPromises);
    console.error('Returning agent cards:', agentCards);
    return agentCards;
  }

  /**
   * Connects to an agent and sends a message.
   * @param agentName The name of the agent.
   * @param message The message to send.
   * @returns The task representing the message exchange.
   */
  public async sendMessage(
    agentName: string,
    message: string,
  ): Promise<SendMessageResponse> {
    const a2aClient = this.registeredAgents.get(agentName);
    if (!a2aClient) {
      throw new Error(
        `Agent with name ${agentName} is not registered. Please run load_agent first.`,
      );
    }

    const taskId = uuidv4(); // Generate a new taskId for the message
    this.taskMap.set(agentName, (this.taskMap.get(agentName) || new Set()).add(taskId));

    // TODO: Support more than just text
    const messageParams: MessageSendParams = {
      message: {
        kind: 'message',
        role: 'user',
        messageId: uuidv4(),
        parts: [
          {
            kind: 'text',
            text: message,
          },
        ],
        taskId: taskId,
      },
    };

    return a2aClient.sendMessage(messageParams);
  }

  /**
   * Retrieves a task by its ID.
   * @param taskId The ID of the task.
   * @returns The task object.
   */
  public async getTask(
    agentName: string,
    taskId: string,
  ): Promise<GetTaskResponse> {
    const a2aClient = this.registeredAgents.get(agentName);
    if (!a2aClient) {
      throw new Error(
        `Agent with name ${agentName} is not registered. Please run load_agent first.`,
      );
    }

    if (!this.taskMap.get(agentName)?.has(taskId)) {
      throw new Error(
        `Agent with name ${agentName} has no task ${taskId} associated with it.`,
      );
    }

    return a2aClient.getTask({ id: taskId });
  }

  /**
   * Cancels a task by its ID.
   * @param taskId The ID of the task.
   */
  public async cancelTask(
    agentName: string,
    taskId: string,
  ): Promise<CancelTaskResponse> {
    const a2aClient = this.registeredAgents.get(agentName);
    if (!a2aClient) {
      throw new Error(
        `Agent with name ${agentName} is not registered. Please run load_agent first.`,
      );
    }

    const agentTaskSet = this.taskMap.get(agentName);

    if (!agentTaskSet?.has(taskId)) {
      throw new Error(
        `Agent with name ${agentName} has no task ${taskId} associated with it.`,
      );
    }

    agentTaskSet.delete(taskId);

    return a2aClient.cancelTask({ id: taskId });
  }
}
