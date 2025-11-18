/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleLink, linkCommand } from './link.js';
import * as extensionModule from '../../config/extension.js';
import * as errorsModule from '../../utils/errors.js';

vi.mock('../../config/extension.js');
vi.mock('../../utils/errors.js');

describe('extensions link command', () => {
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

    vi.mocked(extensionModule.installExtension).mockResolvedValue(
      'test-extension',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleLink', () => {
    it('should link extension from path', async () => {
      await handleLink({ path: '/path/to/extension' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        {
          source: '/path/to/extension',
          type: 'link',
        },
        extensionModule.requestConsentNonInteractive,
      );
    });

    it('should display success message', async () => {
      vi.mocked(extensionModule.installExtension).mockResolvedValue(
        'my-extension',
      );

      await handleLink({ path: '/path/to/ext' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "my-extension" linked successfully and enabled.',
      );
    });

    it('should use returned extension name in message', async () => {
      vi.mocked(extensionModule.installExtension).mockResolvedValue(
        'custom-name',
      );

      await handleLink({ path: '/some/path' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "custom-name" linked successfully and enabled.',
      );
    });

    it('should pass install metadata with source and type', async () => {
      await handleLink({ path: '/extension/path' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/extension/path',
          type: 'link',
        }),
        expect.any(Function),
      );
    });

    it('should pass requestConsentNonInteractive as consent handler', async () => {
      await handleLink({ path: '/path' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.any(Object),
        extensionModule.requestConsentNonInteractive,
      );
    });

    it('should handle errors from installExtension', async () => {
      const error = new Error('Install failed');
      vi.mocked(extensionModule.installExtension).mockRejectedValue(error);
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Install failed');

      await handleLink({ path: '/path' });

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Install failed');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on error', async () => {
      vi.mocked(extensionModule.installExtension).mockRejectedValue(
        new Error('Error'),
      );
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Error message');

      await handleLink({ path: '/path' });

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit on success', async () => {
      await handleLink({ path: '/path' });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle relative paths', async () => {
      await handleLink({ path: './relative/path' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: './relative/path',
        }),
        expect.any(Function),
      );
    });

    it('should handle absolute paths', async () => {
      await handleLink({ path: '/absolute/path/to/extension' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/absolute/path/to/extension',
        }),
        expect.any(Function),
      );
    });

    it('should handle paths with spaces', async () => {
      await handleLink({ path: '/path with spaces/extension' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/path with spaces/extension',
        }),
        expect.any(Function),
      );
    });

    it('should handle Windows-style paths', async () => {
      await handleLink({ path: 'C:\\Users\\User\\extension' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'C:\\Users\\User\\extension',
        }),
        expect.any(Function),
      );
    });

    it('should use getErrorMessage for error formatting', async () => {
      const error = new Error('Custom error');
      vi.mocked(extensionModule.installExtension).mockRejectedValue(error);
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Formatted error',
      );

      await handleLink({ path: '/path' });

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Formatted error');
    });
  });

  describe('linkCommand', () => {
    it('should have correct command name', () => {
      expect(linkCommand.command).toBe('link <path>');
    });

    it('should require path parameter', () => {
      expect(linkCommand.command).toContain('<path>');
    });

    it('should have description', () => {
      expect(linkCommand.describe).toBe(
        'Links an extension from a local path. Updates made to the local path will always be reflected.',
      );
    });

    it('should mention local path in description', () => {
      expect(linkCommand.describe).toContain('local path');
    });

    it('should mention updates are reflected in description', () => {
      expect(linkCommand.describe).toContain('reflected');
    });

    it('should have builder function', () => {
      expect(linkCommand.builder).toBeDefined();
      expect(typeof linkCommand.builder).toBe('function');
    });

    it('should have handler function', () => {
      expect(linkCommand.handler).toBeDefined();
      expect(typeof linkCommand.handler).toBe('function');
    });

    it('should configure path as positional argument', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      linkCommand.builder(mockYargs as never);

      expect(mockYargs.positional).toHaveBeenCalledWith(
        'path',
        expect.objectContaining({
          describe: expect.any(String),
          type: 'string',
        }),
      );
    });

    it('should set path type to string', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      linkCommand.builder(mockYargs as never);

      expect(mockYargs.positional).toHaveBeenCalledWith(
        'path',
        expect.objectContaining({
          type: 'string',
        }),
      );
    });

    it('should have check function that always returns true', () => {
      const mockYargs = {
        positional: vi.fn().mockReturnThis(),
        check: vi.fn().mockReturnThis(),
      };

      linkCommand.builder(mockYargs as never);

      const checkFn = mockYargs.check.mock.calls[0][0];
      expect(checkFn({})).toBe(true);
    });

    it('should call handleLink when handler is invoked', async () => {
      vi.mocked(extensionModule.installExtension).mockResolvedValue('test-ext');

      await linkCommand.handler({ path: '/test/path' } as never);

      expect(extensionModule.installExtension).toHaveBeenCalled();
    });

    it('should pass path to handleLink', async () => {
      await linkCommand.handler({ path: '/custom/path' } as never);

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/custom/path',
        }),
        expect.any(Function),
      );
    });

    it('should be async handler', () => {
      const result = linkCommand.handler({ path: '/path' } as never);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should extract path from argv', async () => {
      const argv = {
        path: '/extracted/path',
        _: [],
        $0: 'gemini',
      };

      await linkCommand.handler(argv as never);

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/extracted/path',
        }),
        expect.any(Function),
      );
    });
  });

  describe('InstallArgs interface', () => {
    it('should accept path property', async () => {
      const args: { path: string } = { path: '/test/path' };

      await handleLink(args);

      expect(extensionModule.installExtension).toHaveBeenCalled();
    });
  });

  describe('install metadata', () => {
    it('should create metadata with type "link"', async () => {
      await handleLink({ path: '/path' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'link',
        }),
        expect.any(Function),
      );
    });

    it('should use path as source in metadata', async () => {
      await handleLink({ path: '/source/path' });

      expect(extensionModule.installExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          source: '/source/path',
        }),
        expect.any(Function),
      );
    });

    it('should only include source and type in metadata', async () => {
      await handleLink({ path: '/path' });

      const metadata = vi.mocked(extensionModule.installExtension).mock
        .calls[0][0];

      expect(Object.keys(metadata)).toEqual(['source', 'type']);
    });
  });

  describe('integration scenarios', () => {
    it('should complete full link flow successfully', async () => {
      vi.mocked(extensionModule.installExtension).mockResolvedValue(
        'my-extension',
      );

      await handleLink({ path: '/home/user/extensions/my-ext' });

      expect(extensionModule.installExtension).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension "my-extension" linked successfully and enabled.',
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle link failure gracefully', async () => {
      vi.mocked(extensionModule.installExtension).mockRejectedValue(
        new Error('Path does not exist'),
      );
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Path does not exist',
      );

      await handleLink({ path: '/nonexistent/path' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Path does not exist');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle different extension names', async () => {
      const names = ['ext1', 'ext2', 'my-custom-extension'];

      for (const name of names) {
        vi.mocked(extensionModule.installExtension).mockResolvedValue(name);

        await handleLink({ path: `/path/to/${name}` });

        expect(consoleLogSpy).toHaveBeenCalledWith(
          `Extension "${name}" linked successfully and enabled.`,
        );
      }
    });
  });

  describe('error messages', () => {
    it('should display formatted error message', async () => {
      vi.mocked(extensionModule.installExtension).mockRejectedValue(
        new Error('Original error'),
      );
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Formatted error message',
      );

      await handleLink({ path: '/path' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Formatted error message');
    });

    it('should not display success message on error', async () => {
      vi.mocked(extensionModule.installExtension).mockRejectedValue(
        new Error('Error'),
      );
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Error');

      await handleLink({ path: '/path' });

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
