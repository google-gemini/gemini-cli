/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDisableExtension = vi.fn();

vi.mock('../../config/extension-manager.js', () => ({
  ExtensionManager: vi.fn(() => ({
    loadExtensions: vi.fn(),
    disableExtension: mockDisableExtension,
  })),
}));

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(() => ({ merged: {} })),
  };
});

vi.mock('../../utils/errors.js', () => ({
  getErrorMessage: vi.fn((e) => e.message),
}));

const { mockDebugLogger } = vi.hoisted(() => ({
  mockDebugLogger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: mockDebugLogger,
  };
});

import { handleDisable, disableCommand } from './disable.js';
import { SettingScope } from '../../config/settings.js';

describe('disable command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  describe('handleDisable', () => {
    it('should disable an extension in the user scope by default', async () => {
      await handleDisable({ name: 'my-extension' });
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'my-extension',
        SettingScope.User,
      );
      expect(mockDebugLogger.log).toHaveBeenCalledWith(
        'Extension "my-extension" successfully disabled for scope "User".',
      );
    });

    it('should disable an extension in the workspace scope', async () => {
      await handleDisable({ name: 'my-extension', scope: 'workspace' });
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'my-extension',
        SettingScope.Workspace,
      );
    });

    it('should log an error if disabling fails', async () => {
      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const error = new Error('Disable failed');
      mockDisableExtension.mockRejectedValue(error);
      await handleDisable({ name: 'my-extension' });
      expect(mockDebugLogger.error).toHaveBeenCalledWith('Disable failed');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('command configuration', () => {
    it('should have the correct command and description', () => {
      expect(disableCommand.command).toBe('disable [--scope] <name>');
      expect(disableCommand.describe).toBe('Disables an extension.');
    });

    it('should have a handler function', () => {
      expect(typeof disableCommand.handler).toBe('function');
    });

    it('should validate the scope argument', () => {
      if (typeof disableCommand.builder !== 'function') {
        throw new Error('Builder is not a function');
      }
      const yargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };
      disableCommand.builder(yargs as unknown as import('yargs').Argv);
      const checkFn = yargs.check.mock.calls[0][0];

      expect(checkFn({ scope: 'user' })).toBe(true);
      expect(checkFn({ scope: 'workspace' })).toBe(true);
      expect(() => checkFn({ scope: 'invalid' })).toThrow(
        'Invalid scope: invalid',
      );
    });
  });
});
