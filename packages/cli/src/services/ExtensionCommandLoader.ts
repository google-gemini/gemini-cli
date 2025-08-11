/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ICommandLoader } from './types.js';
import { CommandKind, SlashCommand } from '../ui/commands/types.js';
import { Extension } from '../config/extension.js';
import * as path from 'path';
import toml from '@iarna/toml';
import { promises as fs } from 'fs';
import { glob } from 'glob';

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
      try {
        await fs.access(commandsDir);

        const files = await glob('**/*.toml', {
          cwd: commandsDir,
          nodir: true,
          dot: true,
          signal,
          follow: true,
        });

        for (const file of files) {
          if (signal.aborted) {
            return commands;
          }
          const fullPath = path.join(commandsDir, file);
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const parsed = toml.parse(content) as TomlCommand;

            if (
              typeof parsed.name === 'string' &&
              parsed.name.trim() !== '' &&
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
            // Also log the file that failed to load for better debugging.
            console.warn(`Failed to load command from ${fullPath}: ${e}`);
          }
        }
      } catch (e) {
        console.warn(`Failed to load extensions commands: ${e}`);
        continue;
      }
    }
    return commands;
  }
}
