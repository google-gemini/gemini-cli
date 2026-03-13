/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Command,
  type CommandContext,
  type CommandExecutionResponse,
} from './types.js';

/**
 * Command to acknowledge (trust) a discovered agent.
 */
export class AcknowledgeAgentCommand implements Command {
  readonly name = 'acknowledge-agent';
  readonly description = 'Acknowledge (trust) a discovered agent.';
  readonly topLevel = true;
  readonly arguments = [
    {
      name: 'agentName',
      description: 'The unique name of the agent to acknowledge.',
      required: true,
    },
  ];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const agentName = args[0];
    if (!agentName) {
      throw new Error('Agent name is required.');
    }

    const agentRegistry = context.config.getAgentRegistry();
    if (!agentRegistry) {
      throw new Error('Agent registry not available.');
    }

    const agent = agentRegistry.getDiscoveredDefinition(agentName);
    if (!agent) {
      throw new Error(
        `Agent "${agentName}" not found among discovered agents.`,
      );
    }

    await agentRegistry.acknowledgeAgent(agent);

    return {
      name: this.name,
      data: `Successfully acknowledged agent: ${agentName}`,
    };
  }
}
