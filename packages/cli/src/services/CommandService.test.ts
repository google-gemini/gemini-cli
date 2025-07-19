/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandService } from './CommandService.js';
import { type ICommandLoader } from './types.js';
import { type SlashCommand } from '../ui/commands/types.js';

const createMockCommand = (
  name: string,
  source: 'built-in' | 'file',
): SlashCommand => ({
  name,
  description: `Description for ${name}`,
  metadata: {
    source,
    behavior: 'Custom',
  },
  action: vi.fn(),
});

const mockCommandA = createMockCommand('command-a', 'built-in');
const mockCommandB = createMockCommand('command-b', 'built-in');
const mockCommandC = createMockCommand('command-c', 'file');
const mockCommandB_Override = createMockCommand('command-b', 'file');

class MockCommandLoader implements ICommandLoader {
  private commandsToLoad: SlashCommand[];

  constructor(commandsToLoad: SlashCommand[]) {
    this.commandsToLoad = commandsToLoad;
  }

  loadCommands = vi.fn(
    async (): Promise<SlashCommand[]> => Promise.resolve(this.commandsToLoad),
  );
}

describe('CommandService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with an empty list of commands', () => {
    const service = new CommandService([]);
    expect(service.getCommands()).toEqual([]);
  });

  it('should load commands from a single loader', async () => {
    const mockLoader = new MockCommandLoader([mockCommandA, mockCommandB]);
    const service = new CommandService([mockLoader]);

    await service.loadCommands();
    const commands = service.getCommands();

    expect(mockLoader.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandB]),
    );
  });

  it('should aggregate commands from multiple loaders', async () => {
    const loader1 = new MockCommandLoader([mockCommandA]);
    const loader2 = new MockCommandLoader([mockCommandC]);
    const service = new CommandService([loader1, loader2]);

    await service.loadCommands();
    const commands = service.getCommands();

    expect(loader1.loadCommands).toHaveBeenCalledTimes(1);
    expect(loader2.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandC]),
    );
  });

  it('should override commands from earlier loaders with those from later loaders', async () => {
    const loader1 = new MockCommandLoader([mockCommandA, mockCommandB]);
    const loader2 = new MockCommandLoader([
      mockCommandB_Override,
      mockCommandC,
    ]);
    const service = new CommandService([loader1, loader2]);

    await service.loadCommands();
    const commands = service.getCommands();

    expect(commands).toHaveLength(3); // Should be A, C, and the overridden B.

    // The final list should contain the override from the *last* loader.
    const commandB = commands.find((cmd) => cmd.name === 'command-b');
    expect(commandB).toBeDefined();
    expect(commandB?.metadata.source).toBe('file'); // Verify it's the overridden version.
    expect(commandB).toEqual(mockCommandB_Override);

    // Ensure the other commands are still present.
    expect(commands).toEqual(
      expect.arrayContaining([
        mockCommandA,
        mockCommandC,
        mockCommandB_Override,
      ]),
    );
  });

  it('should handle loaders that return an empty array of commands gracefully', async () => {
    const loader1 = new MockCommandLoader([mockCommandA]);
    const emptyLoader = new MockCommandLoader([]);
    const loader3 = new MockCommandLoader([mockCommandB]);
    const service = new CommandService([loader1, emptyLoader, loader3]);

    await service.loadCommands();
    const commands = service.getCommands();

    expect(emptyLoader.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandB]),
    );
  });

  it('should clear existing commands and reload when loadCommands is called again', async () => {
    const loader = new MockCommandLoader([]);
    const loadCommandsSpy = vi.spyOn(loader, 'loadCommands');
    const service = new CommandService([loader]);

    // First load
    loadCommandsSpy.mockResolvedValueOnce([mockCommandA]);
    await service.loadCommands();
    expect(service.getCommands()).toEqual([mockCommandA]);
    expect(service.getCommands()).toHaveLength(1);

    // Second load with different data
    loadCommandsSpy.mockResolvedValueOnce([mockCommandB, mockCommandC]);
    await service.loadCommands();
    const finalCommands = service.getCommands();

    // Assert: The list should be completely replaced, not appended to.
    expect(finalCommands).toHaveLength(2);
    expect(finalCommands).toEqual(
      expect.arrayContaining([mockCommandB, mockCommandC]),
    );
    expect(finalCommands).not.toContain(mockCommandA);
    expect(loadCommandsSpy).toHaveBeenCalledTimes(2);
  });

  it('should load commands from successful loaders even if one fails', async () => {
    const successfulLoader = new MockCommandLoader([mockCommandA]);
    const failingLoader = new MockCommandLoader([]);
    const error = new Error('Loader failed');
    vi.spyOn(failingLoader, 'loadCommands').mockRejectedValue(error);

    const service = new CommandService([successfulLoader, failingLoader]);
    await service.loadCommands();

    const commands = service.getCommands();
    expect(commands).toHaveLength(1);
    expect(commands).toEqual([mockCommandA]);
    expect(console.debug).toHaveBeenCalledWith(
      'A command loader failed:',
      error,
    );
  });

  it('getCommands should return a readonly array that cannot be mutated', async () => {
    const service = new CommandService([new MockCommandLoader([mockCommandA])]);
    await service.loadCommands();

    const commands = service.getCommands();

    // Expect it to throw a TypeError at runtime because the array is frozen.
    expect(() => {
      // @ts-expect-error - Testing immutability is intentional here.
      commands.push(mockCommandB);
    }).toThrow();

    // Verify the original array was not mutated.
    expect(service.getCommands()).toHaveLength(1);
  });
});
