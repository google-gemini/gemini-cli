/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';

const loadBuiltInCommands = async (): Promise<SlashCommand[]> => [
  aboutCommand,
  authCommand,
  clearCommand,
  helpCommand,
  memoryCommand,
  privacyCommand,
  themeCommand,
];

export class CommandService {
  private commands: SlashCommand[] = [];

  constructor(
    private commandLoader: () => Promise<SlashCommand[]> = loadBuiltInCommands,
  ) {
    // The constructor can be used for dependency injection in the future.
  }

  async loadCommands(): Promise<void> {
    // For now, we only load the built-in commands.
    // File-based and remote commands will be added later.
    this.commands = await this.commandLoader();
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }
}
