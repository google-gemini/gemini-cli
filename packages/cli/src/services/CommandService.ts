/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '@google/gemini-cli-core';
import { SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { chatCommand } from '../ui/commands/chatCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';

const loadBuiltInCommands = async (
  config: Config | null,
): Promise<SlashCommand[]> => {
  const allCommands = [
    aboutCommand,
    authCommand,
    bugCommand,
    chatCommand,
    clearCommand,
    compressCommand,
    docsCommand,
    editorCommand,
    extensionsCommand,
    helpCommand,
    ideCommand(config),
    mcpCommand,
    memoryCommand,
    privacyCommand,
    quitCommand,
    restoreCommand(config),
    statsCommand,
    themeCommand,
    toolsCommand,
  ];

  return allCommands.filter(
    (command): command is SlashCommand => command !== null,
  );
};

export class CommandService {
  private commands: SlashCommand[] = [];

  constructor(
    private config: Config | null,
    private commandLoader: (
      config: Config | null,
    ) => Promise<SlashCommand[]> = loadBuiltInCommands,
  ) {
    // The constructor can be used for dependency injection in the future.
  }

  async loadCommands(): Promise<void> {
    // For now, we only load the built-in commands.
    // File-based and remote commands will be added later.
    this.commands = await this.commandLoader(this.config);
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }
}
