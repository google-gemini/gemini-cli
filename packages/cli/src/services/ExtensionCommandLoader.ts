/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ICommandLoader } from './types.js';
import { CommandKind, SlashCommand } from '../ui/commands/types.js';
import { Extension } from '../config/extension.js';
import * as fs from 'fs';
import * as path from 'path';
import toml from '@iarna/toml';

interface TomlCommand {
  name?: unknown;
  prompt?: unknown;
  description?: unknown;
}

export class ExtensionCommandLoader implements ICommandLoader {
  constructor(private readonly extensions: Extension[]) {}

  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const commands: SlashCommand[] = [];
    for (const extension of this.extensions) {
      if (signal.aborted) {
        return commands;
      }
      const commandsDir = path.join(extension.path, 'commands');
      if (!fs.existsSync(commandsDir)) {
        continue;
      }

      const files = this.findTomlFiles(commandsDir);
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const parsed = toml.parse(content) as TomlCommand;

          if (
            typeof parsed.name === 'string' &&
            typeof parsed.prompt === 'string'
          ) {
            commands.push({
              name: parsed.name,
              description:
                typeof parsed.description === 'string'
                  ? parsed.description
                  : '',
              kind: CommandKind.FILE, // Treat extension commands like file commands
              extensionName: extension.config.name,
              action: async () => ({
                type: 'submit_prompt',
                content: parsed.prompt as string,
              }),
            });
          }
        } catch (e) {
          // Ignore errors for now
          console.warn('Failed to load command: ' + e);
        }
      }
    }
    return commands;
  }

  private findTomlFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...this.findTomlFiles(fullPath));
      } else if (fullPath.endsWith('.toml')) {
        files.push(fullPath);
      }
    }
    return files;
  }
}
