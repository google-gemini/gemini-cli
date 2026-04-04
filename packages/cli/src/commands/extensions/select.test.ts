/**
 * @license
 * Copyright 2026 Google LLC
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
import { handleSelect, selectCommand } from './select.js';
import { SettingScope } from '../../config/settings.js';
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

const mockExtensionManager = vi.hoisted(() => ({
  getExtensions: vi.fn(),
  enableExtension: vi.fn(),
  disableExtension: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  getExtensionManager: vi.fn(() => Promise.resolve(mockExtensionManager)),
}));

const mockEnablementInstance = vi.hoisted(() => ({
  autoEnableServers: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../config/mcp/mcpServerEnablement.js', () => ({
  McpServerEnablementManager: {
    getInstance: () => mockEnablementInstance,
  },
}));

const mockPrompts = vi.hoisted(() => vi.fn());
vi.mock('prompts', () => ({ default: mockPrompts }));

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions select command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtensionManager.getExtensions.mockReturnValue([]);
    mockExtensionManager.enableExtension.mockResolvedValue(undefined);
    mockExtensionManager.disableExtension.mockResolvedValue(undefined);
    mockEnablementInstance.autoEnableServers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleSelect', () => {
    it('should log a message if no extensions are installed', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([]);

      await handleSelect({});

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'No extensions installed.',
      );
      expect(mockPrompts).not.toHaveBeenCalled();
    });

    it('should log cancellation when user cancels the prompt', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: true },
      ]);
      mockPrompts.mockResolvedValue({});

      await handleSelect({});

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Selection cancelled.',
      );
      expect(mockExtensionManager.enableExtension).not.toHaveBeenCalled();
      expect(mockExtensionManager.disableExtension).not.toHaveBeenCalled();
    });

    it('should enable newly selected and disable newly deselected extensions', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: false },
        { name: 'ext-b', version: '2.0.0', isActive: true },
      ]);
      mockPrompts.mockResolvedValue({ extensions: ['ext-a'] });

      await handleSelect({});

      expect(mockExtensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.User,
      );
      expect(mockExtensionManager.disableExtension).toHaveBeenCalledWith(
        'ext-b',
        SettingScope.User,
      );
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Done: 1 enabled, 1 disabled.',
      );
    });

    it('should log no changes when selection matches current state', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: true },
        { name: 'ext-b', version: '2.0.0', isActive: false },
      ]);
      mockPrompts.mockResolvedValue({ extensions: ['ext-a'] });

      await handleSelect({});

      expect(mockExtensionManager.enableExtension).not.toHaveBeenCalled();
      expect(mockExtensionManager.disableExtension).not.toHaveBeenCalled();
      expect(emitConsoleLog).toHaveBeenCalledWith('log', 'No changes made.');
    });

    it('should enable named extensions and disable others in non-interactive mode', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: false },
        { name: 'ext-b', version: '2.0.0', isActive: true },
        { name: 'ext-c', version: '3.0.0', isActive: true },
      ]);

      await handleSelect({ names: ['ext-a'] });

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(mockExtensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.User,
      );
      expect(mockExtensionManager.disableExtension).toHaveBeenCalledWith(
        'ext-b',
        SettingScope.User,
      );
      expect(mockExtensionManager.disableExtension).toHaveBeenCalledWith(
        'ext-c',
        SettingScope.User,
      );
    });

    it('should error and exit for unknown extension names', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: true },
      ]);

      await handleSelect({ names: ['ext-a', 'unknown-ext'] });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('unknown-ext'),
      );
      expect(exitCli).toHaveBeenCalledWith(1);
    });

    it('should enable all extensions with --all flag', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: false },
        { name: 'ext-b', version: '2.0.0', isActive: false },
      ]);

      await handleSelect({ all: true });

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(mockExtensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.User,
      );
      expect(mockExtensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-b',
        SettingScope.User,
      );
    });

    it('should disable all extensions with --none flag', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: true },
        { name: 'ext-b', version: '2.0.0', isActive: true },
      ]);

      await handleSelect({ none: true });

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(mockExtensionManager.disableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.User,
      );
      expect(mockExtensionManager.disableExtension).toHaveBeenCalledWith(
        'ext-b',
        SettingScope.User,
      );
    });

    it('should use workspace scope when specified', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: false },
      ]);

      await handleSelect({ names: ['ext-a'], scope: 'workspace' });

      expect(mockExtensionManager.enableExtension).toHaveBeenCalledWith(
        'ext-a',
        SettingScope.Workspace,
      );
    });

    it('should auto-enable MCP servers when enabling an extension with MCP servers', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        {
          name: 'ext-a',
          version: '1.0.0',
          isActive: false,
          mcpServers: { 'test-server': {} },
        },
      ]);
      mockEnablementInstance.autoEnableServers.mockResolvedValue([
        'test-server',
      ]);

      await handleSelect({ names: ['ext-a'] });

      expect(mockEnablementInstance.autoEnableServers).toHaveBeenCalledWith([
        'test-server',
      ]);
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining("MCP server 'test-server' was disabled"),
      );
    });

    it('should not log MCP message when servers are already enabled', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        {
          name: 'ext-a',
          version: '1.0.0',
          isActive: false,
          mcpServers: { 'test-server': {} },
        },
      ]);
      mockEnablementInstance.autoEnableServers.mockResolvedValue([]);

      await handleSelect({ names: ['ext-a'] });

      expect(emitConsoleLog).not.toHaveBeenCalledWith(
        'log',
        expect.stringContaining("MCP server 'test-server' was disabled"),
      );
    });

    it('should log error and exit when enable/disable fails', async () => {
      mockExtensionManager.getExtensions.mockReturnValue([
        { name: 'ext-a', version: '1.0.0', isActive: false },
      ]);
      mockExtensionManager.enableExtension.mockRejectedValue(
        new Error('Enable failed'),
      );

      await handleSelect({ names: ['ext-a'] });

      expect(emitConsoleLog).toHaveBeenCalledWith('error', 'Enable failed');
      expect(exitCli).toHaveBeenCalledWith(1);
    });
  });

  describe('selectCommand', () => {
    const command = selectCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('select [names..] [--all] [--none]');
      expect(command.describe).toBe(
        'Select which extensions to enable. Without arguments, shows an interactive picker.',
      );
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
          'none',
          expect.objectContaining({ type: 'boolean' }),
        );
        expect(yargsMock.option).toHaveBeenCalledWith(
          'scope',
          expect.objectContaining({ type: 'string' }),
        );
        expect(yargsMock.check).toHaveBeenCalled();
      });

      it('check function should throw for mutually exclusive flags', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ all: true, none: true })).toThrow(
          'Only one of --all, --none, or extension names may be provided.',
        );
      });

      it('check function should throw when --all used with names', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ all: true, names: ['ext-a'] })).toThrow(
          'Only one of --all, --none, or extension names may be provided.',
        );
      });

      it('check function should throw for invalid scope', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        const checkCallback = yargsMock.check.mock.calls[0][0];
        expect(() => checkCallback({ scope: 'invalid' })).toThrow(
          /Invalid scope: invalid/,
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
  });
});
