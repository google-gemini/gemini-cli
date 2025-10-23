/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ListExtensionsCommand } from './list-extensions.js';
import type { Config } from '@google/gemini-cli-core';

export interface Command {
  readonly names: string[];
  execute(config: Config, args: string[]): Promise<unknown>;
}

class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  constructor() {
    this.register(new ListExtensionsCommand());
  }

  register(command: Command) {
    for (const name of command.names) {
      this.commands.set(name, command);
    }
  }

  get(commandName: string): Command | undefined {
    return this.commands.get(commandName);
  }
}

export const commandRegistry = new CommandRegistry();
