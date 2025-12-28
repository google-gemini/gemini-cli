/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { allowCommand } from './allow.js';
import { type Argv } from 'yargs';
import yargs from 'yargs';

describe('allow command', () => {
  it('should have correct command definition', () => {
    expect(allowCommand.command).toBe('allow');
    expect(allowCommand.describe).toBe('Manage allowed tools (whitelist)');
    expect(typeof allowCommand.builder).toBe('function');
    expect(typeof allowCommand.handler).toBe('function');
  });

  it('should show help when no subcommand is provided', async () => {
    const yargsInstance = yargs();
    (allowCommand.builder as (y: Argv) => Argv)(yargsInstance);

    const parser = yargsInstance.command(allowCommand).help();

    // Mock console.log and console.error to catch help output
    const consoleLogMock = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {});
    const consoleErrorMock = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await parser.parse('allow');
    } catch (_error) {
      // yargs might throw an error when demandCommand is not met
    }

    // Check if help output is shown
    const helpOutput =
      consoleLogMock.mock.calls.join('\n') +
      consoleErrorMock.mock.calls.join('\n');
    expect(helpOutput).toContain('Manage allowed tools (whitelist)');
    expect(helpOutput).toContain('Commands:');
    expect(helpOutput).toContain('add');
    expect(helpOutput).toContain('remove');
    expect(helpOutput).toContain('list');

    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  it('should register add, remove, and list subcommands', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
      middleware: vi.fn().mockReturnThis(),
    };

    (allowCommand.builder as (y: Argv) => Argv)(mockYargs as unknown as Argv);

    expect(mockYargs.command).toHaveBeenCalledTimes(3);

    // Verify that the specific subcommands are registered
    const commandCalls = mockYargs.command.mock.calls;
    const commandNames = commandCalls.map((call) => call[0].command);

    expect(commandNames).toContain('add <tool>');
    expect(commandNames).toContain('remove <tool>');
    expect(commandNames).toContain('list');

    expect(mockYargs.demandCommand).toHaveBeenCalledWith(
      1,
      'You need at least one command before continuing.',
    );
  });
});
