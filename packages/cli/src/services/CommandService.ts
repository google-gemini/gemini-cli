/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, CommandContext } from '../ui/commands/types.js';
import { Config } from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { MessageType } from '../ui/types.js';

// This is a temporary type until we define the full YAML structure.
interface CustomCommandYaml {
  name: string;
  description: string;
  prompt: string;
}

export class CommandService {
  private commands: Command[] = [];
  private commandContext: CommandContext;

  constructor(
    private readonly config: Config,
    commandContext: CommandContext,
  ) {
    this.commandContext = commandContext;
  }

  async loadCommands(): Promise<void> {
    const fileCommands = await this.loadCommandsFromFileSystem();
    // In the future, we will load built-in commands here as well.
    this.commands = [...fileCommands];
  }

  getCommands(): Command[] {
    return this.commands;
  }

  private async loadCommandsFromFileSystem(): Promise<Command[]> {
    const customCommands: Command[] = [];
    const commandDir = path.join(
      this.config.getProjectRoot() || process.cwd(),
      '.gemini',
      'commands',
    );

    try {
      const files = await fs.readdir(commandDir);
      for (const file of files) {
        if (file.endsWith('.gemini.yml') || file.endsWith('.gemini.yaml')) {
          const filePath = path.join(commandDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const commandData = yaml.load(content) as CustomCommandYaml;

            if (
              commandData.name &&
              commandData.description &&
              commandData.prompt
            ) {
              customCommands.push({
                name: commandData.name,
                description: commandData.description,
                action: () => {
                  this.commandContext.ui.addItem(
                    {
                      type: MessageType.USER,
                      text: commandData.prompt,
                    },
                    Date.now(),
                  );
                },
              });
            }
          } catch (e) {
            console.error(`Error loading command from ${file}:`, e);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
        // It's okay if the directory doesn't exist, but log other errors.
        console.error('Error reading custom commands directory:', error);
      }
    }

    return customCommands;
  }
}
