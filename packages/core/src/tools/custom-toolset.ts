/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Tool, ToolResult } from './tools.js';
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
import { SubAgentTool } from './sub-agent.js';

export interface CustomToolsetToolParams {
  name: string;
  tools: string[];
}

export class CustomToolsetTool extends BaseTool<
  CustomToolsetToolParams,
  ToolResult
> {
  static readonly Name = 'custom_toolset';
  private tools: Tool[];

  constructor(tools: Tool[]) {
    super(
      CustomToolsetTool.Name,
      'CustomToolset',
      'Creates a custom toolset that can be used by a sub-agent.',
      {
        properties: {
          name: {
            type: 'string',
            description: 'The name of the custom toolset.',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'A list of tools to be included in the toolset.',
          },
        },
        required: ['name', 'tools'],
        type: 'object',
      },
    );
    this.tools = tools;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  execute(params: CustomToolsetToolParams): Promise<ToolResult> {
    const { name, tools } = params;
    const toolset = this.createToolset(tools);
    this.config.addCustomToolset(name, toolset);
    return Promise.resolve({
      llmContent: `Custom toolset "${name}" created with tools: ${tools.join(
        ', ',
      )}`,
      returnDisplay: `Custom toolset "${name}" created.`,
    });
  }

  private createToolset(toolNames: string[]): Tool[] {
    const allTools = {
      [EditTool.Name]: new EditTool(this.config),
      [ReadFileTool.Name]: new ReadFileTool(
        this.config.getTargetDir(),
        this.config,
      ),
      [WriteFileTool.Name]: new WriteFileTool(this.config),
      [ReadManyFilesTool.Name]: new ReadManyFilesTool(
        this.config.getTargetDir(),
        this.config,
      ),
      [GlobTool.Name]: new GlobTool(this.config.getTargetDir()),
      [GrepTool.Name]: new GrepTool(this.config.getTargetDir()),
      [LSTool.Name]: new LSTool(this.config.getTargetDir()),
      [MemoryTool.Name]: new MemoryTool(this.config.getMemory()),
      [ShellTool.Name]: new ShellTool(this.config),
      [WebFetchTool.Name]: new WebFetchTool(),
      [WebSearchTool.Name]: new WebSearchTool(),
      [SubAgentTool.Name]: new SubAgentTool(this.config),
    };
    return toolNames.map((toolName) => {
      const tool = allTools[toolName];
      if (!tool) {
        throw new Error(`Tool ${toolName} not found.`);
      }
      return tool;
    });
  }
}
