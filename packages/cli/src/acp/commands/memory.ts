/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addMemory,
  listInboxSkills,
  listInboxPatches,
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
    new InboxMemoryCommand(),
  ];
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
    const result = showMemory(context.agentContext.config);
    return { name: this.name, data: result.content };
  }
}

export class RefreshMemoryCommand implements Command {
  readonly name = 'memory refresh';
  readonly aliases = ['memory reload'];
  readonly description = 'Refreshes the memory from the source.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const result = await refreshMemory(context.agentContext.config);
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
    const result = listMemoryFiles(context.agentContext.config);
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

    const toolRegistry = context.agentContext.toolRegistry;
    const tool = toolRegistry.getTool(result.toolName);
    if (tool) {
      const abortController = new AbortController();
      const signal = abortController.signal;

      await context.sendMessage(`Saving memory via ${result.toolName}...`);

      await tool.buildAndExecute(result.toolArgs, signal, undefined, {
        shellExecutionConfig: {
          sanitizationConfig: DEFAULT_SANITIZATION_CONFIG,
          sandboxManager: context.agentContext.sandboxManager,
        },
      });
      await refreshMemory(context.agentContext.config);
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

export class InboxMemoryCommand implements Command {
  readonly name = 'memory inbox';
  readonly description =
    'Lists skills extracted from past sessions that are pending review.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    if (!context.agentContext.config.isAutoMemoryEnabled()) {
      return {
        name: this.name,
        data: 'The memory inbox requires Auto Memory. Enable it with: experimental.autoMemory = true in settings.',
      };
    }

    const [skills, patches] = await Promise.all([
      listInboxSkills(context.agentContext.config),
      listInboxPatches(context.agentContext.config),
    ]);

    if (skills.length === 0 && patches.length === 0) {
      return { name: this.name, data: 'No items in inbox.' };
    }

    const lines: string[] = [];
    for (const s of skills) {
      const date = s.extractedAt
        ? ` (extracted: ${new Date(s.extractedAt).toLocaleDateString()})`
        : '';
      lines.push(`- **${s.name}**: ${s.description}${date}`);
    }
    for (const p of patches) {
      const targets = p.entries.map((e) => e.targetPath).join(', ');
      const date = p.extractedAt
        ? ` (extracted: ${new Date(p.extractedAt).toLocaleDateString()})`
        : '';
      lines.push(`- **${p.name}** (update): patches ${targets}${date}`);
    }

    const total = skills.length + patches.length;
    return {
      name: this.name,
      data: `Memory inbox (${total}):\n${lines.join('\n')}`,
    };
  }
}
