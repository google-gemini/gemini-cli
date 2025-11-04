/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { extensionsCommand } from './extensionsCommand.js';
import { type CommandContext } from './types.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ExtensionUpdateAction } from '../state/extensions.js';

import open from 'open';
vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('../../config/extensions/update.js', () => ({
  updateExtension: vi.fn(),
  checkForAllExtensionUpdates: vi.fn(),
}));

const mockGetExtensions = vi.fn();

describe('extensionsCommand', () => {
  let mockContext: CommandContext;
  const mockDispatchExtensionState = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetExtensions.mockReturnValue([]);
    vi.mocked(open).mockClear();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getExtensions: mockGetExtensions,
          getWorkingDir: () => '/test/dir',
        },
      },
      ui: {
        dispatchExtensionStateUpdate: mockDispatchExtensionState,
      },
    });
  });

  afterEach(() => {
    // Restore any stubbed environment variables, similar to docsCommand.test.ts
    vi.unstubAllEnvs();
  });

  describe('list', () => {
    it('should add an EXTENSIONS_LIST item to the UI', async () => {
      if (!extensionsCommand.action) throw new Error('Action not defined');
      await extensionsCommand.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
          extensions: expect.any(Array),
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
      mockDispatchExtensionState.mockImplementationOnce(
        (action: ExtensionUpdateAction) => {
          if (action.type === 'SCHEDULE_UPDATE') {
            action.payload.onComplete([]);
          }
        },
      );

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
      mockDispatchExtensionState.mockImplementationOnce(
        (action: ExtensionUpdateAction) => {
          if (action.type === 'SCHEDULE_UPDATE') {
            action.payload.onComplete([
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
          }
        },
      );
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
        extensions: expect.any(Array),
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
          extensions: expect.any(Array),
        },
        expect.any(Number),
      );
    });

    it('should call setPendingItem and addItem in a finally block on failure', async () => {
      mockDispatchExtensionState.mockImplementationOnce((_) => {
        throw new Error('Something went wrong');
      });
      await updateAction(mockContext, '--all');
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
        extensions: expect.any(Array),
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
          extensions: expect.any(Array),
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
      mockDispatchExtensionState.mockImplementationOnce(
        (action: ExtensionUpdateAction) => {
          if (action.type === 'SCHEDULE_UPDATE') {
            action.payload.onComplete([
              {
                name: 'ext-one',
                originalVersion: '1.0.0',
                updatedVersion: '1.0.1',
              },
            ]);
          }
        },
      );
      await updateAction(mockContext, 'ext-one');
      expect(mockDispatchExtensionState).toHaveBeenCalledWith({
        type: 'SCHEDULE_UPDATE',
        payload: {
          all: false,
          names: ['ext-one'],
          onComplete: expect.any(Function),
        },
      });
    });

    it('should update multiple extensions by name', async () => {
      mockDispatchExtensionState.mockImplementationOnce(
        (action: ExtensionUpdateAction) => {
          if (action.type === 'SCHEDULE_UPDATE') {
            action.payload.onComplete([
              {
                name: 'ext-one',
                originalVersion: '1.0.0',
                updatedVersion: '1.0.1',
              },
              {
                name: 'ext-two',
                originalVersion: '1.0.0',
                updatedVersion: '1.0.1',
              },
            ]);
          }
        },
      );
      await updateAction(mockContext, 'ext-one ext-two');
      expect(mockDispatchExtensionState).toHaveBeenCalledWith({
        type: 'SCHEDULE_UPDATE',
        payload: {
          all: false,
          names: ['ext-one', 'ext-two'],
          onComplete: expect.any(Function),
        },
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith({
        type: MessageType.EXTENSIONS_LIST,
        extensions: expect.any(Array),
      });
      expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
          extensions: expect.any(Array),
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
        id: 'ext-one-id',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/ext-one',
        contextFiles: [],
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      const extensionTwo: GeminiCLIExtension = {
        name: 'another-ext',
        id: 'another-ext-id',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/another-ext',
        contextFiles: [],
        installMetadata: {
          type: 'git',
          autoUpdate: false,
          source: 'https://github.com/some/extension.git',
        },
      };
      const allExt: GeminiCLIExtension = {
        name: 'all-ext',
        id: 'all-ext-id',
        version: '1.0.0',
        isActive: true,
        path: '/test/dir/all-ext',
        contextFiles: [],
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

  describe('explore', () => {
    const exploreAction = extensionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'explore',
    )?.action;

    if (!exploreAction) {
      throw new Error('Explore action not found');
    }

    it("should add an info message and call 'open' in a non-sandbox environment", async () => {
      // Ensure no special environment variables that would affect behavior
      vi.stubEnv('NODE_ENV', '');
      vi.stubEnv('SANDBOX', '');

      await exploreAction(mockContext, '');

      const extensionsUrl = 'https://geminicli.com/extensions/';
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `Opening extensions page in your browser: ${extensionsUrl}`,
        },
        expect.any(Number),
      );

      expect(open).toHaveBeenCalledWith(extensionsUrl);
    });

    it('should only add an info message in a sandbox environment', async () => {
      // Simulate a sandbox environment
      vi.stubEnv('NODE_ENV', '');
      vi.stubEnv('SANDBOX', 'gemini-sandbox');
      const extensionsUrl = 'https://geminicli.com/extensions/';

      await exploreAction(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `View available extensions at ${extensionsUrl}`,
        },
        expect.any(Number),
      );

      // Ensure 'open' was not called in the sandbox
      expect(open).not.toHaveBeenCalled();
    });

    it('should add an info message and not call open in NODE_ENV test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('SANDBOX', '');
      const extensionsUrl = 'https://geminicli.com/extensions/';

      await exploreAction(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `Would open extensions page in your browser: ${extensionsUrl} (skipped in test environment)`,
        },
        expect.any(Number),
      );

      // Ensure 'open' was not called in test environment
      expect(open).not.toHaveBeenCalled();
    });

    it('should handle errors when opening the browser', async () => {
      vi.stubEnv('NODE_ENV', '');
      const extensionsUrl = 'https://geminicli.com/extensions/';
      const errorMessage = 'Failed to open browser';
      vi.mocked(open).mockRejectedValue(new Error(errorMessage));

      await exploreAction(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: `Failed to open browser. Check out the extensions gallery at ${extensionsUrl}`,
        },
        expect.any(Number),
      );
    });
  });
});
