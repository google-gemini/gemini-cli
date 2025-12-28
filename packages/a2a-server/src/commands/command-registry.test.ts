/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from './types.js';

describe('CommandRegistry', () => {
  const mockListExtensionsCommandInstance: Command = {
    name: 'extensions list',
    description: 'Lists all installed extensions.',
    execute: vi.fn(),
  };
  const mockListExtensionsCommand = vi.fn(
    () => mockListExtensionsCommandInstance,
  );

  const mockExtensionsCommandInstance: Command = {
    name: 'extensions',
    description: 'Manage extensions.',
    execute: vi.fn(),
    subCommands: [mockListExtensionsCommandInstance],
  };
  const mockExtensionsCommand = vi.fn(() => mockExtensionsCommandInstance);

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('./extensions.js', () => ({
      ExtensionsCommand: mockExtensionsCommand,
      ListExtensionsCommand: mockListExtensionsCommand,
    }));
  });

  it('should register ExtensionsCommand on initialization', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    expect(mockExtensionsCommand).toHaveBeenCalled();
    const command = commandRegistry.get('extensions');
    expect(command).toBe(mockExtensionsCommandInstance);
  });

  it('should register sub commands on initialization', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const command = commandRegistry.get('extensions list');
    expect(command).toBe(mockListExtensionsCommandInstance);
  });

  it('get() should return undefined for a non-existent command', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const command = commandRegistry.get('non-existent');
    expect(command).toBeUndefined();
  });

  it('register() should register a new command', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const mockCommand: Command = {
      name: 'test-command',
      description: '',
      execute: vi.fn(),
    };
    commandRegistry.register(mockCommand);
    const command = commandRegistry.get('test-command');
    expect(command).toBe(mockCommand);
  });

  it('register() should register a nested command', async () => {
    const { commandRegistry } = await import('./command-registry.js');
    const mockSubSubCommand: Command = {
      name: 'test-command-sub-sub',
      description: '',
      execute: vi.fn(),
    };
    const mockSubCommand: Command = {
      name: 'test-command-sub',
      description: '',
      execute: vi.fn(),
      subCommands: [mockSubSubCommand],
    };
    const mockCommand: Command = {
      name: 'test-command',
      description: '',
      execute: vi.fn(),
      subCommands: [mockSubCommand],
    };
    commandRegistry.register(mockCommand);

    const command = commandRegistry.get('test-command');
    const subCommand = commandRegistry.get('test-command-sub');
    const subSubCommand = commandRegistry.get('test-command-sub-sub');

    expect(command).toBe(mockCommand);
    expect(subCommand).toBe(mockSubCommand);
    expect(subSubCommand).toBe(mockSubSubCommand);
  });

  it('register() should not enter an infinite loop with a cyclic command', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { commandRegistry } = await import('./command-registry.js');
    const mockCommand: Command = {
      name: 'cyclic-command',
      description: '',
      subCommands: [],
      execute: vi.fn(),
    };

    mockCommand.subCommands?.push(mockCommand); // Create cycle

    commandRegistry.register(mockCommand);

    expect(commandRegistry.get('cyclic-command')).toBe(mockCommand);
    expect(warnSpy).toHaveBeenCalledWith(
      'Command cyclic-command already registered. Skipping.',
    );
    // If the test finishes, it means we didn't get into an infinite loop.
    warnSpy.mockRestore();
  });
});
