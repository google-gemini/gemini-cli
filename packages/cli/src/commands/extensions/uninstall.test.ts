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
    it('should uninstall a single extension', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleUninstall({ names: ['my-extension'] });

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

    it('should uninstall multiple extensions', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleUninstall({ names: ['ext1', 'ext2', 'ext3'] });

      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledTimes(3);
      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('ext1', false);
      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('ext2', false);
      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('ext3', false);
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "ext1" successfully uninstalled.',
      );
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "ext2" successfully uninstalled.',
      );
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "ext3" successfully uninstalled.',
      );
      mockCwd.mockRestore();
    });

    it('should report errors for failed uninstalls but continue with others', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      (
        mockExtensionManager.prototype.uninstallExtension as Mock
      ).mockResolvedValueOnce(undefined);
      (
        mockExtensionManager.prototype.uninstallExtension as Mock
      ).mockRejectedValueOnce(new Error('Extension not found'));
      (
        mockExtensionManager.prototype.uninstallExtension as Mock
      ).mockResolvedValueOnce(undefined);
      mockGetErrorMessage.mockReturnValue('Extension not found');

      await handleUninstall({ names: ['ext1', 'ext2', 'ext3'] });

      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledTimes(3);
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "ext1" successfully uninstalled.',
      );
      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Failed to uninstall "ext2": Extension not found',
      );
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "ext3" successfully uninstalled.',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });

    it('should exit with error code if all uninstalls fail', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Extension not found');
      (
        mockExtensionManager.prototype.uninstallExtension as Mock
      ).mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Extension not found');

      await handleUninstall({ names: ['ext1', 'ext2'] });

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Failed to uninstall "ext1": Extension not found',
      );
      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Failed to uninstall "ext2": Extension not found',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });

    it('should log an error message and exit with code 1 when initialization fails', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Initialization failed');
      (mockExtensionManager.prototype.loadExtensions as Mock).mockRejectedValue(
        error,
      );
      mockGetErrorMessage.mockReturnValue('Initialization failed message');

      await handleUninstall({ names: ['my-extension'] });

      expect(mockDebugLogger.error).toHaveBeenCalledWith(
        'Initialization failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });
  });

  describe('uninstallCommand', () => {
    const command = uninstallCommand as CommandModule;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('uninstall <names..>');
      expect(command.describe).toBe('Uninstalls one or more extensions.');
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
        expect(yargsMock.positional).toHaveBeenCalledWith('names', {
          describe:
            'The name(s) or source path(s) of the extension(s) to uninstall.',
          type: 'string',
          array: true,
        });
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw for missing names', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ names: [] })).toThrow(
          'Please include at least one extension name to uninstall as a positional argument.',
        );
      });
    });

    it('handler should call handleUninstall', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        names: string[];
        [key: string]: unknown;
      }
      const argv: TestArgv = { names: ['my-extension'], _: [], $0: '' };
      await (command.handler as unknown as (args: TestArgv) => void)(argv);

      expect(
        mockExtensionManager.prototype.uninstallExtension,
      ).toHaveBeenCalledWith('my-extension', false);
      mockCwd.mockRestore();
    });
  });
});
