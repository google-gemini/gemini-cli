/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionsCommand } from './extensions.js';
import { InitCommand } from './init.js';
import { RestoreCommand } from './restore.js';
import {
  SpawnWorkerCommand,
  ListWorkersCommand,
  GetWorkerCommand,
  CancelWorkerCommand,
} from './spawn-worker.js';
import type { Command } from './types.js';

class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  constructor() {
    this.register(new ExtensionsCommand());
    this.register(new RestoreCommand());
    this.register(new InitCommand());
    // Background Agents: Multi-agent orchestration commands
    this.register(new SpawnWorkerCommand());
    this.register(new ListWorkersCommand());
    this.register(new GetWorkerCommand());
    this.register(new CancelWorkerCommand());
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
