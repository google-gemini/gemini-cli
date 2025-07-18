/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '../config/config.js';
import { connectToMcpServer, discoverTools } from '../tools/mcp-client.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import {
  BackgroundAgentTasksResponseSchema,
  BackgroundAgentTaskResponseSchema,
  BackgroundAgentTask,
} from './types.js';

export async function loadBackgroundAgent(
  name: string,
  config: MCPServerConfig,
  debugMode: boolean,
): Promise<BackgroundAgent> {
  const server = await connectToMcpServer(name, config, debugMode);
  try {
    const tools = await discoverTools(name, config, server);
    return new BackgroundAgent(name, tools);
  } catch (error) {
    await server.close();
    throw error;
  }
}

export class BackgroundAgent {
  readonly startTaskTool: DiscoveredMCPTool;
  readonly getTaskTool: DiscoveredMCPTool;
  readonly listTasksTool: DiscoveredMCPTool;
  readonly messageTaskTool: DiscoveredMCPTool;
  readonly deleteTaskTool: DiscoveredMCPTool;
  readonly cancelTaskTool: DiscoveredMCPTool;

  constructor(
    readonly serverName: string,
    tools: DiscoveredMCPTool[],
  ) {
    const getToolOrFail = (name: string): DiscoveredMCPTool => {
      for (const tool of tools) {
        if (tool.serverToolName === name) {
          return tool;
        }
      }
      throw new Error(`missing expected tool: ${name}`);
    };

    this.startTaskTool = getToolOrFail('startTask');
    this.getTaskTool = getToolOrFail('getTask');
    this.listTasksTool = getToolOrFail('listTasks');
    this.messageTaskTool = getToolOrFail('messageTask');
    this.deleteTaskTool = getToolOrFail('deleteTask');
    this.cancelTaskTool = getToolOrFail('cancelTask');
  }

  async startTask(prompt: string): Promise<BackgroundAgentTask> {
    const resp = await this.callTool(this.startTaskTool, {
      prompt: {
        role: 'user',
        parts: [{ text: prompt }],
      },
    });
    const taskResp = await BackgroundAgentTaskResponseSchema.parseAsync(resp);
    return taskResp.structuredContent;
  }

  async getTask(
    id: string,
    historyLength?: number,
  ): Promise<BackgroundAgentTask> {
    const resp = await this.callTool(this.getTaskTool, {
      id,
      historyLength,
    });
    const taskResp = await BackgroundAgentTaskResponseSchema.parseAsync(resp);
    return taskResp.structuredContent;
  }

  async listTasks(): Promise<BackgroundAgentTask[]> {
    const resp = await this.callTool(this.listTasksTool, {});
    const tasksResp = await BackgroundAgentTasksResponseSchema.parseAsync(resp);
    return tasksResp.structuredContent;
  }

  async messageTask(id: string, message: string) {
    await this.callTool(this.messageTaskTool, {
      id,
      message: {
        role: 'user',
        parts: [{ text: message }],
      },
    });
  }

  async deleteTask(id: string) {
    await this.callTool(this.deleteTaskTool, { id });
  }

  async cancelTask(id: string) {
    await this.callTool(this.cancelTaskTool, { id });
  }

  private async callTool(
    tool: DiscoveredMCPTool,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { llmContent: parts } = await tool.execute(params);
    if (
      !Array.isArray(parts) ||
      parts.length !== 1 ||
      typeof parts[0] !== 'object' ||
      parts[0]?.functionResponse?.response === undefined
    ) {
      throw new Error('Expected exactly one part with a functionResponse');
    }
    const resp = parts[0].functionResponse.response;
    if ('isError' in resp && resp.isError) {
      throw new Error(`Error calling ${tool.displayName}: ${resp}`);
    }
    return resp;
  }
}
