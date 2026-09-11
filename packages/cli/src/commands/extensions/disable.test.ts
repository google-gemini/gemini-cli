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
import { handleDisable, disableCommand } from './disable.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  loadSettings,
  SettingScope,
  type LoadedSettings,
} from '../../config/settings.js';
import { getErrorMessage } from '@google/gemini-cli-core';
import { exitCli } from '../utils.js';

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
    getErrorMessage: vi.fn(),
  };
});

vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: vi.fn(),
}));
vi.mock('../../config/extensions/extensionSettings.js', () => ({
  promptForSetting: vi.fn(),
}));
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions disable command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);
  const mockExtensionManager = vi.mocked(ExtensionManager);
  const mockExitCli = vi.mocked(exitCli);

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockExtensionManager.prototype.loadExtensions = vi
      .fn()
      .mockResolvedValue(undefined);
    mockExtensionManager.prototype.disableExtension = vi
      .fn()
      .mockResolvedValue(undefined);
    mockExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleDisable', () => {
    it.each([
      {
        scope: undefined,
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "undefined".',
      },
      {
        scope: 'user',
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "user".',
      },
      {
        scope: 'workspace',
        expectedScope: SettingScope.Workspace,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "workspace".',
      },
    ])(
      'should disable an extension in the $expectedScope scope when scope is $scope',
      async ({ scope, expectedScope, expectedLog }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        await handleDisable({ names: ['my-extension'], scope });
        expect(mockExtensionManager).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceDir: '/test/dir',
          }),
        );
        expect(
          mockExtensionManager.prototype.loadExtensions,
        ).toHaveBeenCalled();
        expect(
          mockExtensionManager.prototype.disableExtension,
        ).toHaveBeenCalledWith('my-extension', expectedScope);
        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        mockCwd.mockRestore();
      },
    );

    it('should disable multiple extensions when given a list of names', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleDisable({ names: ['ext-a', 'ext-b'] });

      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('ext-a', SettingScope.User);
      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('ext-b', SettingScope.User);
      mockCwd.mockRestore();
    });

    it('should dedupe duplicate names', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleDisable({ names: ['ext-a', 'ext-a'] });

      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledTimes(1);
      mockCwd.mockRestore();
    });

    it('should disable every installed extension when --all is set', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockExtensionManager.prototype.getExtensions = vi
        .fn()
        .mockReturnValue([{ name: 'ext-a' }, { name: 'ext-b' }]);

      await handleDisable({ all: true });

      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('ext-a', SettingScope.User);
      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('ext-b', SettingScope.User);
      mockCwd.mockRestore();
    });

    it('should log a message and return when --all is set with no installed extensions', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockExtensionManager.prototype.getExtensions = vi
        .fn()
        .mockReturnValue([]);

      await handleDisable({ all: true });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'No extensions currently installed.',
      );
      expect(
        mockExtensionManager.prototype.disableExtension,
      ).not.toHaveBeenCalled();
      mockCwd.mockRestore();
    });

    it('should log each error and call exitCli(1) when disabling fails', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const error = new Error('Disable failed');
      (
        mockExtensionManager.prototype.disableExtension as Mock
      ).mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Disable failed message');

      await handleDisable({ names: ['my-extension'] });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to disable "my-extension": Disable failed message',
      );
      expect(mockExitCli).toHaveBeenCalledWith(1);
      mockCwd.mockRestore();
    });
  });

  describe('disableCommand', () => {
    const command = disableCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('disable [names..]');
      expect(command.describe).toBe('Disables one or more extensions.');
    });

    describe('builder', () => {
      interface MockYargs {
        positional: Mock;
        option: Mock;
        check: Mock;
      }

      let yargsMock: MockYargs;

      beforeEach(() => {
        yargsMock = {
          positional: vi.fn().mockReturnThis(),
          option: vi.fn().mockReturnThis(),
          check: vi.fn().mockReturnThis(),
        };
      });

      it('should configure positional and option arguments', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        expect(yargsMock.positional).toHaveBeenCalledWith(
          'names',
          expect.objectContaining({
            type: 'string',
            array: true,
          }),
        );
        expect(yargsMock.option).toHaveBeenCalledWith(
          'all',
          expect.objectContaining({ type: 'boolean' }),
        );
        expect(yargsMock.option).toHaveBeenCalledWith('scope', {
          describe: 'The scope to disable the extension in.',
          type: 'string',
          default: SettingScope.User,
        });
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw when neither names nor --all is provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({})).toThrow(
          /at least one extension name to disable/,
        );
      });

      it('check function should throw for invalid scope', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        const expectedError = `Invalid scope: invalid. Please use one of ${Object.values(
          SettingScope,
        )
          .map((s) => s.toLowerCase())
          .join(', ')}.`;
        expect(() => checkCallback({ all: true, scope: 'invalid' })).toThrow(
          expectedError,
        );
      });

      it.each(['user', 'workspace', 'USER', 'WorkSpace'])(
        'check function should return true for valid scope "%s"',
        (scope) => {
          (command.builder as (yargs: Argv) => Argv)(
            yargsMock as unknown as Argv,
          );
          const checkCallback = yargsMock.check.mock.calls[0][0];
          expect(checkCallback({ all: true, scope })).toBe(true);
        },
      );
    });

    it('handler should trigger extension disabling', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        names: string[];
        all: boolean;
        scope: string;
        [key: string]: unknown;
      }
      const argv: TestArgv = {
        names: ['test-ext'],
        all: false,
        scope: 'workspace',
        _: [],
        $0: '',
      };
      await (command.handler as unknown as (args: TestArgv) => Promise<void>)(
        argv,
      );
      expect(mockExtensionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceDir: '/test/dir',
        }),
      );
      expect(mockExtensionManager.prototype.loadExtensions).toHaveBeenCalled();
      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('test-ext', SettingScope.Workspace);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "test-ext" successfully disabled for scope "workspace".',
      );
      mockCwd.mockRestore();
    });

    it('handler should normalize a scalar string positional to a single-element array', async () => {
      // Regression: yargs may pass `names` as a bare string when only one
      // positional is provided. The handler must wrap it in an array, not let
      // it be iterated character-by-character.
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        names: string;
        all: boolean;
        scope: string;
        [key: string]: unknown;
      }
      const argv: TestArgv = {
        names: 'conductor',
        all: false,
        scope: 'user',
        _: [],
        $0: '',
      };
      await (command.handler as unknown as (args: TestArgv) => Promise<void>)(
        argv,
      );

      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockExtensionManager.prototype.disableExtension,
      ).toHaveBeenCalledWith('conductor', SettingScope.User);
      mockCwd.mockRestore();
    });
  });
});
