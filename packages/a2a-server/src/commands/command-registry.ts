/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionsCommand } from './extensions.js';
import type { Command } from './types.js';

class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  constructor() {
    this.register(new ExtensionsCommand());
  }

  register(command: Command) {
    if (this.commands.has(command.name)) {
      console.warn(`Command ${command.name} already registered. Skipping.`);
      return;
    }

    this.commands.set(command.name, command);

    for (const subCommand of command.subCommands ?? []) {
      this.register(subCommand);
    }
  }

  get(commandName: string): Command | undefined {
    return this.commands.get(commandName);
  }

  getAllCommands(): Command[] {
    return [...this.commands.values()];
  }
}

export const commandRegistry = new CommandRegistry();
