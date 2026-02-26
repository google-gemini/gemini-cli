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
import { handleUninstall, uninstallCommand } from './uninstall.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { getErrorMessage } from '../../utils/errors.js';

// NOTE: This file uses vi.hoisted() mocks to enable testing of sequential
// mock behaviors (mockResolvedValueOnce/mockRejectedValueOnce chaining).
// The hoisted mocks persist across vi.clearAllMocks() calls, which is necessary
// for testing partial failure scenarios in the multiple extension uninstall feature.

// Hoisted mocks - these survive vi.clearAllMocks()
const mockUninstallExtension = vi.hoisted(() => vi.fn());
const mockLoadExtensions = vi.hoisted(() => vi.fn());
const mockGetExtensions = vi.hoisted(() => vi.fn());

// Mock dependencies with hoisted functions
vi.mock('../../config/extension-manager.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/extension-manager.js')>();
  return {
    ...actual,
    ExtensionManager: vi.fn().mockImplementation(() => ({
      uninstallExtension: mockUninstallExtension,
      loadExtensions: mockLoadExtensions,
      getExtensions: mockGetExtensions,
      setRequestConsent: vi.fn(),
      setRequestSetting: vi.fn(),
    })),
  };
});

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

vi.mock('../../config/settings.js');
vi.mock('../../utils/errors.js');
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions uninstall command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);
  const mockExtensionManager = vi.mocked(ExtensionManager);

  beforeEach(async () => {
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
  });

  afterEach(() => {
    mockLoadExtensions.mockClear();
    mockUninstallExtension.mockClear();
    mockGetExtensions.mockClear();
    vi.clearAllMocks();
  });

  describe('handleUninstall', () => {
    it('should uninstall a single extension', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockUninstallExtension.mockResolvedValue(undefined);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleUninstall({ names: ['my-extension'] });

      expect(mockExtensionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceDir: '/test/dir',
        }),
      );
      expect(mockLoadExtensions).toHaveBeenCalled();
      expect(mockUninstallExtension).toHaveBeenCalledWith(
        'my-extension',
        false,
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "my-extension" successfully uninstalled.',
      );
      mockCwd.mockRestore();
    });

    it('should uninstall multiple extensions', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockUninstallExtension.mockResolvedValue(undefined);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleUninstall({ names: ['ext1', 'ext2', 'ext3'] });

      expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext1', false);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext2', false);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext3', false);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext1" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext2" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext3" successfully uninstalled.',
      );
      mockCwd.mockRestore();
    });

    it('should report errors for failed uninstalls but continue with others', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      const error = new Error('Extension not found');
      // Chain sequential mock behaviors - this works with hoisted mocks
      mockUninstallExtension
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(undefined);
      mockGetErrorMessage.mockReturnValue('Extension not found');

      await handleUninstall({ names: ['ext1', 'ext2', 'ext3'] });

      expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext1" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to uninstall "ext2": Extension not found',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext3" successfully uninstalled.',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });

    it('should exit with error code if all uninstalls fail', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Extension not found');
      mockUninstallExtension.mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Extension not found');

      await handleUninstall({ names: ['ext1', 'ext2'] });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to uninstall "ext1": Extension not found',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to uninstall "ext2": Extension not found',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });

    it('should uninstall all extensions when --all flag is provided', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockUninstallExtension.mockResolvedValue(undefined);
      mockGetExtensions.mockReturnValue([
        { name: 'ext1' },
        { name: 'ext2' },
        { name: 'ext3' },
      ]);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');

      await handleUninstall({ all: true });

      expect(mockGetExtensions).toHaveBeenCalled();
      expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext1', false);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext2', false);
      expect(mockUninstallExtension).toHaveBeenCalledWith('ext3', false);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext1" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext2" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext3" successfully uninstalled.',
      );
      mockCwd.mockRestore();
    });

    it('should log message and return early when --all flag is provided but no extensions installed', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockGetExtensions.mockReturnValue([]);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');

      await handleUninstall({ all: true });

      expect(mockGetExtensions).toHaveBeenCalled();
      expect(mockUninstallExtension).not.toHaveBeenCalled();
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'No extensions installed.',
      );
      mockCwd.mockRestore();
    });

    it('should handle partial failures when uninstalling all extensions', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockGetExtensions.mockReturnValue([
        { name: 'ext1' },
        { name: 'ext2' },
        { name: 'ext3' },
      ]);
      const error = new Error('Uninstall failed');
      mockUninstallExtension
        .mockResolvedValueOnce(undefined) // ext1 succeeds
        .mockRejectedValueOnce(error) // ext2 fails
        .mockResolvedValueOnce(undefined); // ext3 succeeds
      mockGetErrorMessage.mockReturnValue('Uninstall failed');
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      await handleUninstall({ all: true });

      expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext1" successfully uninstalled.',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to uninstall "ext2": Uninstall failed',
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "ext3" successfully uninstalled.',
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
      mockLoadExtensions.mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Initialization failed message');

      await handleUninstall({ names: ['my-extension'] });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Initialization failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
      mockCwd.mockRestore();
    });
  });

  describe('uninstallCommand', () => {
    const command = uninstallCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('uninstall [<names..>] [--all]');
      expect(command.describe).toBe('Uninstalls one or more extensions.');
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

      it('should configure positional argument and all option', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        expect(yargsMock.positional).toHaveBeenCalledWith('names', {
          describe:
            'The name(s) or source path(s) of the extension(s) to uninstall.',
          type: 'string',
          array: true,
        });
        expect(yargsMock.option).toHaveBeenCalledWith('all', {
          describe: 'Uninstall all extensions.',
          type: 'boolean',
        });
        expect(yargsMock.conflicts).toHaveBeenCalledWith('names', 'all');
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw when neither names nor --all is provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ names: [] })).toThrow(
          'Either extension name(s) or --all must be provided.',
        );
        expect(() => checkCallback({})).toThrow(
          'Either extension name(s) or --all must be provided.',
        );
      });

      it('check function should pass when names are provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ names: ['ext1'] })).not.toThrow();
      });

      it('check function should pass when --all is provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ all: true })).not.toThrow();
      });
    });

    it('handler should call handleUninstall', async () => {
      mockLoadExtensions.mockResolvedValue(undefined);
      mockUninstallExtension.mockResolvedValue(undefined);
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        names: string[];
        [key: string]: unknown;
      }
      const argv: TestArgv = { names: ['my-extension'], _: [], $0: '' };
      await (command.handler as unknown as (args: TestArgv) => Promise<void>)(
        argv,
      );

      expect(mockUninstallExtension).toHaveBeenCalledWith(
        'my-extension',
        false,
      );
      mockCwd.mockRestore();
    });
  });
});
