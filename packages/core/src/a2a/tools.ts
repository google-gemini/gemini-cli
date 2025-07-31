/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { A2AClientManager } from './a2a-client.js';
import { Message } from '@a2a-js/sdk';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { textResponse } from './utils.js';

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

export const SendMessageInputSchema = z.object({
  agent_name: z.string().describe('The name of the target agent.'),
  message: z.string().describe('The text message to send to the agent.'),
});

// TODO create a map of taskId to agent_name so this doesn't neeed to be passed
export const GetTaskInputSchema = z.object({
  agent_name: z.string().describe('The name of the target agent.'),
  taskId: z.string().describe('The ID of the task to query.'),
});

export const CancelTaskInputSchema = z.object({
  agent_name: z.string().describe('The name of the target agent.'),
  taskId: z.string().describe('The ID of the task to cancel.'),
});

// Zod Schemas for Tool Outputs
export const StringOutputSchema = z.object({
  output: z.string(),
});

/**
 * A class that provides the implementation for the A2A tools.
 */
export class A2AToolFunctions {
  private clientManager = A2AClientManager.getInstance();

  async load_agent(
    args: z.infer<typeof LoadAgentInputSchema>,
  ): Promise<CallToolResult> {
    const { url, agent_card_path } = args;
    try {
      const agentCard = await this.clientManager.loadAgent(
        url,
        agent_card_path,
      );
      const output = `Successfully loaded agent: ${agentCard.name}. Skills: ${JSON.stringify(agentCard.skills)}`;
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

  async send_message(
    args: z.infer<typeof SendMessageInputSchema>,
  ): Promise<CallToolResult> {
    const { agent_name, message } = args;
    // TODO: Construct a full A2A Message
    return textResponse(
      await this.clientManager.sendMessage(agent_name, message),
    );
  }

  async get_task(
    args: z.infer<typeof GetTaskInputSchema>,
  ): Promise<CallToolResult> {
    const unimplementedString = await this.clientManager.getTask(
      args.agent_name,
      args.taskId,
    );
    return textResponse(
      `'get_task' is not yet implemented. Task ID: ${args.taskId}`,
    );
  }

  async cancel_task(
    args: z.infer<typeof CancelTaskInputSchema>,
  ): Promise<CallToolResult> {
    return textResponse(
      `'cancel_task' is not yet implemented. Task ID: ${args.taskId}`,
    );
  }
}
