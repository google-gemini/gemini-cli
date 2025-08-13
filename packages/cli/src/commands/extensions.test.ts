/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { extensionsCommand } from './extensions.js';
import { type Argv } from 'yargs';
import yargs from 'yargs';

describe('extensions command', () => {
  it('should have correct command definition', () => {
    expect(extensionsCommand.command).toBe('extensions');
    expect(extensionsCommand.describe).toBe('Manage extensions');
    expect(typeof extensionsCommand.builder).toBe('function');
    expect(typeof extensionsCommand.handler).toBe('function');
  });

  it('should have exactly one option (help flag)', () => {
    // Test to ensure that the global 'gemini' flags are not added to the mcp command
    const yargsInstance = yargs();
    const builtYargs = extensionsCommand.builder(yargsInstance);
    const options = builtYargs.getOptions();

    // Should have exactly 1 option (help flag)
    expect(Object.keys(options.key).length).toBe(1);
    expect(options.key).toHaveProperty('help');
  });

  it('should register install subcommand', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };

    extensionsCommand.builder(mockYargs as unknown as Argv);

    expect(mockYargs.command).toHaveBeenCalledTimes(1);

    // Verify that the specific subcommands are registered
    const commandCalls = mockYargs.command.mock.calls;
    const commandNames = commandCalls.map((call) => call[0].command);

    expect(commandNames).toContain('install [source] [args...]');

    expect(mockYargs.demandCommand).toHaveBeenCalledWith(
      1,
      'You need at least one command before continuing.',
    );
  });
});
