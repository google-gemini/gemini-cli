/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ExtensionLoader,
  GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import {
  completeExtensions,
  completeExtensionsAndScopes,
  extensionsCommand,
} from './extensionsCommand.js';
import { type CommandContext, type SlashCommand } from './types.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from 'vitest';
import { type ExtensionUpdateAction } from '../state/extensions.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { SettingScope } from '../../config/settings.js';

import open from 'open';

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('../../config/extensions/update.js', () => ({
  updateExtension: vi.fn(),
  checkForAllExtensionUpdates: vi.fn(),
}));

const mockDisableExtension = vi.fn();
const mockEnableExtension = vi.fn();
const mockGetExtensions = vi.fn();

const inactiveExt: GeminiCLIExtension = {
  name: 'ext-one',
  id: 'ext-one-id',
  version: '1.0.0',
  isActive: false, // should suggest disabled extensions
  path: '/test/dir/ext-one',
  contextFiles: [],
  installMetadata: {
    type: 'git',
    autoUpdate: false,
    source: 'https://github.com/some/extension.git',
  },
};
const activeExt: GeminiCLIExtension = {
  name: 'ext-two',
  id: 'ext-two-id',
  version: '1.0.0',
  isActive: true, // should not suggest enabled extensions
  path: '/test/dir/ext-two',
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

describe('extensionsCommand', () => {
  let mockContext: CommandContext;
  const mockDispatchExtensionState = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    mockGetExtensions.mockReturnValue([inactiveExt, activeExt, allExt]);
    vi.mocked(open).mockClear();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getExtensions: mockGetExtensions,
          getExtensionLoader: vi.fn().mockImplementation(() => {
            const actual = Object.create(ExtensionManager.prototype);
            Object.assign(actual, {
              enableExtension: mockEnableExtension,
              disableExtension: mockDisableExtension,
              getExtensions: mockGetExtensions,
            });
            return actual;
          }),
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
      const command = extensionsCommand();
      if (!command.action) throw new Error('Action not defined');
      await command.action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.EXTENSIONS_LIST,
          extensions: expect.any(Array),
        },
        expect.any(Number),
      );
    });
  });

  describe('completeExtensions', () => {
    it.each([
      {
        description: 'should return matching extension names',
        partialArg: 'ext',
        expected: ['ext-one', 'ext-two'],
      },
      {
        description: 'should return --all when partialArg matches',
        partialArg: '--al',
        expected: ['--all'],
      },
      {
        description:
          'should return both extension names and --all when both match',
        partialArg: 'all',
        expected: ['--all', 'all-ext'],
      },
      {
        description: 'should return an empty array if no matches',
        partialArg: 'nomatch',
        expected: [],
      },
      {
        description:
          'should suggest only disabled extension names for the enable command',
        partialArg: 'ext',
        expected: ['ext-one'],
        command: 'enable',
      },
      {
        description:
          'should suggest only enabled extension names for the disable command',
        partialArg: 'ext',
        expected: ['ext-two'],
        command: 'disable',
      },
    ])('$description', async ({ partialArg, expected, command }) => {
      if (command) {
        mockContext.invocation!.name = command;
      }
      const suggestions = completeExtensions(mockContext, partialArg);
      expect(suggestions).toEqual(expected);
    });
  });

  describe('completeExtensionsAndScopes', () => {
    it('expands the list of suggestions with --scope args', () => {
      const suggestions = completeExtensionsAndScopes(mockContext, 'ext');
      expect(suggestions).toEqual([
        'ext-one --scope user',
        'ext-one --scope workspace',
        'ext-one --scope session',
        'ext-two --scope user',
        'ext-two --scope workspace',
        'ext-two --scope session',
      ]);
    });
  });

  describe('update', () => {
    const updateAction = extensionsCommand().subCommands?.find(
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
  });

  describe('explore', () => {
    const exploreAction = extensionsCommand().subCommands?.find(
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

  describe('when enableExtensionReloading is true', () => {
    it('should include enable and disable subcommands', () => {
      const command = extensionsCommand(true);
      const subCommandNames = command.subCommands?.map((cmd) => cmd.name);
      expect(subCommandNames).toContain('enable');
      expect(subCommandNames).toContain('disable');
    });
  });

  describe('when enableExtensionReloading is false', () => {
    it('should not include enable and disable subcommands', () => {
      const command = extensionsCommand(false);
      const subCommandNames = command.subCommands?.map((cmd) => cmd.name);
      expect(subCommandNames).not.toContain('enable');
      expect(subCommandNames).not.toContain('disable');
    });
  });

  describe('when enableExtensionReloading is not provided', () => {
    it('should not include enable and disable subcommands by default', () => {
      const command = extensionsCommand();
      const subCommandNames = command.subCommands?.map((cmd) => cmd.name);
      expect(subCommandNames).not.toContain('enable');
      expect(subCommandNames).not.toContain('disable');
    });
  });

  describe('enable', () => {
    let enableAction: SlashCommand['action'];

    beforeEach(() => {
      enableAction = extensionsCommand(true).subCommands?.find(
        (cmd) => cmd.name === 'enable',
      )?.action;

      expect(enableAction).not.toBeNull();

      mockContext.invocation!.name = 'enable';
    });

    it('should show usage if no extension name is provided', async () => {
      await enableAction!(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Usage: /extensions enable <extension> [--scope=<user|workspace|session>]',
        },
        expect.any(Number),
      );
    });

    it('should call enableExtension with the provided scope', async () => {
      await enableAction!(mockContext, `${inactiveExt.name} --scope=user`);
      expect(mockEnableExtension).toHaveBeenCalledWith(
        inactiveExt.name,
        SettingScope.User,
      );

      await enableAction!(mockContext, `${inactiveExt.name} --scope workspace`);
      expect(mockEnableExtension).toHaveBeenCalledWith(
        inactiveExt.name,
        SettingScope.Workspace,
      );
    });

    it('should support --all', async () => {
      mockGetExtensions.mockReturnValue([
        inactiveExt,
        { ...inactiveExt, name: 'another-inactive-ext' },
      ]);
      await enableAction!(mockContext, '--all --scope session');
      expect(mockEnableExtension).toHaveBeenCalledWith(
        inactiveExt.name,
        SettingScope.Session,
      );
      expect(mockEnableExtension).toHaveBeenCalledWith(
        'another-inactive-ext',
        SettingScope.Session,
      );
    });
  });

  describe('disable', () => {
    let disableAction: SlashCommand['action'];

    beforeEach(() => {
      disableAction = extensionsCommand(true).subCommands?.find(
        (cmd) => cmd.name === 'disable',
      )?.action;

      expect(disableAction).not.toBeNull();

      mockContext.invocation!.name = 'disable';
    });

    it('should show usage if no extension name is provided', async () => {
      await disableAction!(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: 'Usage: /extensions disable <extension> [--scope=<user|workspace|session>]',
        },
        expect.any(Number),
      );
    });

    it('should call disableExtension with the provided scope', async () => {
      await disableAction!(mockContext, `${activeExt.name} --scope=user`);
      expect(mockDisableExtension).toHaveBeenCalledWith(
        activeExt.name,
        SettingScope.User,
      );

      await disableAction!(mockContext, `${activeExt.name} --scope workspace`);
      expect(mockDisableExtension).toHaveBeenCalledWith(
        activeExt.name,
        SettingScope.Workspace,
      );
    });

    it('should support --all', async () => {
      mockGetExtensions.mockReturnValue([
        activeExt,
        { ...activeExt, name: 'another-active-ext' },
      ]);
      await disableAction!(mockContext, '--all --scope session');
      expect(mockDisableExtension).toHaveBeenCalledWith(
        activeExt.name,
        SettingScope.Session,
      );
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'another-active-ext',
        SettingScope.Session,
      );
    });
  });

  describe('restart', () => {
    let restartAction: SlashCommand['action'];
    let mockRestartExtension: MockedFunction<
      typeof ExtensionLoader.prototype.restartExtension
    >;

    beforeEach(() => {
      restartAction = extensionsCommand().subCommands?.find(
        (c) => c.name === 'restart',
      )?.action;
      expect(restartAction).not.toBeNull();

      mockRestartExtension = vi.fn();
      mockContext.services.config!.getExtensionLoader = vi
        .fn()
        .mockImplementation(() => ({
          getExtensions: mockGetExtensions,
          restartExtension: mockRestartExtension,
        }));
      mockContext.invocation!.name = 'restart';
    });

    it('restarts all active extensions when --all is provided', async () => {
      const mockExtensions = [
        { name: 'ext1', isActive: true },
        { name: 'ext2', isActive: true },
        { name: 'ext3', isActive: false },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);

      await restartAction!(mockContext, '--all');

      expect(mockRestartExtension).toHaveBeenCalledTimes(2);
      expect(mockRestartExtension).toHaveBeenCalledWith(mockExtensions[0]);
      expect(mockRestartExtension).toHaveBeenCalledWith(mockExtensions[1]);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Restarting 2 extensions...',
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: '2 extensions restarted successfully.',
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.dispatchExtensionStateUpdate).toHaveBeenCalledWith({
        type: 'RESTARTED',
        payload: { name: 'ext1' },
      });
      expect(mockContext.ui.dispatchExtensionStateUpdate).toHaveBeenCalledWith({
        type: 'RESTARTED',
        payload: { name: 'ext2' },
      });
    });

    it('restarts only specified active extensions', async () => {
      const mockExtensions = [
        { name: 'ext1', isActive: false },
        { name: 'ext2', isActive: true },
        { name: 'ext3', isActive: true },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);

      await restartAction!(mockContext, 'ext1 ext3');

      expect(mockRestartExtension).toHaveBeenCalledTimes(1);
      expect(mockRestartExtension).toHaveBeenCalledWith(mockExtensions[2]);
      expect(mockContext.ui.dispatchExtensionStateUpdate).toHaveBeenCalledWith({
        type: 'RESTARTED',
        payload: { name: 'ext3' },
      });
    });

    it('shows an error if no extension loader is available', async () => {
      mockContext.services.config!.getExtensionLoader = vi.fn();

      await restartAction!(mockContext, '--all');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: "Extensions are not yet loaded, can't restart yet",
        }),
        expect.any(Number),
      );
      expect(mockRestartExtension).not.toHaveBeenCalled();
    });

    it('shows usage error for no arguments', async () => {
      await restartAction!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Usage: /extensions restart <extension-names>|--all',
        }),
        expect.any(Number),
      );
      expect(mockRestartExtension).not.toHaveBeenCalled();
    });

    it('handles errors during extension restart', async () => {
      const mockExtensions = [
        { name: 'ext1', isActive: true },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);
      mockRestartExtension.mockRejectedValue(new Error('Failed to restart'));

      await restartAction!(mockContext, '--all');

      expect(mockRestartExtension).toHaveBeenCalledWith(mockExtensions[0]);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Failed to restart some extensions:\n  ext1: Failed to restart',
        }),
        expect.any(Number),
      );
    });

    it('shows a warning if an extension is not found', async () => {
      const mockExtensions = [
        { name: 'ext1', isActive: true },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);

      await restartAction!(mockContext, 'ext1 ext2');

      expect(mockRestartExtension).toHaveBeenCalledTimes(1);
      expect(mockRestartExtension).toHaveBeenCalledWith(mockExtensions[0]);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.WARNING,
          text: 'Extension(s) not found or not active: ext2',
        }),
        expect.any(Number),
      );
    });

    it('does not restart any extensions if none are found', async () => {
      const mockExtensions = [
        { name: 'ext1', isActive: true },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);

      await restartAction!(mockContext, 'ext2 ext3');

      expect(mockRestartExtension).not.toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.WARNING,
          text: 'Extension(s) not found or not active: ext2, ext3',
        }),
        expect.any(Number),
      );
    });

    it('should suggest only enabled extension names for the restart command', async () => {
      mockContext.invocation!.name = 'restart';
      const mockExtensions = [
        { name: 'ext1', isActive: true },
        { name: 'ext2', isActive: false },
      ] as GeminiCLIExtension[];
      mockGetExtensions.mockReturnValue(mockExtensions);

      const suggestions = completeExtensions(mockContext, 'ext');
      expect(suggestions).toEqual(['ext1']);
    });
  });
});
