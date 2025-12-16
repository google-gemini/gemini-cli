/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { format } from 'node:util';
import { type Argv } from 'yargs';
import { handleUpdate, updateCommand } from './update.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import * as update from '../../config/extensions/update.js';
import * as github from '../../config/extensions/github.js';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';

// Mock dependencies
const emitConsoleLog = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  log: vi.fn((message, ...args) => {
    emitConsoleLog('log', format(message, ...args));
  }),
  error: vi.fn((message, ...args) => {
    emitConsoleLog('error', format(message, ...args));
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      emitConsoleLog,
    },
    debugLogger,
  };
});

vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
vi.mock('../../utils/errors.js');
vi.mock('../../config/extensions/update.js');
vi.mock('../../config/extensions/github.js');
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions update command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockExtensionManager = vi.mocked(ExtensionManager);
  const mockUpdateExtension = vi.mocked(update.updateExtension);
  const mockCheckForExtensionUpdate = vi.mocked(github.checkForExtensionUpdate);
  const mockCheckForAllExtensionUpdates = vi.mocked(
    update.checkForAllExtensionUpdates,
  );
  const mockUpdateAllUpdatableExtensions = vi.mocked(
    update.updateAllUpdatableExtensions,
  );

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: { experimental: { extensionReloading: true } },
    } as unknown as LoadedSettings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleUpdate', () => {
    it.each([
      {
        state: ExtensionUpdateState.UPDATE_AVAILABLE,
        expectedLog:
          'Extension "my-extension" successfully updated: 1.0.0 → 1.1.0.',
        shouldCallUpdateExtension: true,
      },
      {
        state: ExtensionUpdateState.UP_TO_DATE,
        expectedLog: 'Extension "my-extension" is already up to date.',
        shouldCallUpdateExtension: false,
      },
    ])(
      'should handle single extension update state: $state',
      async ({ state, expectedLog, shouldCallUpdateExtension }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        const extensions = [{ name: 'my-extension', installMetadata: {} }];
        mockExtensionManager.prototype.loadExtensions = vi
          .fn()
          .mockResolvedValue(extensions);
        mockCheckForExtensionUpdate.mockResolvedValue(state);
        mockUpdateExtension.mockResolvedValue({
          name: 'my-extension',
          originalVersion: '1.0.0',
          updatedVersion: '1.1.0',
        });

        await handleUpdate({ name: 'my-extension' });

        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        if (shouldCallUpdateExtension) {
          expect(mockUpdateExtension).toHaveBeenCalled();
        } else {
          expect(mockUpdateExtension).not.toHaveBeenCalled();
        }
        mockCwd.mockRestore();
      },
    );

    it.each([
      {
        updatedExtensions: [
          { name: 'ext1', originalVersion: '1.0.0', updatedVersion: '1.1.0' },
          { name: 'ext2', originalVersion: '2.0.0', updatedVersion: '2.1.0' },
        ],
        expectedLog:
          'Extension "ext1" successfully updated: 1.0.0 → 1.1.0.\nExtension "ext2" successfully updated: 2.0.0 → 2.1.0.',
      },
      {
        updatedExtensions: [],
        expectedLog: 'No extensions to update.',
      },
    ])(
      'should handle updating all extensions: %s',
      async ({ updatedExtensions, expectedLog }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        mockExtensionManager.prototype.loadExtensions = vi
          .fn()
          .mockResolvedValue([]);
        mockCheckForAllExtensionUpdates.mockResolvedValue(undefined);
        mockUpdateAllUpdatableExtensions.mockResolvedValue(updatedExtensions);

        await handleUpdate({ all: true });

        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        mockCwd.mockRestore();
      },
    );
  });

  describe('updateCommand', () => {
    const command = updateCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('update [<name>] [--all]');
      expect(command.describe).toBe(
        'Updates all extensions or a named extension to the latest version.',
      );
    });

    describe('builder', () => {
      interface MockYargs {
        positional: Mock;
        option: Mock;
        conflicts: Mock;
        check: Mock;
      }

      let yargsMock: MockYargs;
      beforeEach(() => {
        yargsMock = {
          positional: vi.fn().mockReturnThis(),
          option: vi.fn().mockReturnThis(),
          conflicts: vi.fn().mockReturnThis(),
          check: vi.fn().mockReturnThis(),
        };
      });

      it('should configure arguments', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        expect(yargsMock.positional).toHaveBeenCalledWith(
          'name',
          expect.any(Object),
        );
        expect(yargsMock.option).toHaveBeenCalledWith(
          'all',
          expect.any(Object),
        );
        expect(yargsMock.conflicts).toHaveBeenCalledWith('name', 'all');
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw an error if neither a name nor --all is provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ name: undefined, all: false })).toThrow(
          'Either an extension name or --all must be provided',
        );
      });
    });

    it('handler should call handleUpdate', async () => {
      const extensions = [{ name: 'my-extension', installMetadata: {} }];
      mockExtensionManager.prototype.loadExtensions = vi
        .fn()
        .mockResolvedValue(extensions);
      mockCheckForExtensionUpdate.mockResolvedValue(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
      mockUpdateExtension.mockResolvedValue({
        name: 'my-extension',
        originalVersion: '1.0.0',
        updatedVersion: '1.1.0',
      });

      await (command.handler as (args: object) => Promise<void>)({
        name: 'my-extension',
      });

      expect(mockUpdateExtension).toHaveBeenCalled();
    });
  });
});
