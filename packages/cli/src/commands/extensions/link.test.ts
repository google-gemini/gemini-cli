/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  coreEvents,
  getErrorMessage,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import { type Argv } from 'yargs';
import { handleLink, linkCommand } from './link.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { loadSettings, type LoadedSettings } from '../../config/settings.js';
import { maybeRequestConsentOrFail } from '../../config/extensions/consent.js';

const mockReadline = vi.hoisted(() => ({
  createInterface: vi.fn(),
}));

vi.mock('node:readline', () => ({
  default: mockReadline,
  createInterface: mockReadline.createInterface,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn((p: fs.PathLike) => path.resolve(String(p))),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const { mockCoreDebugLogger } = await import(
    '../../test-utils/mockDebugLogger.js'
  );
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mocked = mockCoreDebugLogger(actual, { stripAnsi: true });
  return { ...mocked, getErrorMessage: vi.fn() };
});

vi.mock('../../config/extension-manager.js');
vi.mock('../../config/settings.js');
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
  const mockRealpathSync = vi.mocked(fs.realpathSync);

  const originalStdinIsTTY = process.stdin.isTTY;
  const originalStdoutIsTTY = process.stdout.isTTY;
  let questionMock: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    questionMock = vi.fn().mockImplementation((_prompt, callback) => {
      callback('y');
    });
    mockReadline.createInterface.mockReturnValue({
      question: questionMock,
      close: vi.fn(),
    });
    mockRealpathSync.mockImplementation((p: fs.PathLike) =>
      path.resolve(String(p)),
    );
    mockGetErrorMessage.mockImplementation((err: unknown) =>
      err instanceof Error ? err.message : String(err),
    );
    mockLoadSettings.mockReturnValue({
      merged: {},
    } as unknown as LoadedSettings);
    mockExtensionManager.prototype.loadExtensions = vi
      .fn()
      .mockResolvedValue(undefined);
    mockExtensionManager.prototype.installOrUpdateExtension = vi
      .fn()
      .mockImplementation(async (installMetadata: ExtensionInstallMetadata) => {
        const lastCall =
          mockExtensionManager.mock.calls[
            mockExtensionManager.mock.calls.length - 1
          ]?.[0];
        if (lastCall?.requestConsent) {
          await maybeRequestConsentOrFail(
            { name: 'my-linked-extension', version: '1.0.0' },
            lastCall.requestConsent,
            false,
            undefined,
            false,
            [],
            [],
            false,
            installMetadata.type === 'link'
              ? installMetadata.source
              : undefined,
          );
        }
        return { name: 'my-linked-extension' };
      });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('handleLink', () => {
    it('should link an extension from a local path, display canonical path and live-symlink warning, and succeed when user confirms with y', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/test/dir');
      await handleLink({ path: '/local/path/to/extension' });

      expect(mockRealpathSync).toHaveBeenCalledWith('/local/path/to/extension');
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(
          'Linking extension "my-linked-extension" from canonical path "/local/path/to/extension".',
        ),
      );
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(
          'Linking creates a live symbolic link to "/local/path/to/extension".',
        ),
      );
      expect(questionMock).toHaveBeenCalledWith(
        'Do you want to continue? [y/N]: ',
        expect.any(Function),
      );
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
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'log',
        'Extension "my-linked-extension" linked successfully and enabled.',
      );
      mockCwd.mockRestore();
    });

    it('should resolve symlinks and relative segments via realpathSync and disclose the canonical path in the warning', async () => {
      const mockCwd = vi.spyOn(process, 'cwd').mockReturnValue('/workspace');
      mockRealpathSync.mockReturnValue('/tmp/malicious_ext');

      await handleLink({ path: './symlink_to_malicious' });

      expect(mockRealpathSync).toHaveBeenCalledWith(
        path.resolve('/workspace', './symlink_to_malicious'),
      );
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(
          'Linking extension "my-linked-extension" from canonical path "/tmp/malicious_ext".',
        ),
      );
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'log',
        expect.stringContaining(
          'Linking creates a live symbolic link to "/tmp/malicious_ext".',
        ),
      );
      expect(
        mockExtensionManager.prototype.installOrUpdateExtension,
      ).toHaveBeenCalledWith({
        source: '/tmp/malicious_ext',
        type: 'link',
      });
      mockCwd.mockRestore();
    });

    it('should default to No ([y/N]) and abort when pressing Enter (empty input) at the confirmation prompt', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      questionMock.mockImplementation((_prompt, callback) => {
        callback('');
      });

      await handleLink({ path: '/local/path/to/extension' });

      expect(questionMock).toHaveBeenCalledWith(
        'Do you want to continue? [y/N]: ',
        expect.any(Function),
      );
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Installation cancelled for "my-linked-extension".',
      );
      expect(coreEvents.emitConsoleLog).not.toHaveBeenCalledWith(
        'log',
        'Extension "my-linked-extension" linked successfully and enabled.',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should fail closed and exit with code 1 when running in a non-TTY environment without --consent', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        configurable: true,
      });

      await handleLink({ path: '/local/path/to/extension' });

      expect(questionMock).not.toHaveBeenCalled();
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Installation cancelled for "my-linked-extension".',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
    });

    it('should reject empty or whitespace-only extension paths before resolving', async () => {
      const mockProcessExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as (
          code?: string | number | null | undefined,
        ) => never);

      await handleLink({ path: '   ' });

      expect(mockRealpathSync).not.toHaveBeenCalled();
      expect(mockExtensionManager).not.toHaveBeenCalled();
      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
        'error',
        'Extension path cannot be empty.',
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      mockProcessExit.mockRestore();
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

      expect(coreEvents.emitConsoleLog).toHaveBeenCalledWith(
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
