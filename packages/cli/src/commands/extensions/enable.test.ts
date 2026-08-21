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
    getErrorMessage: vi.fn((error: { message: string }) => error.message),
  };
});

vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
vi.mock('../../config/extensions/consent.js');
vi.mock('../../config/extensions/extensionSettings.js');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

const mockEnablementInstance = vi.hoisted(() => ({
  getDisplayState: vi.fn(),
  enable: vi.fn(),
  clearSessionDisable: vi.fn(),
  autoEnableServers: vi.fn(),
}));
vi.mock('../../config/mcp/mcpServerEnablement.js', () => ({
  McpServerEnablementManager: {
    getInstance: () => mockEnablementInstance,
  },
}));

describe('extensions enable command', () => {
  const mockLoadSettings = vi.mocked(loadSettings);
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
    mockExtensionManager.prototype.enableExtension = vi.fn();
    mockExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([]);
    mockEnablementInstance.getDisplayState.mockReset();
    mockEnablementInstance.enable.mockReset();
    mockEnablementInstance.clearSessionDisable.mockReset();
    mockEnablementInstance.autoEnableServers.mockReset();
    mockEnablementInstance.autoEnableServers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleEnable', () => {
    it.each([
      {
        scope: undefined,
        expectedScope: SettingScope.User,
        expectedLog:
          'Extension "my-extension" successfully enabled in all scopes.',
      },
      {
        scope: 'workspace',
        expectedScope: SettingScope.Workspace,
        expectedLog:
          'Extension "my-extension" successfully enabled for scope "workspace".',
      },
    ])(
      'should enable an extension in the $expectedScope scope when scope is $scope',
      async ({ scope, expectedScope, expectedLog }) => {
        const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
        await handleEnable({ names: ['my-extension'], scope });

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
        ).toHaveBeenCalledWith('my-extension', expectedScope);
        expect(emitConsoleLog).toHaveBeenCalledWith('log', expectedLog);
        mockCwd.mockRestore();
      },
    );

    it('should enable multiple extensions when given a list of names', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleEnable({ names: ['ext-a', 'ext-b'] });

      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('ext-a', SettingScope.User);
      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('ext-b', SettingScope.User);
      mockCwd.mockRestore();
    });

    it('should dedupe duplicate names', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleEnable({ names: ['ext-a', 'ext-a'] });

      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('ext-a', SettingScope.User);
      mockCwd.mockRestore();
    });

    it('should enable every installed extension when --all is set', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([
        { name: 'ext-a', mcpServers: undefined },
        { name: 'ext-b', mcpServers: undefined },
      ]);

      await handleEnable({ all: true });

      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('ext-a', SettingScope.User);
      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('ext-b', SettingScope.User);
      mockCwd.mockRestore();
    });

    it('should log a message and return when --all is set with no installed extensions', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockExtensionManager.prototype.getExtensions = vi
        .fn()
        .mockReturnValue([]);

      await handleEnable({ all: true });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'No extensions currently installed.',
      );
      expect(
        mockExtensionManager.prototype.enableExtension,
      ).not.toHaveBeenCalled();
      mockCwd.mockRestore();
    });

    it('should log each error and call exitCli(1) when enabling fails', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      const error = new Error('Enable failed');
      (
        mockExtensionManager.prototype.enableExtension as Mock
      ).mockRejectedValue(error);

      await handleEnable({ names: ['my-extension'] });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Failed to enable "my-extension": Enable failed',
      );
      expect(mockExitCli).toHaveBeenCalledWith(1);
      mockCwd.mockRestore();
    });

    it('should auto-enable disabled MCP servers for the extension', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockEnablementInstance.autoEnableServers.mockResolvedValue([
        'test-server',
      ]);
      mockExtensionManager.prototype.getExtensions = vi
        .fn()
        .mockReturnValue([
          { name: 'my-extension', mcpServers: { 'test-server': {} } },
        ]);

      await handleEnable({ names: ['my-extension'] });

      expect(mockEnablementInstance.autoEnableServers).toHaveBeenCalledWith([
        'test-server',
      ]);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining("MCP server 'test-server' was disabled"),
      );
      mockCwd.mockRestore();
    });

    it('should batch MCP servers across multiple enabled extensions into one call', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockEnablementInstance.autoEnableServers.mockResolvedValue([]);
      mockExtensionManager.prototype.getExtensions = vi.fn().mockReturnValue([
        { name: 'ext-a', mcpServers: { 'server-a': {} } },
        { name: 'ext-b', mcpServers: { 'server-b': {} } },
      ]);

      await handleEnable({ names: ['ext-a', 'ext-b'] });

      expect(mockEnablementInstance.autoEnableServers).toHaveBeenCalledTimes(1);
      expect(mockEnablementInstance.autoEnableServers).toHaveBeenCalledWith([
        'server-a',
        'server-b',
      ]);
      mockCwd.mockRestore();
    });

    it('should not log when MCP servers are already enabled', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      mockEnablementInstance.autoEnableServers.mockResolvedValue([]);
      mockExtensionManager.prototype.getExtensions = vi
        .fn()
        .mockReturnValue([
          { name: 'my-extension', mcpServers: { 'test-server': {} } },
        ]);

      await handleEnable({ names: ['my-extension'] });

      expect(mockEnablementInstance.autoEnableServers).toHaveBeenCalledWith([
        'test-server',
      ]);
      expect(emitConsoleLog).not.toHaveBeenCalledWith(
        'log',
        expect.stringContaining("MCP server 'test-server' was disabled"),
      );
      mockCwd.mockRestore();
    });
  });

  describe('enableCommand', () => {
    const command = enableCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('enable [names..]');
      expect(command.describe).toBe('Enables one or more extensions.');
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
        expect(yargsMock.option).toHaveBeenCalledWith(
          'scope',
          expect.objectContaining({ type: 'string' }),
        );
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw when neither names nor --all is provided', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({})).toThrow(
          /at least one extension name to enable/,
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
    });

    it('handler should call handleEnable', async () => {
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

      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('test-ext', SettingScope.Workspace);
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
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockExtensionManager.prototype.enableExtension,
      ).toHaveBeenCalledWith('conductor', SettingScope.User);
      mockCwd.mockRestore();
    });
  });
});
