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
import { handleLink, linkCommand } from './link.js';
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

describe('extensions link command', () => {
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
    mockExtensionManager.prototype.installOrUpdateExtension = vi
      .fn()
      .mockResolvedValue({ name: 'my-linked-extension' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleLink', () => {
    it('should link an extension from a local path', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleLink({ path: '/local/path/to/extension' });

      expect(mockExtensionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceDir: '/test/dir',
        }),
      );
      expect(mockExtensionManager.prototype.loadExtensions).toHaveBeenCalled();
      expect(
        mockExtensionManager.prototype.installOrUpdateExtension,
      ).toHaveBeenCalledWith({
        source: '/local/path/to/extension',
        type: 'link',
      });
      expect(emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "my-linked-extension" linked successfully and enabled.',
      );
      mockCwd.mockRestore();
    });

    it('should log an error message and exit with code 1 when linking fails', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      const error = new Error('Link failed');
      (
        mockExtensionManager.prototype.installOrUpdateExtension as Mock
      ).mockRejectedValue(error);
      mockGetErrorMessage.mockReturnValue('Link failed message');

      await handleLink({ path: '/local/path/to/extension' });

      expect(emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Link failed message',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });
  });

  describe('linkCommand', () => {
    const command = linkCommand;

    it('should have correct command and describe', () => {
      expect(command.command).toBe('link <path>');
      expect(command.describe).toBe(
        'Links an extension from a local path. Updates made to the local path will always be reflected.',
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

      it('should configure positional argument', () => {
        (command.builder as (yargs: Argv) => Argv)(
          yargsMock as unknown as Argv,
        );
        expect(yargsMock.positional).toHaveBeenCalledWith('path', {
          describe: 'The name of the extension to link.',
          type: 'string',
        });
        expect(yargsMock.option).toHaveBeenCalledWith('consent', {
          describe:
            'Acknowledge the security risks of installing an extension and skip the confirmation prompt.',
          type: 'boolean',
          default: false,
        });
        expect(yargsMock.check).toHaveBeenCalled();
      });
    });

    it('handler should call handleLink', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      interface TestArgv {
        path: string;
        [key: string]: unknown;
      }
      const argv: TestArgv = {
        path: '/local/path/to/extension',
        _: [],
        $0: '',
      };
      await (command.handler as unknown as (args: TestArgv) => Promise<void>)(
        argv,
      );

      expect(
        mockExtensionManager.prototype.installOrUpdateExtension,
      ).toHaveBeenCalledWith({
        source: '/local/path/to/extension',
        type: 'link',
      });
      mockCwd.mockRestore();
    });
  });
});
