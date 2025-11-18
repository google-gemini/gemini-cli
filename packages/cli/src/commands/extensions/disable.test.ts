/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleDisable, disableCommand } from './disable.js';
import * as extensionModule from '../../config/extension.js';
import { SettingScope } from '../../config/settings.js';
import * as errorsModule from '../../utils/errors.js';

vi.mock('../../config/extension.js');
vi.mock('../../utils/errors.js');

describe('extensions disable command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleDisable', () => {
    it('should disable extension in User scope by default', () => {
      handleDisable({ name: 'test-extension' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-extension',
        SettingScope.User,
      );
    });

    it('should disable extension in Workspace scope when specified', () => {
      handleDisable({ name: 'test-extension', scope: 'workspace' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-extension',
        SettingScope.Workspace,
      );
    });

    it('should handle workspace scope case-insensitively', () => {
      handleDisable({ name: 'test-ext', scope: 'WORKSPACE' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.Workspace,
      );
    });

    it('should handle workspace scope with mixed case', () => {
      handleDisable({ name: 'test-ext', scope: 'WorkSpace' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.Workspace,
      );
    });

    it('should use User scope for non-workspace scopes', () => {
      handleDisable({ name: 'test-ext', scope: 'user' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should use User scope for system scope', () => {
      handleDisable({ name: 'test-ext', scope: 'system' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should display success message', () => {
      handleDisable({ name: 'my-extension', scope: 'workspace' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "my-extension" successfully disabled for scope "workspace".',
      );
    });

    it('should include extension name in success message', () => {
      handleDisable({ name: 'custom-name', scope: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom-name'),
      );
    });

    it('should include scope in success message', () => {
      handleDisable({ name: 'ext', scope: 'workspace' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('workspace'),
      );
    });

    it('should handle errors from disableExtension', () => {
      const error = new Error('Disable failed');
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw error;
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Disable failed');

      handleDisable({ name: 'test-ext' });

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Disable failed');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on error', () => {
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw new Error('Error');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Error message');

      handleDisable({ name: 'ext' });

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit on success', () => {
      handleDisable({ name: 'ext' });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should pass extension name to disableExtension', () => {
      handleDisable({ name: 'specific-extension' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'specific-extension',
        expect.any(String),
      );
    });

    it('should handle undefined scope', () => {
      handleDisable({ name: 'test-ext', scope: undefined });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should format error message using getErrorMessage', () => {
      const error = new Error('Custom error');
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw error;
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Formatted error',
      );

      handleDisable({ name: 'ext' });

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Formatted error');
    });
  });

  describe('disableCommand', () => {
    it('should have correct command name', () => {
      expect(disableCommand.command).toBe('disable [--scope] <name>');
    });

    it('should require name parameter', () => {
      expect(disableCommand.command).toContain('<name>');
    });

    it('should have optional scope parameter', () => {
      expect(disableCommand.command).toContain('[--scope]');
    });

    it('should have description', () => {
      expect(disableCommand.describe).toBe('Disables an extension.');
    });

    it('should have builder function', () => {
      expect(disableCommand.builder).toBeDefined();
      expect(typeof disableCommand.builder).toBe('function');
    });

    it('should have handler function', () => {
      expect(disableCommand.handler).toBeDefined();
      expect(typeof disableCommand.handler).toBe('function');
    });

    it('should configure name as positional argument', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      expect(mockYargs.positional).toHaveBeenCalledWith(
        'name',
        expect.objectContaining({
          describe: expect.any(String),
          type: 'string',
        }),
      );
    });

    it('should configure scope option', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      expect(mockYargs.option).toHaveBeenCalledWith(
        'scope',
        expect.objectContaining({
          describe: expect.any(String),
          type: 'string',
          default: SettingScope.User,
        }),
      );
    });

    it('should set default scope to User', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      const scopeConfig = mockYargs.option.mock.calls.find(
        (call) => call[0] === 'scope',
      )?.[1];
      expect(scopeConfig?.default).toBe(SettingScope.User);
    });

    it('should validate scope values', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: 'user' })).not.toThrow();
      expect(() => checkFn({ scope: 'workspace' })).not.toThrow();
      expect(() => checkFn({ scope: 'system' })).not.toThrow();
    });

    it('should reject invalid scope values', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: 'invalid' })).toThrow('Invalid scope');
    });

    it('should provide helpful error message for invalid scope', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      try {
        checkFn({ scope: 'bad' });
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('bad');
        expect((error as Error).message).toContain('user');
        expect((error as Error).message).toContain('workspace');
        expect((error as Error).message).toContain('system');
      }
    });

    it('should handle uppercase scope values in validation', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      disableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: 'USER' })).not.toThrow();
      expect(() => checkFn({ scope: 'WORKSPACE' })).not.toThrow();
    });

    it('should call handleDisable when handler is invoked', () => {
      vi.spyOn(extensionModule, 'disableExtension').mockImplementation(
        () => undefined,
      );

      disableCommand.handler({ name: 'test', scope: 'user' } as never);

      expect(extensionModule.disableExtension).toHaveBeenCalled();
    });

    it('should pass name to handleDisable', () => {
      disableCommand.handler({ name: 'my-ext', scope: 'user' } as never);

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'my-ext',
        expect.any(String),
      );
    });

    it('should pass scope to handleDisable', () => {
      disableCommand.handler({ name: 'ext', scope: 'workspace' } as never);

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        expect.any(String),
        SettingScope.Workspace,
      );
    });

    it('should extract argv values', () => {
      const argv = {
        name: 'extracted-name',
        scope: 'workspace',
        _: [],
        $0: 'gemini',
      };

      disableCommand.handler(argv as never);

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'extracted-name',
        SettingScope.Workspace,
      );
    });
  });

  describe('DisableArgs interface', () => {
    it('should accept name property', () => {
      const args: { name: string; scope?: string } = { name: 'test' };

      handleDisable(args);

      expect(extensionModule.disableExtension).toHaveBeenCalled();
    });

    it('should accept optional scope property', () => {
      const args: { name: string; scope?: string } = {
        name: 'test',
        scope: 'workspace',
      };

      handleDisable(args);

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'test',
        SettingScope.Workspace,
      );
    });
  });

  describe('integration scenarios', () => {
    it('should complete full disable flow successfully', () => {
      handleDisable({ name: 'my-extension', scope: 'workspace' });

      expect(extensionModule.disableExtension).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle disable failure gracefully', () => {
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw new Error('Extension not found');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Extension not found',
      );

      handleDisable({ name: 'nonexistent' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Extension not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle different extension names', () => {
      const names = ['ext1', 'ext2', 'my-custom-extension'];

      for (const name of names) {
        handleDisable({ name });

        expect(extensionModule.disableExtension).toHaveBeenCalledWith(
          name,
          SettingScope.User,
        );
      }
    });

    it('should handle both scope values', () => {
      handleDisable({ name: 'ext', scope: 'user' });
      expect(extensionModule.disableExtension).toHaveBeenLastCalledWith(
        'ext',
        SettingScope.User,
      );

      handleDisable({ name: 'ext', scope: 'workspace' });
      expect(extensionModule.disableExtension).toHaveBeenLastCalledWith(
        'ext',
        SettingScope.Workspace,
      );
    });
  });

  describe('error messages', () => {
    it('should display formatted error message', () => {
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw new Error('Original error');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Formatted error message',
      );

      handleDisable({ name: 'ext' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Formatted error message');
    });

    it('should not display success message on error', () => {
      vi.mocked(extensionModule.disableExtension).mockImplementation(() => {
        throw new Error('Error');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Error');

      handleDisable({ name: 'ext' });

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('scope handling', () => {
    it('should treat empty scope as user scope', () => {
      handleDisable({ name: 'ext', scope: '' });

      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.User,
      );
    });

    it('should only recognize workspace in lowercase', () => {
      handleDisable({ name: 'ext', scope: 'workspace' });
      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.Workspace,
      );

      handleDisable({ name: 'ext', scope: 'WORKSPACE' });
      expect(extensionModule.disableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.Workspace,
      );
    });
  });
});
