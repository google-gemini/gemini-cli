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
  mockSpawnWorkerCommand,
  mockListWorkersCommand,
  mockGetWorkerCommand,
  mockCancelWorkerCommand,
  mockInitCommand,
  mockRestoreCommand,
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

  const spawnWorkerInstance: Command = {
    name: 'spawn-worker',
    description: 'Spawn a background worker task.',
    execute: vi.fn(),
  };

  const listWorkersInstance: Command = {
    name: 'list-workers',
    description: 'List active background workers.',
    execute: vi.fn(),
  };

  const getWorkerInstance: Command = {
    name: 'get-worker',
    description: 'Get details of a specific worker.',
    execute: vi.fn(),
  };

  const cancelWorkerInstance: Command = {
    name: 'cancel-worker',
    description: 'Cancel a running worker.',
    execute: vi.fn(),
  };

  const initInstance: Command = {
    name: 'init',
    description: 'Initializes the server.',
    execute: vi.fn(),
  };

  const restoreInstance: Command = {
    name: 'restore',
    description: 'Restores server state.',
    execute: vi.fn(),
  };

  return {
    mockListExtensionsCommandInstance: listInstance,
    mockExtensionsCommandInstance: extInstance,
    mockExtensionsCommand: vi.fn(() => extInstance),
    mockListExtensionsCommand: vi.fn(() => listInstance),
    mockSpawnWorkerCommand: vi.fn(() => spawnWorkerInstance),
    mockListWorkersCommand: vi.fn(() => listWorkersInstance),
    mockGetWorkerCommand: vi.fn(() => getWorkerInstance),
    mockCancelWorkerCommand: vi.fn(() => cancelWorkerInstance),
    mockInitCommand: vi.fn(() => initInstance),
    mockRestoreCommand: vi.fn(() => restoreInstance),
  };
});

vi.mock('./extensions.js', () => ({
  ExtensionsCommand: mockExtensionsCommand,
  ListExtensionsCommand: mockListExtensionsCommand,
}));

vi.mock('./init.js', () => ({
  InitCommand: mockInitCommand,
}));

vi.mock('./restore.js', () => ({
  RestoreCommand: mockRestoreCommand,
}));

vi.mock('./spawn-worker.js', () => ({
  SpawnWorkerCommand: mockSpawnWorkerCommand,
  ListWorkersCommand: mockListWorkersCommand,
  GetWorkerCommand: mockGetWorkerCommand,
  CancelWorkerCommand: mockCancelWorkerCommand,
}));

describe('CommandRegistry', () => {
  let commandRegistry: Awaited<
    typeof import('./command-registry.js')
  >['commandRegistry'];

  beforeEach(async () => {
    vi.resetModules();
    commandRegistry = (await import('./command-registry.js')).commandRegistry;
  });

  it('register() should register a command', async () => {
    const mockCommand: Command = {
      name: 'test-command',
      description: 'A test command',
      execute: vi.fn(),
    };
    commandRegistry.register(mockCommand);

    expect(commandRegistry.get('test-command')).toBe(mockCommand);
  });

  it('get() should return undefined for an unregistered command', async () => {
    expect(commandRegistry.get('unregistered-command')).toBeUndefined();
  });

  it('getAllCommands() should return all registered commands', async () => {
    const commands = commandRegistry.getAllCommands();

    // Should have extensions, init, restore, and spawn-worker commands
    expect(commands.length).toBeGreaterThanOrEqual(2);
    expect(commands).toContain(mockExtensionsCommandInstance);
    expect(commands).toContain(mockListExtensionsCommandInstance);
  });

  it('register() should register nested sub commands for a newly registered command', async () => {
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
