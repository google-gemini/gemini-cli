/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionEngine } from '@zoe/core';

export interface CommandContext {
  session: SessionEngine;
  exit: () => void;
}

export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<string | void> | string | void;

export class CommandRegistry {
  private commands = new Map<string, { description: string; handler: CommandHandler }>();

  constructor() {
    this.register('help', 'Show available commands', () => {
      const lines = ['Available commands:'];
      for (const [name, meta] of this.commands.entries()) {
        lines.push(`  /${name.padEnd(8)} - ${meta.description}`);
      }
      return lines.join('\n');
    });

    this.register('clear', 'Clear terminal screen history', (_args, ctx) => {
      ctx.session.clearHistory();
    });

    this.register('exit', 'Exit Zoe', (_args, ctx) => {
      ctx.exit();
    });

    this.register('version', 'Show Zoe version', () => {
      return 'Zoe v0.1.0';
    });
  }

  public register(name: string, description: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), { description, handler });
  }

  public isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  public async execute(input: string, ctx: CommandContext): Promise<string | void> {
    const trimmed = input.trim().slice(1); // remove leading '/'
    const [cmdName, ...args] = trimmed.split(/\s+/);
    const command = this.commands.get(cmdName.toLowerCase());

    if (!command) {
      return `Unknown command: /${cmdName}. Type /help for available commands.`;
    }

    return await command.handler(args, ctx);
  }
}
