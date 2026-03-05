/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addMemory,
  listMemoryFiles,
  refreshMemory,
  showMemory,
} from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';

const DEFAULT_SANITIZATION_CONFIG = {
  allowedEnvironmentVariables: [],
  blockedEnvironmentVariables: [],
  enableEnvironmentVariableRedaction: false,
};

export class MemoryCommand implements Command {
  readonly name = 'memory';
  readonly description = 'Manage memory.';
  readonly subCommands = [
    new ShowMemoryCommand(),
    new RefreshMemoryCommand(),
    new ListMemoryCommand(),
    new AddMemoryCommand(),
  ];
  readonly topLevel = true;
  readonly requiresWorkspace = true;

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    return new ShowMemoryCommand().execute(context, _);
  }
}

export class ShowMemoryCommand implements Command {
  readonly name = 'memory show';
  readonly description = 'Shows the current memory contents.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const result = showMemory(context.config);
    return { name: this.name, data: result.content };
  }
}

export class RefreshMemoryCommand implements Command {
  readonly name = 'memory refresh';
  readonly description = 'Refreshes the memory from the source.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const result = await refreshMemory(context.config);
    return { name: this.name, data: result.content };
  }
}

export class ListMemoryCommand implements Command {
  readonly name = 'memory list';
  readonly description = 'Lists the paths of the GEMINI.md files in use.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const result = listMemoryFiles(context.config);
    return { name: this.name, data: result.content };
  }
}

export class AddMemoryCommand implements Command {
  readonly name = 'memory add';
  readonly description = 'Add content to the memory.';

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const textToAdd = args.join(' ').trim();
    const result = addMemory(textToAdd);
    if (result.type === 'message') {
      return { name: this.name, data: result.content };
    }

    const toolRegistry = context.config.getToolRegistry();
    const tool = toolRegistry.getTool(result.toolName);
    if (tool) {
      const abortController = new AbortController();
      const signal = abortController.signal;
      await tool.buildAndExecute(result.toolArgs, signal, undefined, {
        sanitizationConfig: DEFAULT_SANITIZATION_CONFIG,
      });
      await refreshMemory(context.config);
      return {
        name: this.name,
        data: `Added memory: "${textToAdd}"`,
      };
    } else {
      return {
        name: this.name,
        data: `Error: Tool ${result.toolName} not found.`,
      };
    }
  }
}
