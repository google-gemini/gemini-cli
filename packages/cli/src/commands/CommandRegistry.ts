/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SessionEngine, ProviderRegistry } from '@zoe/core';

export interface CommandContext {
  session: SessionEngine;
  exit: () => void;
  registry?: ProviderRegistry;
}

export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<string | void> | string | void;

export class CommandRegistry {
  private commands = new Map<string, { description: string; handler: CommandHandler }>();
  private providerRegistry: ProviderRegistry;

  constructor(providerRegistry?: ProviderRegistry) {
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();

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

    this.register('model', 'Inspect or switch active model (e.g. /model llama3.2)', (args, ctx) => {
      const modelArg = args[0]?.trim();
      if (!modelArg) {
        return `Active provider: ${ctx.session.getProvider().name}\nActive model: ${ctx.session.getModel()}`;
      }

      const registry = ctx.registry ?? this.providerRegistry;
      const resolved = registry.resolve(modelArg);
      ctx.session.setProvider(resolved.provider, resolved.model);

      return `Switched model to ${resolved.model} (${resolved.provider.name}).`;
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

    return await command.handler(args, { ...ctx, registry: this.providerRegistry });
  }
}
