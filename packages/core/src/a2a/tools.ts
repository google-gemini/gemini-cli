/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { A2AClientManager } from './a2a-client.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { extractMessageText, extractTaskText, textResponse } from './utils.js';
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
    const sanitizedAgentName = agentName.replace(/\s/g, '');

    // Register send_message for the agent
    this.server.registerTool(
      `${sanitizedAgentName}_sendMessage`,
      {
        description: `Sends a message to the ${agentName} agent.`,
        inputSchema: AgentSendMessageInputSchema.shape,
      },
      async (args: z.infer<typeof AgentSendMessageInputSchema>) => {
        try {
          const response = await this.clientManager.sendMessage(
            agentName,
            args.message,
          );
          if ('error' in response) {
            return textResponse(
              `Error from agent ${agentName}: ${response.error.message}`,
            );
          }
          if (response.result.kind === 'message') {
            return textResponse(extractMessageText(response.result));
          }
          return textResponse(extractTaskText(response.result));
        } catch (e) {
          const error = e as Error;
          return textResponse(
            `Failed to send message to ${agentName}: ${error.message}`,
          );
        }
      },
    );

    // Register get_task for the agent
    this.server.registerTool(
      `${sanitizedAgentName}_getTask`,
      {
        description: `Retrieves a task from the ${agentName} agent.`,
        inputSchema: AgentGetTaskInputSchema.shape,
      },
      async (args: z.infer<typeof AgentGetTaskInputSchema>) => {
        try {
          const response = await this.clientManager.getTask(
            agentName,
            args.taskId,
          );
          if ('error' in response) {
            return textResponse(
              `Error from agent ${agentName} when getting task ${response.error.message}`,
            );
          }
          return textResponse(extractTaskText(response.result));
        } catch (e) {
          const error = e as Error;
          return textResponse(
            `Failed to get task from agent ${agentName}: ${error.message}`,
          );
        }
      },
    );

    // Register cancel_task for the agent
    this.server.registerTool(
      `${sanitizedAgentName}_cancelTask`,
      {
        description: `Cancels a task on the ${agentName} agent.`,
        inputSchema: AgentCancelTaskInputSchema.shape,
      },
      async (args: z.infer<typeof AgentCancelTaskInputSchema>) => {
        try {
          const response = await this.clientManager.cancelTask(
            agentName,
            args.taskId,
          );
          if ('error' in response) {
            return textResponse(
              `Error from agent ${agentName} when canceling task: ${response.error.message}`,
            );
          }
          return textResponse(extractTaskText(response.result));
        } catch (e) {
          const error = e as Error;
          return textResponse(
            `Failed to Cancel Task on Agent ${agentName}: ${error.message}`,
          );
        }
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

      const sanitizedAgentName = agentCard.name.replace(/\s/g, '');
      const output = `Successfully loaded agent: ${agentCard.name}. New tools registered: ${sanitizedAgentName}_sendMessage, ${sanitizedAgentName}_getTask, ${sanitizedAgentName}_cancelTask.`;
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
