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
import { SubAgentTool } from './sub-agent.js';

export interface CustomToolsetToolParams {
  name: string;
  tools: string[];
}

export class CustomToolsetTool extends BaseTool<CustomToolsetToolParams, ToolResult> {
  static readonly Name = 'custom_toolset';

  constructor(private readonly config: Config) {
    super(
      CustomToolsetTool.Name,
      'CustomToolset',
      'Defines a custom toolset for specific workflows.',
      {
        properties: {
          name: {
            type: 'string',
            description: 'The name of the custom toolset.',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'A list of tools to be included in the custom toolset.',
          },
        },
        required: ['name', 'tools'],
        type: 'object',
      },
    );
  }

  async execute(params: CustomToolsetToolParams): Promise<ToolResult> {
    const { name, tools } = params;
    const toolset = this.getToolset(tools);
    this.config.addToolset(name, toolset);
    return {
      llmContent: `Custom toolset '${name}' created with ${tools.length} tools.`,
      returnDisplay: `Custom toolset '${name}' created with ${tools.length} tools.`,
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
      [SubAgentTool.Name]: new SubAgentTool(this.config),
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
