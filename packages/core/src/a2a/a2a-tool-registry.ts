/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { A2AClientManager } from './a2a-client.js';
import { extractMessageText, extractTaskText, textResponse } from './utils.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentCard } from '@a2a-js/sdk';

// Zod Schemas for dynamically registered tools
export const AgentSendMessageInputSchema = z.object({
  message: z.string().describe('The text message to send to the agent.'),
});

export const AgentGetTaskInputSchema = z.object({
  taskId: z.string().describe('The ID of the task to query.'),
});

export const AgentCancelTaskInputSchema = z.object({
  taskId: z.string().describe('The ID of the task to cancel.'),
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