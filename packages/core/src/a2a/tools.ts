/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { A2AClientManager } from './a2a-client.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { textResponse } from './utils.js';
import { A2AToolRegistry } from './a2a-tool-registry.js';

// Zod Schemas for Tool Inputs
// Reconcile/Merge this with ./types.js
export const LoadAgentInputSchema = z.object({
  url: z.string().describe('The URL of the A2A agent to load.'),
  agent_card_path: z
    .string()
    .optional()
    .describe(
      'The path to the agent card endpoint, relative to the base URL. Defaults to `/.well-known/agent-card.json`',
    ),
  token: z
    .string()
    .optional()
    .describe('static Bearer token for authentication.'),
});

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
    const { url, agent_card_path, token } = args;
    try {
      const agentCard = await this.clientManager.loadAgent(
        url,
        agent_card_path,
        token,
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
