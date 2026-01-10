/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from './types.js';

const {
  mockExtensionsCommand,
  mockListExtensionsCommand,
  mockExtensionsCommandInstance,
  mockListExtensionsCommandInstance,
} = vi.hoisted(() => {
  const listInstance: Command = {
    name: 'extensions list',
    description: 'Lists all installed extensions.',
    execute: vi.fn(),
  };

  const extInstance: Command = {
    name: 'extensions',
    description: 'Manage extensions.',
    execute: vi.fn(),
    subCommands: [listInstance],
  };

  return {
    mockListExtensionsCommandInstance: listInstance,
    mockExtensionsCommandInstance: extInstance,
    mockExtensionsCommand: vi.fn(() => extInstance),
    mockListExtensionsCommand: vi.fn(() => listInstance),
  };
});

vi.mock('./extensions.js', () => ({
  ExtensionsCommand: mockExtensionsCommand,
  ListExtensionsCommand: mockListExtensionsCommand,
}));

vi.mock('./init.js', () => ({
  InitCommand: vi.fn(() => ({
    name: 'init',
    description: 'Initializes the server.',
    execute: vi.fn(),
  })),
}));

vi.mock('./restore.js', () => ({
  RestoreCommand: vi.fn(() => ({
    name: 'restore',
    description: 'Restores the server.',
    execute: vi.fn(),
  })),
}));

import { commandRegistry } from './command-registry.js';

describe('CommandRegistry', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    commandRegistry.initialize();
  });

  it('should register ExtensionsCommand on initialization', async () => {
    expect(mockExtensionsCommand).toHaveBeenCalled();
    const command = commandRegistry.get('extensions');
    expect(command).toBe(mockExtensionsCommandInstance);
  }, 20000);

  it('should register sub commands on initialization', async () => {
    const command = commandRegistry.get('extensions list');
    expect(command).toBe(mockListExtensionsCommandInstance);
  });

  it('get() should return undefined for a non-existent command', async () => {
    const command = commandRegistry.get('non-existent');
    expect(command).toBeUndefined();
  });

  it('register() should register a new command', async () => {
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
    const { debugLogger } = await import('@google/gemini-cli-core');
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
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
    warnSpy.mockRestore();
  });
});
