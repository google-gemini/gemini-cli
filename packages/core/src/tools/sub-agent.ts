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
import { LSTool } from './ls.js';
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
            description:
              'A list of tools to be made available to the sub-agent.',
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

  private getToolset(toolset: string[]): Array<BaseTool<unknown, ToolResult>> {
    const createToolInstance = (toolName: string, config: Config): BaseTool<unknown, ToolResult> => {
      switch (toolName) {
        case EditTool.Name:
          return new EditTool(config);
        case ReadFileTool.Name:
          return new ReadFileTool(config.getTargetDir(), config);
        case WriteFileTool.Name:
          return new WriteFileTool(config);
        case ReadManyFilesTool.Name:
          return new ReadManyFilesTool(config.getTargetDir(), config);
        case GlobTool.Name:
          return new GlobTool(config.getTargetDir());
        case GrepTool.Name:
          return new GrepTool(config.getTargetDir());
        case LSTool.Name:
          return new LSTool(config.getTargetDir());
        // case MemoryTool.Name:
        //   return new MemoryTool() as BaseTool<unknown, ToolResult>;
        case ShellTool.Name:
          return new ShellTool(config);
        // case WebFetchTool.Name:
        //   return new WebFetchTool(config) as BaseTool<unknown, ToolResult>;
        case WebSearchTool.Name:
          return new WebSearchTool(config);
        default:
          throw new Error(`Tool ${toolName} not found.`);
      }
    };

    return toolset.map((toolName) => createToolInstance(toolName, this.config));
  }
}
