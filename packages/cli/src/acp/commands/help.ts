/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import type { CommandRegistry } from './commandRegistry.js';

export class HelpCommand implements Command {
  readonly name = 'help';
  readonly description = 'Show available commands';

  constructor(private registry: CommandRegistry) {}

  async execute(
    _context: CommandContext,
    _args: string[] = [],
  ): Promise<CommandExecutionResponse> {
    const commands = this.registry
      .getAllCommands()
      .sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [];

    lines.push('Gemini CLI Help:');
    lines.push('');
    lines.push('### Basics');
    lines.push(
      '- **Add context**: Use `@` to specify files for context (e.g., `@src/myFile.ts`) to target specific files or folders.',
    );
    lines.push('');

    lines.push('### Commands');
    for (const cmd of commands) {
      if (cmd.description) {
        lines.push(`- **/${cmd.name}** - ${cmd.description}`);
      }
    }

    return {
      name: this.name,
      data: lines.join('\n'),
    };
  }
}
