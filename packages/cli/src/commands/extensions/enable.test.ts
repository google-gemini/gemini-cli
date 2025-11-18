/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleEnable, enableCommand } from './enable.js';
import * as extensionModule from '../../config/extension.js';
import { SettingScope } from '../../config/settings.js';
import { FatalConfigError } from '@google/gemini-cli-core';

vi.mock('../../config/extension.js');

describe('extensions enable command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleEnable', () => {
    it('should enable extension in User scope by default', () => {
      handleEnable({ name: 'test-extension' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-extension',
        SettingScope.User,
      );
    });

    it('should enable extension in Workspace scope when specified', () => {
      handleEnable({ name: 'test-extension', scope: 'workspace' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-extension',
        SettingScope.Workspace,
      );
    });

    it('should handle workspace scope case-insensitively', () => {
      handleEnable({ name: 'test-ext', scope: 'WORKSPACE' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.Workspace,
      );
    });

    it('should handle workspace scope with mixed case', () => {
      handleEnable({ name: 'test-ext', scope: 'WorkSpace' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.Workspace,
      );
    });

    it('should use User scope for non-workspace scopes', () => {
      handleEnable({ name: 'test-ext', scope: 'user' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should use User scope for system scope', () => {
      handleEnable({ name: 'test-ext', scope: 'system' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should display success message with scope', () => {
      handleEnable({ name: 'my-extension', scope: 'workspace' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "my-extension" successfully enabled for scope "workspace".',
      );
    });

    it('should display success message for all scopes when no scope specified', () => {
      handleEnable({ name: 'my-extension' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "my-extension" successfully enabled in all scopes.',
      );
    });

    it('should include extension name in success message', () => {
      handleEnable({ name: 'custom-name', scope: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom-name'),
      );
    });

    it('should include scope in success message when provided', () => {
      handleEnable({ name: 'ext', scope: 'workspace' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('workspace'),
      );
    });

    it('should throw FatalConfigError on enableExtension error', () => {
      const error = new Error('Enable failed');
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw error;
      });

      expect(() => handleEnable({ name: 'test-ext' })).toThrow(
        FatalConfigError,
      );
    });

    it('should include error message in FatalConfigError', () => {
      const error = new Error('Extension not found');
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw error;
      });

      expect(() => handleEnable({ name: 'test-ext' })).toThrow(
        'Extension not found',
      );
    });

    it('should pass extension name to enableExtension', () => {
      handleEnable({ name: 'specific-extension' });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'specific-extension',
        expect.any(String),
      );
    });

    it('should handle undefined scope', () => {
      handleEnable({ name: 'test-ext', scope: undefined });

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test-ext',
        SettingScope.User,
      );
    });

    it('should not log on error', () => {
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw new Error('Error');
      });

      try {
        handleEnable({ name: 'ext' });
      } catch {
        // Expected
      }

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('enableCommand', () => {
    it('should have correct command name', () => {
      expect(enableCommand.command).toBe('enable [--scope] <name>');
    });

    it('should require name parameter', () => {
      expect(enableCommand.command).toContain('<name>');
    });

    it('should have optional scope parameter', () => {
      expect(enableCommand.command).toContain('[--scope]');
    });

    it('should have description', () => {
      expect(enableCommand.describe).toBe('Enables an extension.');
    });

    it('should have builder function', () => {
      expect(enableCommand.builder).toBeDefined();
      expect(typeof enableCommand.builder).toBe('function');
    });

    it('should have handler function', () => {
      expect(enableCommand.handler).toBeDefined();
      expect(typeof enableCommand.handler).toBe('function');
    });

    it('should configure name as positional argument', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

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

      enableCommand.builder(mockYargs as never);

      expect(mockYargs.option).toHaveBeenCalledWith(
        'scope',
        expect.objectContaining({
          describe: expect.any(String),
          type: 'string',
        }),
      );
    });

    it('should mention "all scopes" in scope option description', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

      const scopeConfig = mockYargs.option.mock.calls.find(
        (call) => call[0] === 'scope',
      )?.[1];
      expect(scopeConfig?.describe).toContain('all scopes');
    });

    it('should not have default scope value', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

      const scopeConfig = mockYargs.option.mock.calls.find(
        (call) => call[0] === 'scope',
      )?.[1];
      expect(scopeConfig?.default).toBeUndefined();
    });

    it('should validate scope values', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

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

      enableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: 'invalid' })).toThrow('Invalid scope');
    });

    it('should provide helpful error message for invalid scope', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

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

      enableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: 'USER' })).not.toThrow();
      expect(() => checkFn({ scope: 'WORKSPACE' })).not.toThrow();
    });

    it('should allow undefined scope', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      enableCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];

      expect(() => checkFn({ scope: undefined })).not.toThrow();
    });

    it('should call handleEnable when handler is invoked', () => {
      vi.spyOn(extensionModule, 'enableExtension').mockImplementation(
        () => undefined,
      );

      enableCommand.handler({ name: 'test', scope: 'user' } as never);

      expect(extensionModule.enableExtension).toHaveBeenCalled();
    });

    it('should pass name to handleEnable', () => {
      enableCommand.handler({ name: 'my-ext', scope: 'user' } as never);

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'my-ext',
        expect.any(String),
      );
    });

    it('should pass scope to handleEnable', () => {
      enableCommand.handler({ name: 'ext', scope: 'workspace' } as never);

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
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

      enableCommand.handler(argv as never);

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'extracted-name',
        SettingScope.Workspace,
      );
    });
  });

  describe('EnableArgs interface', () => {
    it('should accept name property', () => {
      const args: { name: string; scope?: string } = { name: 'test' };

      handleEnable(args);

      expect(extensionModule.enableExtension).toHaveBeenCalled();
    });

    it('should accept optional scope property', () => {
      const args: { name: string; scope?: string } = {
        name: 'test',
        scope: 'workspace',
      };

      handleEnable(args);

      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'test',
        SettingScope.Workspace,
      );
    });
  });

  describe('integration scenarios', () => {
    it('should complete full enable flow successfully', () => {
      handleEnable({ name: 'my-extension', scope: 'workspace' });

      expect(extensionModule.enableExtension).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle enable failure with exception', () => {
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw new Error('Extension not found');
      });

      expect(() => handleEnable({ name: 'nonexistent' })).toThrow(
        FatalConfigError,
      );
    });

    it('should handle different extension names', () => {
      const names = ['ext1', 'ext2', 'my-custom-extension'];

      for (const name of names) {
        handleEnable({ name });

        expect(extensionModule.enableExtension).toHaveBeenCalledWith(
          name,
          SettingScope.User,
        );
      }
    });

    it('should handle both scope values', () => {
      handleEnable({ name: 'ext', scope: 'user' });
      expect(extensionModule.enableExtension).toHaveBeenLastCalledWith(
        'ext',
        SettingScope.User,
      );

      handleEnable({ name: 'ext', scope: 'workspace' });
      expect(extensionModule.enableExtension).toHaveBeenLastCalledWith(
        'ext',
        SettingScope.Workspace,
      );
    });
  });

  describe('success messages', () => {
    it('should show scope-specific message when scope provided', () => {
      handleEnable({ name: 'ext', scope: 'workspace' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('for scope'),
      );
    });

    it('should show all scopes message when no scope provided', () => {
      handleEnable({ name: 'ext' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('all scopes'),
      );
    });

    it('should show all scopes message when scope is undefined', () => {
      handleEnable({ name: 'ext', scope: undefined });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('all scopes'),
      );
    });
  });

  describe('error handling', () => {
    it('should wrap errors in FatalConfigError', () => {
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw new Error('Original error');
      });

      try {
        handleEnable({ name: 'ext' });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FatalConfigError);
      }
    });

    it('should preserve error message', () => {
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        throw new Error('Detailed error message');
      });

      expect(() => handleEnable({ name: 'ext' })).toThrow(
        'Detailed error message',
      );
    });

    it('should handle non-Error exceptions', () => {
      vi.mocked(extensionModule.enableExtension).mockImplementation(() => {
        // Test with a non-standard error object
        throw { message: 'Non-Error object' };
      });

      expect(() => handleEnable({ name: 'ext' })).toThrow(FatalConfigError);
    });
  });

  describe('scope handling', () => {
    it('should treat empty scope as undefined', () => {
      handleEnable({ name: 'ext', scope: '' });

      // Empty string is not 'workspace', so should use User scope
      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.User,
      );
    });

    it('should only recognize workspace in lowercase check', () => {
      handleEnable({ name: 'ext', scope: 'workspace' });
      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.Workspace,
      );

      handleEnable({ name: 'ext', scope: 'WORKSPACE' });
      expect(extensionModule.enableExtension).toHaveBeenCalledWith(
        'ext',
        SettingScope.Workspace,
      );
    });
  });
});
