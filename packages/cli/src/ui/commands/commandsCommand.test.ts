/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { glob, type GlobOptions } from 'glob';
import { Storage, type Config } from '@google/gemini-cli-core';
import { commandsCommand } from './commandsCommand.js';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual<
    typeof import('@google/gemini-cli-core')
  >('@google/gemini-cli-core');
  return {
    ...actual,
    Storage: class extends actual.Storage {
      static override getUserCommandsDir() {
        return '/mock/user/commands';
      }
      override getProjectCommandsDir() {
        return '/mock/project/commands';
      }
    },
  };
});

describe('commandsCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockCommandContext({
      ui: {
        reloadCommands: vi.fn(),
        addItem: vi.fn(),
      },
      services: {
        config: {
          getProjectRoot: vi.fn().mockReturnValue('/mock/project'),
          getFolderTrust: vi.fn().mockReturnValue(false),
          isTrustedFolder: vi.fn().mockReturnValue(false),
          getExtensions: vi.fn().mockReturnValue([
            { name: 'ext1', path: '/mock/ext1', isActive: true },
            { name: 'ext2', path: '/mock/ext2', isActive: false },
          ]),
          storage: new Storage('/mock/project'),
        } as unknown as Config,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('default action', () => {
    it('should return an info message prompting subcommand usage', async () => {
      const result = await commandsCommand.action!(context, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'Use "/commands list" to view available .toml files, or "/commands reload" to reload custom command definitions.',
      });
    });
  });

  describe('list', () => {
    it('should list .toml files from available sources', async () => {
      vi.mocked(glob).mockImplementation(
        async (pattern, options?: GlobOptions) => {
          if (options?.cwd === '/mock/user/commands') return ['user1.toml'];
          if (options?.cwd === '/mock/project/commands') return ['proj1.toml'];
          if (options?.cwd === '/mock/ext1/commands') return ['ext1.toml'];
          return [];
        },
      );

      const listCmd = commandsCommand.subCommands!.find(
        (s) => s.name === 'list',
      )!;

      await listCmd.action!(context, '');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('### User Commands'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('- user1.toml'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('### Project Commands'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('- proj1.toml'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('### Extension: ext1 Commands'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('- ext1.toml'),
        }),
        expect.any(Number),
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('MCP prompts are dynamically loaded'),
        }),
        expect.any(Number),
      );
    });

    it('should show "No custom command files found" message if no .toml files exist', async () => {
      vi.mocked(glob).mockResolvedValue([]);

      const listCmd = commandsCommand.subCommands!.find(
        (s) => s.name === 'list',
      )!;

      const result = await listCmd.action!(context, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining(
          'No custom command files (.toml) found.',
        ),
      });
    });
  });

  describe('reload', () => {
    it('should call reloadCommands and show a success message', async () => {
      const reloadCmd = commandsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;

      await reloadCmd.action!(context, '');

      expect(context.ui.reloadCommands).toHaveBeenCalledTimes(1);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Custom commands reloaded successfully.',
        }),
        expect.any(Number),
      );
    });
  });
});
