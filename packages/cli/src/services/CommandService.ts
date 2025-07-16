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
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';

const loadBuiltInCommands = async (
  config: Config | null,
): Promise<SlashCommand[]> => {
  const allCommands = [
    aboutCommand,
    authCommand,
    clearCommand,
    extensionsCommand,
    helpCommand,
    ideCommand(config),
    memoryCommand,
    privacyCommand,
    statsCommand,
    themeCommand,
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