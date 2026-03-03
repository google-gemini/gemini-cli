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

  describe('name conflicts', () => {
    it('should rename extension commands when they conflict', async () => {
      const builtin = createMockCommand('deploy', CommandKind.BUILT_IN);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'firebase',
      };

      const service = await CommandService.create(
        [new MockCommandLoader([builtin]), new MockCommandLoader([extension])],
        new AbortController().signal,
      );

      expect(
        service.getCommands().find((c) => c.name === 'deploy'),
      ).toBeDefined();
      expect(
        service.getCommands().find((c) => c.name === 'firebase.deploy'),
      ).toBeDefined();
    });

    it('should prefix user and workspace commands when they conflict', async () => {
      const userCmd = createMockCommand('sync', CommandKind.USER_FILE);
      const workspaceCmd = createMockCommand(
        'sync',
        CommandKind.WORKSPACE_FILE,
      );

      const service = await CommandService.create(
        [
          new MockCommandLoader([userCmd]),
          new MockCommandLoader([workspaceCmd]),
        ],
        new AbortController().signal,
      );

      const names = service.getCommands().map((c) => c.name);
      // Both should be prefixed, and the original name should be free (no builtin here)
      expect(names).not.toContain('sync');
      expect(names).toContain('user.sync');
      expect(names).toContain('workspace.sync');
    });

    it('should prefix file commands but keep built-in names during conflicts', async () => {
      const builtin = createMockCommand('help', CommandKind.BUILT_IN);
      const user = createMockCommand('help', CommandKind.USER_FILE);

      const service = await CommandService.create(
        [new MockCommandLoader([builtin]), new MockCommandLoader([user])],
        new AbortController().signal,
      );

      const names = service.getCommands().map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('user.help');
    });

    it('should handle complex multi-way conflicts', async () => {
      const builtin = createMockCommand('deploy', CommandKind.BUILT_IN);
      const user = createMockCommand('deploy', CommandKind.USER_FILE);
      const workspace = createMockCommand('deploy', CommandKind.WORKSPACE_FILE);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'gcp',
      };

      const service = await CommandService.create(
        [new MockCommandLoader([builtin, user, workspace, extension])],
        new AbortController().signal,
      );

      const names = service.getCommands().map((c) => c.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'deploy',
          'user.deploy',
          'workspace.deploy',
          'gcp.deploy',
        ]),
      );
    });
  });

  describe('secondary conflicts (suffixing)', () => {
    it('should apply numeric suffixes when extension renames also conflict', async () => {
      // User has /deploy and /gcp.deploy
      const user1 = createMockCommand('deploy', CommandKind.USER_FILE);
      const user2 = createMockCommand('gcp.deploy', CommandKind.USER_FILE);
      // Extension also has /deploy, which wants to be /gcp.deploy
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'gcp',
      };

      const service = await CommandService.create(
        [new MockCommandLoader([user1, user2, extension])],
        new AbortController().signal,
      );

      expect(
        service.getCommands().find((c) => c.name === 'gcp.deploy1'),
      ).toBeDefined();
    });

    it('should handle multiple incrementing suffixes', async () => {
      const user1 = createMockCommand('deploy', CommandKind.USER_FILE);
      const user2 = createMockCommand('gcp.deploy', CommandKind.USER_FILE);
      const user3 = createMockCommand('gcp.deploy1', CommandKind.USER_FILE);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'gcp',
      };

      const service = await CommandService.create(
        [new MockCommandLoader([user1, user2, user3, extension])],
        new AbortController().signal,
      );

      expect(
        service.getCommands().find((c) => c.name === 'gcp.deploy2'),
      ).toBeDefined();
    });
  });

  describe('conflict reporting', () => {
    it('should report extension conflicts correctly', async () => {
      const builtin = createMockCommand('deploy', CommandKind.BUILT_IN);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'firebase',
      };

      const service = await CommandService.create(
        [new MockCommandLoader([builtin, extension])],
        new AbortController().signal,
      );

      expect(service.getConflicts()).toHaveLength(1);
      expect(service.getConflicts()[0]).toMatchObject({
        name: 'deploy',
        losers: [
          {
            renamedTo: 'firebase.deploy',
            winner: builtin,
          },
        ],
      });
    });

    it('should report user and workspace conflicts correctly with individual winners', async () => {
      const user = createMockCommand('sync', CommandKind.USER_FILE);
      const workspace = createMockCommand('sync', CommandKind.WORKSPACE_FILE);

      const service = await CommandService.create(
        [new MockCommandLoader([user, workspace])],
        new AbortController().signal,
      );

      const conflicts = service.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].name).toBe('sync');
      // Both are in losers because both got renamed.
      // user.sync conflicted with workspace (which was current when rename happened)
      // workspace.sync conflicted with user (which was encountered first)
      expect(conflicts[0].losers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            renamedTo: 'user.sync',
            winner: expect.objectContaining({
              kind: CommandKind.WORKSPACE_FILE,
            }),
          }),
          expect.objectContaining({
            renamedTo: 'workspace.sync',
            winner: expect.objectContaining({ kind: CommandKind.USER_FILE }),
          }),
        ]),
      );
    });
  });
});
