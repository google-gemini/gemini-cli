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
import { type CommandModule, type Argv } from 'yargs';
import { handleUninstall, uninstallCommand } from './uninstall.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { getErrorMessage } from '../../utils/errors.js';

// Mock dependencies
vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
vi.mock('../../utils/errors.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
    },
  };
});
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));

describe('extensions uninstall command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);
  const mockExtensionManager = vi.mocked(ExtensionManager);
  interface MockDebugLogger {
    log: Mock;
    error: Mock;
  }
  let mockDebugLogger: MockDebugLogger;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDebugLogger = (await import('@google/gemini-cli-core'))
      .debugLogger as unknown as MockDebugLogger;
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockExtensionManager.prototype.loadExtensions = vi
      .fn()
      .mockResolvedValue(undefined);
    mockExtensionManager.prototype.uninstallExtension = vi
      .fn()
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleUninstall', () => {
    it('should uninstall an extension', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleUninstall({ name: 'my-extension' });

      expect(mockExtensionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceDir: '/test/dir',
        }),
      );
      expect(mockExtensionManager.prototype.loadExtensions).toHaveBeenCalled();
      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('my-extension', false);
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "my-extension" successfully uninstalled.',
      );
      mockCwd.mockRestore();
    });

    it('should log an error message and exit with code 1 when uninstallation fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Uninstall failed');
      (
        mockExtensionManager.prototype.uninstallExtension as Mock
      ).mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Uninstall failed message');

      await handleUninstall({ name: 'my-extension' });

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Uninstall failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('uninstallCommand', () => {
    const command = uninstallCommand as CommandModule;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('uninstall <name>');
      expect(command.describe).toBe('Uninstalls an extension.');
    });

    describe('builder', () => {
      interface MockYargs {
        positional: Mock;
        check: Mock;
      }

      let yargsMock: MockYargs;
      beforeEach(() => {
        yargsMock = {
          positional: vi.fn().mockReturnThis(),
          check: vi.fn().mockReturnThis(),
        };
      });

      it('should configure positional argument', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        expect(yargsMock.positional).toHaveBeenCalledWith('name', {
          describe: 'The name or source path of the extension to uninstall.',
          type: 'string',
        });
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw for missing name', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ name: '' })).toThrow(
          'Please include the name of the extension to uninstall as a positional argument.',
        );
      });
    });

    it('handler should call handleUninstall', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        name: string;
        [key: string]: unknown;
      }
      const argv: TestArgv = { name: 'my-extension', _: [], $0: '' };
      await (command.handler as unknown as (args: TestArgv) => void)(argv);

      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('my-extension', false);
      mockCwd.mockRestore();
    });
  });
});
