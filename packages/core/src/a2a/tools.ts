/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { A2AClientManager } from './a2a-client.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { textResponse } from './utils.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentCard } from '@a2a-js/sdk';

// Zod Schemas for Tool Inputs
export const LoadAgentInputSchema = z.object({
  url: z.string().describe('The URL of the A2A agent to load.'),
  agent_card_path: z
    .string()
    .optional()
    .describe(
      'The path to the agent card endpoint, relative to the base URL. Defaults to `/.well-known/agent-card.json`',
    ),
});

// New schema for agent-specific send_message
export const AgentSendMessageInputSchema = z.object({
  message: z.string().describe('The text message to send to the agent.'),
});

// New schema for agent-specific get_task
export const AgentGetTaskInputSchema = z.object({
  taskId: z.string().describe('The ID of the task to query.'),
});

// New schema for agent-specific cancel_task
export const AgentCancelTaskInputSchema = z.object({
  taskId: z.string().describe('The ID of the task to cancel.'),
});

// Zod Schemas for Tool Outputs
export const StringOutputSchema = z.object({
  output: z.string(),
});

export class A2AToolRegistry {
  constructor(
    private server: McpServer,
    private clientManager: A2AClientManager,
  ) {}

  registerToolsForAgent(agentCard: AgentCard): void {
    const agentName = agentCard.name;

    // Register send_message for the agent
    this.server.registerTool(
      `${agentName}_sendMessage`,
      {
        description: `Sends a message to the ${agentName} agent.`,
        inputSchema: AgentSendMessageInputSchema.shape,
      },
      async (args: z.infer<typeof AgentSendMessageInputSchema>) => {
        return textResponse(
          await this.clientManager.sendMessage(agentName, args.message),
        );
      },
    );

    // Register get_task for the agent
    this.server.registerTool(
      `${agentName}_getTask`,
      {
        description: `Retrieves a task from the ${agentName} agent.`,
        inputSchema: AgentGetTaskInputSchema.shape,
      },
      async (args: z.infer<typeof AgentGetTaskInputSchema>) => {
        // Note: Implementation for get_task is currently a placeholder
        return textResponse(
          `'get_task' is not yet implemented for ${agentName}. Task ID: ${args.taskId}`,
        );
      },
    );

    // Register cancel_task for the agent
    this.server.registerTool(
      `${agentName}_cancelTask`,
      {
        description: `Cancels a task on the ${agentName} agent.`,
        inputSchema: AgentCancelTaskInputSchema.shape,
      },
      async (args: z.infer<typeof AgentCancelTaskInputSchema>) => {
        // Note: Implementation for cancel_task is currently a placeholder
        return textResponse(
          `'cancel_task' is not yet implemented for ${agentName}. Task ID: ${args.taskId}`,
        );
      },
    );
  }
}

/**
 * A class that provides the implementation for the A2A tools.
 */
export class A2AToolFunctions {
  constructor(
    private registry: A2AToolRegistry,
    private clientManager: A2AClientManager,
  ) {}

  async load_agent(
    args: z.infer<typeof LoadAgentInputSchema>,
  ): Promise<CallToolResult> {
    const { url, agent_card_path } = args;
    try {
      const agentCard = await this.clientManager.loadAgent(
        url,
        agent_card_path,
      );

      // Delegate registration
      this.registry.registerToolsForAgent(agentCard);

      const output = `Successfully loaded agent: ${agentCard.name}. New tools registered: ${agentCard.name}_sendMessage, ${agentCard.name}_getTask, ${agentCard.name}_cancelTask.`;
      return textResponse(output);
    } catch (error) {
      return textResponse(`Failed to load agent: ${error}`);
    }
  }

  async list_agents(): Promise<CallToolResult> {
    const agents = await this.clientManager.listAgents();
    if (agents.length === 0) {
      return textResponse('No agents are currently loaded.');
    }
    const output = agents
      .map((agent) => `- ${agent.name} (${agent.url})`)
      .join('\n');
    return textResponse(output);
  }
}
