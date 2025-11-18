/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleList, listCommand } from './list.js';
import * as extensionModule from '../../config/extension.js';
import * as errorsModule from '../../utils/errors.js';

vi.mock('../../config/extension.js');
vi.mock('../../utils/errors.js');

describe('extensions list command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let processCwdSpy: ReturnType<typeof vi.spyOn>;

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
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/home/user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleList', () => {
    it('should display message when no extensions installed', async () => {
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([]);

      await handleList();

      expect(consoleLogSpy).toHaveBeenCalledWith('No extensions installed.');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should list single extension', async () => {
      const mockExtension = { name: 'test-ext', path: '/path/to/ext' };
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([
        mockExtension as never,
      ]);
      vi.mocked(extensionModule.toOutputString).mockReturnValue(
        'test-ext at /path/to/ext',
      );

      await handleList();

      expect(extensionModule.loadUserExtensions).toHaveBeenCalled();
      expect(extensionModule.toOutputString).toHaveBeenCalledWith(
        mockExtension,
        '/home/user',
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('test-ext at /path/to/ext');
    });

    it('should list multiple extensions with double newline separator', async () => {
      const mockExtensions = [
        { name: 'ext1' },
        { name: 'ext2' },
        { name: 'ext3' },
      ];
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue(
        mockExtensions as never,
      );
      vi.mocked(extensionModule.toOutputString)
        .mockReturnValueOnce('Extension 1')
        .mockReturnValueOnce('Extension 2')
        .mockReturnValueOnce('Extension 3');

      await handleList();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Extension 1\n\nExtension 2\n\nExtension 3',
      );
    });

    it('should call toOutputString for each extension', async () => {
      const mockExtensions = [{ name: 'ext1' }, { name: 'ext2' }];
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue(
        mockExtensions as never,
      );
      vi.mocked(extensionModule.toOutputString).mockReturnValue('output');

      await handleList();

      expect(extensionModule.toOutputString).toHaveBeenCalledTimes(2);
      expect(extensionModule.toOutputString).toHaveBeenNthCalledWith(
        1,
        mockExtensions[0],
        '/home/user',
      );
      expect(extensionModule.toOutputString).toHaveBeenNthCalledWith(
        2,
        mockExtensions[1],
        '/home/user',
      );
    });

    it('should use current working directory for output', async () => {
      const mockExtension = { name: 'test' };
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([
        mockExtension as never,
      ]);
      vi.mocked(extensionModule.toOutputString).mockReturnValue('output');

      processCwdSpy.mockReturnValue('/custom/path');

      await handleList();

      expect(process.cwd).toHaveBeenCalled();
      expect(extensionModule.toOutputString).toHaveBeenCalledWith(
        mockExtension,
        '/custom/path',
      );
    });

    it('should handle errors from loadUserExtensions', async () => {
      const error = new Error('Failed to load extensions');
      vi.mocked(extensionModule.loadUserExtensions).mockImplementation(() => {
        throw error;
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue(
        'Failed to load extensions',
      );

      await handleList();

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load extensions');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle errors from toOutputString', async () => {
      const mockExtension = { name: 'test' };
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([
        mockExtension as never,
      ]);
      vi.mocked(extensionModule.toOutputString).mockImplementation(() => {
        throw new Error('Output error');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Output error');

      await handleList();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Output error');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on error', async () => {
      vi.mocked(extensionModule.loadUserExtensions).mockImplementation(() => {
        throw new Error('Error');
      });
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Error message');

      await handleList();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit on success', async () => {
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([]);

      await handleList();

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('listCommand', () => {
    it('should have correct command name', () => {
      expect(listCommand.command).toBe('list');
    });

    it('should have description', () => {
      expect(listCommand.describe).toBe('Lists installed extensions.');
    });

    it('should have builder function', () => {
      expect(listCommand.builder).toBeDefined();
      expect(typeof listCommand.builder).toBe('function');
    });

    it('should have handler function', () => {
      expect(listCommand.handler).toBeDefined();
      expect(typeof listCommand.handler).toBe('function');
    });

    it('should return yargs from builder', () => {
      const mockYargs = { option: vi.fn() } as never;
      const result = listCommand.builder(mockYargs);

      expect(result).toBe(mockYargs);
    });

    it('should call handleList when handler is invoked', async () => {
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([]);

      await listCommand.handler({} as never);

      expect(extensionModule.loadUserExtensions).toHaveBeenCalled();
    });

    it('should be async handler', () => {
      const result = listCommand.handler({} as never);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete listing flow', async () => {
      const extensions = [
        { name: 'prettier', version: '1.0.0' },
        { name: 'eslint', version: '2.0.0' },
      ];
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue(
        extensions as never,
      );
      vi.mocked(extensionModule.toOutputString)
        .mockReturnValueOnce('prettier v1.0.0')
        .mockReturnValueOnce('eslint v2.0.0');

      await handleList();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'prettier v1.0.0\n\neslint v2.0.0',
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle empty array gracefully', async () => {
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue([]);

      await handleList();

      expect(consoleLogSpy).toHaveBeenCalledWith('No extensions installed.');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle large number of extensions', async () => {
      const manyExtensions = Array.from({ length: 100 }, (_, i) => ({
        name: `ext-${i}`,
      }));
      vi.mocked(extensionModule.loadUserExtensions).mockReturnValue(
        manyExtensions as never,
      );
      vi.mocked(extensionModule.toOutputString).mockImplementation(
        (ext) => `Extension ${ext.name}`,
      );

      await handleList();

      expect(extensionModule.toOutputString).toHaveBeenCalledTimes(100);
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
  });
});
