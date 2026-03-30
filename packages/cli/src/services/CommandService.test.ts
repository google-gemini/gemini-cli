/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandService } from './CommandService.js';
import { type ICommandLoader } from './types.js';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';
import { debugLogger } from '@google/gemini-cli-core';

const createMockCommand = (name: string, kind: CommandKind): SlashCommand => ({
  name,
  description: `Description for ${name}`,
  kind,
  action: vi.fn(),
});

class MockCommandLoader implements ICommandLoader {
  constructor(private readonly commands: SlashCommand[]) {}
  loadCommands = vi.fn(async () => Promise.resolve(this.commands));
}

describe('CommandService', () => {
  beforeEach(() => {
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic loading', () => {
    it('should aggregate commands from multiple successful loaders', async () => {
      const cmdA = createMockCommand('a', CommandKind.BUILT_IN);
      const cmdB = createMockCommand('b', CommandKind.USER_FILE);
      const service = await CommandService.create(
        [new MockCommandLoader([cmdA]), new MockCommandLoader([cmdB])],
        new AbortController().signal,
      );

      expect(service.getCommands()).toHaveLength(2);
      expect(service.getCommands()).toEqual(
        expect.arrayContaining([cmdA, cmdB]),
      );
    });

    it('should handle empty loaders and failed loaders gracefully', async () => {
      const cmdA = createMockCommand('a', CommandKind.BUILT_IN);
      const failingLoader = new MockCommandLoader([]);
      vi.spyOn(failingLoader, 'loadCommands').mockRejectedValue(
        new Error('fail'),
      );

      const service = await CommandService.create(
        [
          new MockCommandLoader([cmdA]),
          new MockCommandLoader([]),
          failingLoader,
        ],
        new AbortController().signal,
      );

      expect(service.getCommands()).toHaveLength(1);
      expect(service.getCommands()[0].name).toBe('a');
      expect(debugLogger.debug).toHaveBeenCalledWith(
        'A command loader failed:',
        expect.any(Error),
      );
    });

    it('should return a readonly array of commands', async () => {
      const service = await CommandService.create(
        [new MockCommandLoader([createMockCommand('a', CommandKind.BUILT_IN)])],
        new AbortController().signal,
      );
      expect(() => (service.getCommands() as unknown[]).push({})).toThrow();
    });

    it('should pass the abort signal to all loaders', async () => {
      const controller = new AbortController();
      const loader = new MockCommandLoader([]);
      await CommandService.create([loader], controller.signal);
      expect(loader.loadCommands).toHaveBeenCalledWith(controller.signal);
    });
  });

  describe('conflict delegation', () => {
    it('should delegate conflict resolution to SlashCommandResolver', async () => {
      const builtin = createMockCommand('help', CommandKind.BUILT_IN);
      const user = createMockCommand('help', CommandKind.USER_FILE);

      const service = await CommandService.create(
        [new MockCommandLoader([builtin, user])],
        new AbortController().signal,
      );

      expect(service.getCommands().map((c) => c.name)).toContain('help');
      expect(service.getCommands().map((c) => c.name)).toContain('user.help');
      expect(service.getConflicts()).toHaveLength(1);
    });
  });
});
