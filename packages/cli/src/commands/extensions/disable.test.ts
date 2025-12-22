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

describe('extensions disable command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockGetErrorMessage = vi.mocked(getErrorMessage);
  const mockExtensionManager = vi.mocked(ExtensionManager);

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleDisable', () => {
    it.each([
      {
        name: 'my-extension',
        scope: undefined,
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "undefined".',
      },
      {
        name: 'my-extension',
        scope: 'user',
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "user".',
      },
      {
        name: 'my-extension',
        scope: 'workspace',
        expectedScope: SettingScope.Workspace,
        expectedLog:
          'Extension "my-extension" successfully disabled for scope "workspace".',
      },
    ])(
      'should disable an extension in the $expectedScope scope when scope is $scope',
      async ({ name, scope, expectedScope, expectedLog }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        await handleDisable({ name, scope });
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
        ).toHaveBeenCalledWith(name, expectedScope);
        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        mockCwd.mockRestore();
      },
    );

    it('should log an error message and exit with code 1 when extension disabling fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Disable failed');
      (
        mockExtensionManager.prototype.disableExtension as Mock
      ).mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Disable failed message');
      await handleDisable({ name: 'my-extension' });
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Disable failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('disableCommand', () => {
    const command = disableCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('disable [--scope] <name>');
      expect(command.describe).toBe('Disables an extension.');
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
        expect(yargsMock.positional).toHaveBeenCalledWith('name', {
          describe: 'The name of the extension to disable.',
          type: 'string',
        });
        expect(yargsMock.option).toHaveBeenCalledWith('scope', {
          describe: 'The scope to disable the extension in.',
          type: 'string',
          default: SettingScope.User,
        });
        expect(yargsMock.check).toHaveBeenCalled();
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
        expect(() => checkCallback({ scope: 'invalid' })).toThrow(
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
          expect(checkCallback({ scope })).toBe(true);
        },
      );
    });

    it('handler should trigger extension disabling', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        name: string;
        scope: string;
        [key: string]: unknown;
      }
      const argv: TestArgv = {
        name: 'test-ext',
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
  });
});
