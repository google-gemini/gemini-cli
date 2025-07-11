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
import { ShellTool } from './shell.js';
import { WebSearchTool } from './web-search.js';
import { CatTool } from './cat-tool.js';
import { CpTool } from './cp-tool.js';
import { MkdirTool } from './mkdir-tool.js';
import { MvTool } from './mv-tool.js';
import { RmTool } from './rm-tool.js';
import { RmdirTool } from './rmdir-tool.js';
import { ToolRegistry } from './tool-registry.js';
import { GeminiChat } from '../core/geminiChat.js';
import { FunctionDeclaration, Tool as GenaiTool } from '@google/genai';

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

    let toolDeclarations: FunctionDeclaration[] = [];
    if (toolset) {
      const tools = this.getToolset(toolset);
      const tempToolRegistry = new ToolRegistry(this.config); // Create a temporary ToolRegistry
      tools.forEach(tool => tempToolRegistry.registerTool(tool));
      toolDeclarations = tempToolRegistry.getFunctionDeclarations();
    } else {
      // If no toolset specified, use the parent's tool declarations
      toolDeclarations = (await this.config.getToolRegistry()).getFunctionDeclarations();
    }

    const toolsForSubAgent: GenaiTool[] = [{ functionDeclarations: toolDeclarations }];

    // Create a new GeminiChat instance for the sub-agent
    const subAgentChat = new GeminiChat(
      this.config, // Use the existing config
      this.config.getGeminiClient().getContentGenerator(), // Use the existing content generator
      {
        // generateContentConfig
        tools: toolsForSubAgent,
      },
      [], // Empty history for the sub-agent's chat
    );

    const result = await subAgentChat.sendMessage({ message: { text: task } });
    return {
      llmContent: result.text || '',
      returnDisplay: result.text || '',
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
          return new GlobTool(config.getTargetDir(), config);
        case GrepTool.Name:
          return new GrepTool(config.getTargetDir());
        case LSTool.Name:
          return new LSTool(config.getTargetDir(), config);
        case CatTool.Name:
          return new CatTool();
        case CpTool.Name:
          return new CpTool();
        case MkdirTool.Name:
          return new MkdirTool();
        case MvTool.Name:
          return new MvTool();
        case RmTool.Name:
          return new RmTool();
        case RmdirTool.Name:
          return new RmdirTool();
        case ShellTool.Name:
          return new ShellTool(config);
        case WebSearchTool.Name:
          return new WebSearchTool(config);
        default:
          throw new Error(`Tool ${toolName} not found.`);
      }
    };

    return toolset.map((toolName) => createToolInstance(toolName, this.config));
  }
}
