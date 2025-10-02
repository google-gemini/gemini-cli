/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import {
  updateAllUpdatableExtensions,
  updateExtension,
} from '../../config/extensions/update.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { extensionsCommand } from './extensionsCommand.js';
import { type CommandContext } from './types.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import { ExtensionUpdateState } from '../state/extensions.js';

vi.mock('../../config/extensions/update.js', () => ({
  updateExtension: vi.fn(),
  updateAllUpdatableExtensions: vi.fn(),
  checkForAllExtensionUpdates: vi.fn(),
}));

const mockUpdateExtension = updateExtension as MockedFunction<
  typeof updateExtension
>;

const mockUpdateAllUpdatableExtensions =
  updateAllUpdatableExtensions as MockedFunction<
    typeof updateAllUpdatableExtensions
  >;

const mockGetExtensions = vi.fn();

describe('extensionsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getExtensions: mockGetExtensions,
          getWorkingDir: () => '/test/dir',
        },
      },
      ui: {
        dispatchExtensionStateUpdate: vi.fn(),
      },
    });
  });

  describe('list', () => {
    it('should add an EXTENSIONS_LIST item to the UI', async () => {
      if (!extensionsCommand.action) throw new Error('Action not defined');
      await extensionsCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
        },
        expect.any(Number),
      );
    });
  });

  describe('update', () => {
    const updateAction = extensionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'update',
    )?.action;

    if (!updateAction) {
      throw new Error('Update action not found');
    }

    it('should show usage if no args are provided', async () => {
      await updateAction(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Usage: /extensions update <extension-names>|--all',
        },
        expect.any(Number),
      );
    });

    it('should inform user if there are no extensions to update with --all', async () => {
      mockUpdateAllUpdatableExtensions.mockResolvedValue([]);
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'No extensions to update.',
        },
        expect.any(Number),
      );
    });

    it('should call setPendingItem and addItem in a finally block on success', async () => {
      mockUpdateAllUpdatableExtensions.mockResolvedValue([
        {
          name: 'ext-one',
          originalVersion: '1.0.0',
          updatedVersion: '1.0.1',
        },
        {
          name: 'ext-two',
          originalVersion: '2.0.0',
          updatedVersion: '2.0.1',
        },
      ]);
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
        },
        expect.any(Number),
      );
    });

    it('should call setPendingItem and addItem in a finally block on failure', async () => {
      mockUpdateAllUpdatableExtensions.mockRejectedValue(
        new Error('Something went wrong'),
      );
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
        },
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Something went wrong',
        },
        expect.any(Number),
      );
    });

    it('should update a single extension by name', async () => {
      const extension: GeminiCLIExtension = {
        name: 'ext-one',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/ext-one',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      mockUpdateExtension.mockResolvedValue({
        name: extension.name,
        originalVersion: extension.version,
        updatedVersion: '1.0.1',
      });
      mockGetExtensions.mockReturnValue([extension]);
      mockContext.ui.extensionsUpdateState.set(extension.name, {
        status: ExtensionUpdateState.UPDATE_AVAILABLE,
        processed: false,
      });
      await updateAction(mockContext, 'ext-one');
      expect(mockUpdateExtension).toHaveBeenCalledWith(
        extension,
        '/test/dir',
        expect.any(Function),
        ExtensionUpdateState.UPDATE_AVAILABLE,
        expect.any(Function),
      );
    });

    it('should handle errors when updating a single extension', async () => {
      mockUpdateExtension.mockRejectedValue(new Error('Extension not found'));
      mockGetExtensions.mockReturnValue([]);
      await updateAction(mockContext, 'ext-one');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Extension ext-one not found.',
        },
        expect.any(Number),
      );
    });

    it('should update multiple extensions by name', async () => {
      const extensionOne: GeminiCLIExtension = {
        name: 'ext-one',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/ext-one',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      const extensionTwo: GeminiCLIExtension = {
        name: 'ext-two',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/ext-two',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      mockGetExtensions.mockReturnValue([extensionOne, extensionTwo]);
      mockContext.ui.extensionsUpdateState.set(
        extensionOne.name,
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
      mockContext.ui.extensionsUpdateState.set(
        extensionTwo.name,
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
      mockUpdateExtension
        .mockResolvedValueOnce({
          name: 'ext-one',
          originalVersion: '1.0.0',
          updatedVersion: '1.0.1',
        })
        .mockResolvedValueOnce({
          name: 'ext-two',
          originalVersion: '2.0.0',
          updatedVersion: '2.0.1',
        });
      await updateAction(mockContext, 'ext-one ext-two');
      expect(mockUpdateExtension).toHaveBeenCalledTimes(2);
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
        },
        expect.any(Number),
      );
    });

    describe('completion', () => {
      const updateCompletion = extensionsCommand.subCommands?.find(
        (cmd) => cmd.name === 'update',
      )?.completion;

      if (!updateCompletion) {
        throw new Error('Update completion not found');
      }

      const extensionOne: GeminiCLIExtension = {
        name: 'ext-one',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/ext-one',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      const extensionTwo: GeminiCLIExtension = {
        name: 'another-ext',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/another-ext',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      const allExt: GeminiCLIExtension = {
        name: 'all-ext',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/all-ext',
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };

      it.each([
        {
          description: 'should return matching extension names',
          extensions: [extensionOne, extensionTwo],
          partialArg: 'ext',
          expected: ['ext-one'],
        },
        {
          description: 'should return --all when partialArg matches',
          extensions: [],
          partialArg: '--al',
          expected: ['--all'],
        },
        {
          description:
            'should return both extension names and --all when both match',
          extensions: [allExt],
          partialArg: 'all',
          expected: ['--all', 'all-ext'],
        },
        {
          description: 'should return an empty array if no matches',
          extensions: [extensionOne],
          partialArg: 'nomatch',
          expected: [],
        },
      ])('$description', async ({ extensions, partialArg, expected }) => {
        mockGetExtensions.mockReturnValue(extensions);
        const suggestions = await updateCompletion(mockContext, partialArg);
        expect(suggestions).toEqual(expected);
      });
    });
  });
});
