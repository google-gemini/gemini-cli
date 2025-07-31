/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {MessageSendParams} from '@a2a-js/sdk';
import { AgentCard, Message, Task, TaskState, Message1 } from '@a2a-js/sdk';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';
import {extractMessageText, extractTaskText} from './utils.js';

const AGENT_CARD_WELL_KNOWN_PATH = '/.well-known/agent-card.json'


/**
 * Manages the A2A client and caches loaded agent information.
 * Follows a singleton pattern to ensure a single client instance.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;
  private registeredAgents = new Map<string, A2AClient>();

  /**
   * Gets the singleton instance of the A2AClientManager.
   */
  public static getInstance(): A2AClientManager {
    if (!A2AClientManager.instance) {
      A2AClientManager.instance = new A2AClientManager();
    }
    console.error("created new A2AClientManager instance")
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
  public async loadAgent(url: string, agent_card_path?: string): Promise<AgentCard> {
    console.error(`Loading agent from URL: ${url}`);

    // Typescript SDK throws unrecoverable error if not located at well-known/agent.json
    const a2aClient = new A2AClient(url, agent_card_path || AGENT_CARD_WELL_KNOWN_PATH);
    this.registeredAgents.set(url, a2aClient!);

    return await a2aClient.getAgentCard()
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
   * @param agentUrl The URL of the agent.
   * @param message The message to send.
   * @returns The task representing the message exchange.
   */
  public async sendMessage(
    agentUrl: string,
    message: string,
  ): Promise<string> { // Support All SendMessageREsponse types


    const a2aClient = this.registeredAgents.get(agentUrl);
    if (!a2aClient) {
      throw new Error(
        `Agent at ${agentUrl} is not registered. Please run load_agent first.`,
      );
    }

    // TODO: Support more than just text
    const messageParams : MessageSendParams = {
      message: {
        kind: "message",
        role: "user",
        messageId: uuidv4(),
        parts: [
          {
            kind: "text",
            text: message,
          },
        ]
      }
    }

    const sendMessageResponse = await a2aClient.sendMessage(messageParams);
    if ('error' in sendMessageResponse) {
      return `There was an error getting a response from ${(await a2aClient.getAgentCard()).name}: ${sendMessageResponse.error.message};`
    } else if (sendMessageResponse.result.kind === "message") {
      return extractMessageText(sendMessageResponse.result)
    } else if (sendMessageResponse.result.kind === "task") {
      return extractTaskText(sendMessageResponse.result)
    } else {
      return "sendMessageResponse does not contain message or task, this should not happen."
    }
  }

  /**
   * Retrieves a task by its ID.
   * @param taskId The ID of the task.
   * @returns The task object.
   */
  public getTask(agentUrl: string, taskId: string): string {
    const a2aClient = this.registeredAgents.get(agentUrl)

    return "Unimplemented";
  }

  /**
   * Cancels a task by its ID.
   * @param taskId The ID of the task.
   */
  public async cancelTask(taskId: string): Promise<void> {
    // This functionality is not directly supported by the SDK in a simple way.
    // This is a placeholder for future, more complex implementation.
    throw new Error(
      `'cancel_task' is not yet implemented. Cannot cancel task with ID: ${taskId}`,
    );
  }
}
