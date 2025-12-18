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
import { handleEnable, enableCommand } from './enable.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  loadSettings,
  SettingScope,
  type LoadedSettings,
} from '../../config/settings.js';
import { FatalConfigError } from '@google/gemini-cli-core';

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
    getErrorMessage: vi.fn((error: { message: string }) => error.message),
    FatalConfigError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'FatalConfigError';
      }
    },
  };
});

vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
vi.mock('../../config/extensions/consent.js');
vi.mock('../../config/extensions/extensionSettings.js');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions enable command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
  const mockExtensionManager = vi.mocked(ExtensionManager);

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockExtensionManager.prototype.loadExtensions = vi
      .fn()
      .mockResolvedValue(undefined);
    mockExtensionManager.prototype.enableExtension = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleEnable', () => {
    it.each([
      {
        name: 'my-extension',
        scope: undefined,
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully enabled in all scopes.',
      },
      {
        name: 'my-extension',
        scope: 'workspace',
        expectedScope: SettingScope.Workspace,
        expectedLog:
          'Extension "my-extension" successfully enabled for scope "workspace".',
      },
    ])(
      'should enable an extension in the $expectedScope scope when scope is $scope',
      async ({ name, scope, expectedScope, expectedLog }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        await handleEnable({ name, scope });

        expect(mockExtensionManager).toHaveBeenCalledWith(
          expect.objectContaining({
            workspaceDir: '/test/dir',
          }),
        );
        expect(
          mockExtensionManager.prototype.loadExtensions,
        ).toHaveBeenCalled();
        expect(
          mockExtensionManager.prototype.enableExtension,
        ).toHaveBeenCalledWith(name, expectedScope);
        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        mockCwd.mockRestore();
      },
    );

    it('should throw FatalConfigError when extension enabling fails', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const error = new Error('Enable failed');
      (
        mockExtensionManager.prototype.enableExtension as Mock
      ).mockImplementation(() => {
        throw error;
      });

      const promise = handleEnable({ name: 'my-extension' });
      await expect(promise).rejects.toThrow(FatalConfigError);
      await expect(promise).rejects.toThrow('Enable failed');

      mockCwd.mockRestore();
    });
  });

  describe('enableCommand', () => {
    const command = enableCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('enable [--scope] <name>');
      expect(command.describe).toBe('Enables an extension.');
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
          describe: 'The name of the extension to enable.',
          type: 'string',
        });
        expect(yargsMock.option).toHaveBeenCalledWith('scope', {
          describe:
            'The scope to enable the extension in. If not set, will be enabled in all scopes.',
          type: 'string',
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
    });

    it('handler should call handleEnable', async () => {
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

      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('test-ext', SettingScope.Workspace);
      mockCwd.mockRestore();
    });
  });
});
