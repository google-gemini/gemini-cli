/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { EditTool } from './edit.js';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { GlobTool } from './glob.js';
import { GrepTool } from './grep.js';
import { LsTool } from './ls.js';
import { MemoryTool } from './memoryTool.js';
import { ShellTool } from './shell.js';
import { WebFetchTool } from './web-fetch.js';
import { WebSearchTool } from './web-search.js';

export interface SubAgentToolParams {
  task: string;
  toolset?: string[];
}

export class SubAgentTool extends BaseTool<SubAgentToolParams, ToolResult> {
  static readonly Name = 'sub_agent';

  constructor(private readonly config: Config) {
    super(
      SubAgentTool.Name,
      'SubAgent',
      'Creates a sub-agent to perform a specific task with its own context and tool access.',
      {
        properties: {
          task: {
            type: 'string',
            description: 'The task to be performed by the sub-agent.',
          },
          toolset: {
            type: 'array',
            items: { type: 'string' },
            description: 'A list of tools to be made available to the sub-agent.',
          },
        },
        required: ['task'],
        type: 'object',
      },
    );
  }

  async execute(params: SubAgentToolParams): Promise<ToolResult> {
    const { task, toolset } = params;
    const subAgentConfig = this.config.clone();
    if (toolset) {
      const tools = this.getToolset(toolset);
      subAgentConfig.setTools(tools);
    }
    const subAgent = subAgentConfig.getAgent();
    const result = await subAgent.chat(task);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }

  private getToolset(toolset: string[]): BaseTool<unknown, ToolResult>[] {
    const allTools = {
      [EditTool.Name]: new EditTool(this.config),
      [ReadFileTool.Name]: new ReadFileTool(this.config.getTargetDir(), this.config),
      [WriteFileTool.Name]: new WriteFileTool(this.config),
      [ReadManyFilesTool.Name]: new ReadManyFilesTool(this.config.getTargetDir(), this.config),
      [GlobTool.Name]: new GlobTool(this.config.getTargetDir()),
      [GrepTool.Name]: new GrepTool(this.config.getTargetDir()),
      [LsTool.Name]: new LsTool(this.config.getTargetDir()),
      [MemoryTool.Name]: new MemoryTool(this.config.getMemory()),
      [ShellTool.Name]: new ShellTool(this.config),
      [WebFetchTool.Name]: new WebFetchTool(),
      [WebSearchTool.Name]: new WebSearchTool(),
    };
    return toolset.map((toolName) => {
      const tool = allTools[toolName];
      if (!tool) {
        throw new Error(`Tool ${toolName} not found.`);
      }
      return tool;
    });
  }
}
