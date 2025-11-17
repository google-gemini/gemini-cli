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
import { type CommandModule } from 'yargs';
import { handleList, listCommand } from './list.js';
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

describe('extensions list command', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleList', () => {
    it('should log a message if no extensions are installed', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockExtensionManager.prototype.loadExtensions = vi
        .fn()
        .mockResolvedValue([]);
      await handleList();

      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'No extensions installed.',
      );
      mockCwd.mockRestore();
    });

    it('should list all installed extensions', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const extensions = [
        { name: 'ext1', version: '1.0.0' },
        { name: 'ext2', version: '2.0.0' },
      ];
      mockExtensionManager.prototype.loadExtensions = vi
        .fn()
        .mockResolvedValue(extensions);
      mockExtensionManager.prototype.toOutputString = vi.fn(
        (ext) => `${ext.name}@${ext.version}`,
      );
      await handleList();

      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'ext1@1.0.0\n\next2@2.0.0',
      );
      mockCwd.mockRestore();
    });

    it('should log an error message and exit with code 1 when listing fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('List failed');
      mockExtensionManager.prototype.loadExtensions = vi
        .fn()
        .mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('List failed message');

      await handleList();

      expect(mockDebugLogger.error).toHaveBeenCalledWith('List failed message');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('listCommand', () => {
    const command = listCommand as CommandModule;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('list');
      expect(command.describe).toBe('Lists installed extensions.');
    });

    it('handler should call handleList', async () => {
      mockExtensionManager.prototype.loadExtensions = vi
        .fn()
        .mockResolvedValue([]);
      await (command.handler as () => Promise<void>)();
      expect(mockExtensionManager.prototype.loadExtensions).toHaveBeenCalled();
    });
  });
});
