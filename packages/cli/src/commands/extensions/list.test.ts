/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import { handleList, listCommand } from './list.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { getErrorMessage } from '../../utils/errors.js';

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
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions list command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);
  const mockExtensionManager = vi.mocked(ExtensionManager);

  beforeEach(async () => {
    vi.clearAllMocks();
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

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
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

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
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

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'List failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('listCommand', () => {
    const command = listCommand;

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
