/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { HelpCommand } from './help.js';
import { CommandRegistry } from './commandRegistry.js';
import type { Command, CommandContext } from './types.js';

describe('HelpCommand', () => {
  it('returns formatted help text with sorted commands', async () => {
    const registry = new CommandRegistry();

    const cmdB: Command = {
      name: 'bravo',
      description: 'Bravo command',
      execute: async () => ({ name: 'bravo', data: '' }),
    };

    const cmdA: Command = {
      name: 'alpha',
      description: 'Alpha command',
      execute: async () => ({ name: 'alpha', data: '' }),
    };

    registry.register(cmdB);
    registry.register(cmdA);

    const helpCommand = new HelpCommand(registry);

    const context = {} as CommandContext;

    const response = await helpCommand.execute(context, []);

    expect(response.name).toBe('help');

    const data = response.data as string;

    expect(data).toContain('Gemini CLI Help:');
    expect(data).toContain('### Basics');
    expect(data).toContain('### Commands');

    const lines = data.split('\n');
    const alphaIndex = lines.findIndex((l) => l.includes('/alpha'));
    const bravoIndex = lines.findIndex((l) => l.includes('/bravo'));

    expect(alphaIndex).toBeLessThan(bravoIndex);
    expect(alphaIndex).not.toBe(-1);
    expect(bravoIndex).not.toBe(-1);
  });
});
