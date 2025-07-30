/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FunctionDeclaration,
  FunctionDeclarationSchemaType,
} from '@google/genai';
import { A2AClientManager } from './a2a-client.js';
import { Message } from './types.js';

// Note: The tool definitions are simplified for this initial implementation.
// A production implementation would have more robust schema validation.

export const loadAgentTool: FunctionDeclaration = {
  name: 'load_agent',
  description:
    "Retrieves and caches an agent's metadata (AgentCard) from a URL to make it known to the system.",
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      url: {
        type: FunctionDeclarationSchemaType.STRING,
        description: 'The URL of the A2A agent to load.',
      },
    },
    required: ['url'],
  },
};

export const listAgentsTool: FunctionDeclaration = {
  name: 'list_agents',
  description: 'Lists all A2A agents that are currently known to the system.',
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {},
  },
};

export const sendMessageTool: FunctionDeclaration = {
  name: 'send_message',
  description:
    'Connects to a known A2A agent, sends a message, and returns a task ID.',
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      agent_url: {
        type: FunctionDeclarationSchemaType.STRING,
        description: 'The URL of the target agent. Must be loaded first.',
      },
      message: {
        type: FunctionDeclarationSchemaType.OBJECT,
        description:
          'The message object, conforming to the A2A Message type.',
        // In a real scenario, we would have a more detailed schema
        // that matches the `Message` type from the SDK.
      },
    },
    required: ['agent_url', 'message'],
  },
};

export const getTaskTool: FunctionDeclaration = {
  name: 'get_task',
  description: 'Retrieves the status and result of a task.',
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      taskId: {
        type: FunctionDeclarationSchemaType.STRING,
        description: 'The ID of the task to query.',
      },
    },
    required: ['taskId'],
  },
};

export const cancelTaskTool: FunctionDeclaration = {
  name: 'cancel_task',
  description: 'Cancels a running task.',
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      taskId: {
        type: FunctionDeclarationSchemaType.STRING,
        description: 'The ID of the task to cancel.',
      },
    },
    required: ['taskId'],
  },
};

/**
 * A class that provides the implementation for the A2A tools.
 */
export class A2AToolFunctions {
  private clientManager = A2AClientManager.getInstance();

  async load_agent(args: { url: string }): Promise<string> {
    const { url } = args;
    const agentCard = await this.clientManager.loadAgent(url);
    return `Successfully loaded agent: ${agentCard.name}. Capabilities: ${agentCard.capabilities.join(', ')}`;
  }

  async list_agents(): Promise<string> {
    const agents = this.clientManager.listAgents();
    if (agents.length === 0) {
      return 'No agents are currently loaded.';
    }
    return agents
      .map((agent) => `- ${agent.name} (${agent.url})`)
      .join('\n');
  }

  async send_message(args: {
    agent_url: string;
    message: Message;
  }): Promise<string> {
    const { agent_url, message } = args;
    const task = await this.clientManager.sendMessage(agent_url, message);
    return `Message sent. Task ID: ${task.id}`;
  }

  async get_task(args: { taskId: string }): Promise<string> {
    const { taskId } = args;
    const task = await this.clientManager.getTask(taskId);
    return `Task ${task.id}: ${task.state}. Result: ${JSON.stringify(task.result)}`;
  }

  async cancel_task(args: { taskId: string }): Promise<string> {
    const { taskId } = args;
    await this.clientManager.cancelTask(taskId);
    return `Task ${taskId} cancelled successfully.`
  }
}
