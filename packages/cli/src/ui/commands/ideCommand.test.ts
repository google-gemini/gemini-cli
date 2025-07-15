/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ideCommand } from './ideCommand.js';
import { type CommandContext } from './types.js';
import { type Config } from '@google/gemini-cli-core';
import * as child_process from 'child_process';
import { glob } from 'glob';

vi.mock('child_process');
vi.mock('glob');

describe('ideCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let execSyncSpy: vi.SpyInstance;
  let globSyncSpy: vi.SpyInstance;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;

    mockConfig = {
      getIdeMode: vi.fn(),
    } as unknown as Config;

    execSyncSpy = vi.spyOn(child_process, 'execSync');
    globSyncSpy = vi.spyOn(glob, 'sync');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if ideMode is not enabled', () => {
    (mockConfig.getIdeMode as vi.Mock).mockReturnValue(false);
    const command = ideCommand(mockConfig);
    expect(command).toBeNull();
  });

  it('should return the ide command if ideMode is enabled', () => {
    (mockConfig.getIdeMode as vi.Mock).mockReturnValue(true);
    const command = ideCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('ide');
    expect(command?.subCommands).toHaveLength(1);
    expect(command?.subCommands?.[0].name).toBe('install');
  });

  describe('install subcommand', () => {
    beforeEach(() => {
      (mockConfig.getIdeMode as vi.Mock).mockReturnValue(true);
    });

    it('should show an error if VSCode is not installed', async () => {
      execSyncSpy.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const command = ideCommand(mockConfig);
      await command?.subCommands?.[0].action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: expect.stringContaining(
            'VSCode command-line tool "code" not found',
          ),
        }),
        expect.any(Number),
      );
    });

    it('should show an error if the VSIX file is not found', async () => {
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      globSyncSpy.mockReturnValue([]); // No .vsix file found

      const command = ideCommand(mockConfig);
      await command?.subCommands?.[0].action(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: 'Could not find the VSCode extension file (.vsix).',
        }),
        expect.any(Number),
      );
    });

    it('should install the extension if found in the bundle directory', async () => {
      const vsixPath = '/path/to/bundle/gemini.vsix';
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      globSyncSpy.mockReturnValue([vsixPath]); // Found .vsix file

      const command = ideCommand(mockConfig);
      await command?.subCommands?.[0].action(mockContext, '');

      expect(globSyncSpy).toHaveBeenCalledWith(expect.stringContaining('.vsix'));
      expect(execSyncSpy).toHaveBeenCalledWith(
        `code --install-extension ${vsixPath} --force`,
        { stdio: 'pipe' },
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing VSCode extension from ${vsixPath}...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'VSCode extension installed successfully.',
        }),
        expect.any(Number),
      );
    });

    it('should install the extension if found in the dev directory', async () => {
      const vsixPath = '/path/to/dev/gemini.vsix';
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      // First glob call for bundle returns nothing, second for dev returns path.
      globSyncSpy
        .mockReturnValueOnce([])
        .mockReturnValueOnce([vsixPath]);

      const command = ideCommand(mockConfig);
      await command?.subCommands?.[0].action(mockContext, '');

      expect(globSyncSpy).toHaveBeenCalledTimes(2);
      expect(execSyncSpy).toHaveBeenCalledWith(
        `code --install-extension ${vsixPath} --force`,
        { stdio: 'pipe' },
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'VSCode extension installed successfully.',
        }),
        expect.any(Number),
      );
    });

    it('should show an error if installation fails', async () => {
      const vsixPath = '/path/to/bundle/gemini.vsix';
      const errorMessage = 'Installation failed';
      execSyncSpy
        .mockReturnValueOnce('') // VSCode is installed check
        .mockImplementation(() => { // Installation command
          const error = new Error('Command failed') as any;
          error.stderr = Buffer.from(errorMessage);
          throw error;
        });
      globSyncSpy.mockReturnValue([vsixPath]);

      const command = ideCommand(mockConfig);
      await command?.subCommands?.[0].action(mockContext, '');

      const expectedCommand = `code --install-extension ${vsixPath} --force`;
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: `Failed to install VSCode extension. Command failed: ${expectedCommand}\nError: ${errorMessage}`,
        }),
        expect.any(Number),
      );
    });
  });
});
