/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { A2AClient, Agent, AgentCard, Task, Message } from './types.js';

/**
 * Manages the A2A client and caches loaded agent information.
 * Follows a singleton pattern to ensure a single client instance.
 */
export class A2AClientManager {
  private static instance: A2AClientManager;
  private client: A2AClient;
  private agentCardCache = new Map<string, AgentCard>();
  private connectedAgentsCache = new Map<string, Agent>();

  private constructor() {
    this.client = new A2AClient();
  }

  /**
   * Gets the singleton instance of the A2AClientManager.
   */
  public static getInstance(): A2AClientManager {
    if (!A2AClientManager.instance) {
      A2AClientManager.instance = new A2AClientManager();
    }
    return A2AClientManager.instance;
  }

  /**
   * Initializes the A2A client.
   * This method can be expanded later to handle startup logic.
   */
  public async initialize(): Promise<void> {
    // Placeholder for any future initialization logic.
    // For now, the client is instantiated in the constructor.
    return Promise.resolve();
  }

  /**
   * Fetches and caches an agent's card.
   * @param url The URL of the agent.
   * @returns The agent's card.
   */
  public async loadAgent(url: string): Promise<AgentCard> {
    const agentCard = await this.client.getAgentCard(url);
    this.agentCardCache.set(url, agentCard);
    return agentCard;
  }

  /**
   * Lists all cached agent cards.
   * @returns An array of loaded agent cards.
   */
  public listAgents(): AgentCard[] {
    return Array.from(this.agentCardCache.values());
  }

  /**
   * Connects to an agent and sends a message.
   * @param agentUrl The URL of the agent.
   * @param message The message to send.
   * @returns The task representing the message exchange.
   */
  public async sendMessage(
    agentUrl: string,
    message: Message,
  ): Promise<Task> {
    if (!this.agentCardCache.has(agentUrl)) {
      throw new Error(
        `Agent at ${agentUrl} is not loaded. Please run load_agent first.`,
      );
    }
    const agent = await this.client.connect(agentUrl);
    this.connectedAgentsCache.set(agentUrl, agent); // Cache the connection
    return agent.sendMessage(message);
  }

  /**
   * Retrieves a task by its ID.
   * @param taskId The ID of the task.
   * @returns The task object.
   */
  public async getTask(taskId: string): Promise<Task> {
    // The SDK does not currently have a top-level `getTask` method.
    // This assumes we would need to iterate through connected agents
    // that have a `getTask` capability. This is a placeholder.
    // A real implementation would need a more robust way to track tasks.
    for (const agent of this.connectedAgentsCache.values()) {
      try {
        // This is a hypothetical method call
        const task = await agent.getTask(taskId);
        if (task) {
          return task;
        }
      } catch (e) {
        // Ignore errors if an agent doesn't have the task.
      }
    }
    throw new Error(`Task with ID ${taskId} not found on any connected agent.`);
  }

  /**
   * Cancels a task by its ID.
   * @param taskId The ID of the task.
   */
  public async cancelTask(taskId: string): Promise<void> {
    // This is also a hypothetical implementation detail.
    for (const agent of this.connectedAgentsCache.values()) {
      try {
        // This is a hypothetical method call
        await agent.cancelTask(taskId);
        return; // Assume success on the first agent that has the task
      } catch (e) {
        // Ignore errors
      }
    }
    throw new Error(
      `Could not cancel task with ID ${taskId} on any connected agent.`,
    );
  }
}
