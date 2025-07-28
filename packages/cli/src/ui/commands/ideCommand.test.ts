/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MockInstance,
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import { ideCommand } from './ideCommand.js';
import { type CommandContext } from './types.js';
import { type Config } from '@google/gemini-cli-core';
import * as child_process from 'child_process';
import { glob } from 'glob';

import { IDEConnectionStatus } from '@google/gemini-cli-core/index.js';

vi.mock('child_process');
vi.mock('glob');

function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('ideCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let execSyncSpy: MockInstance;
  let globSyncSpy: MockInstance;
  let platformSpy: MockInstance;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;

    mockConfig = {
      getIdeMode: vi.fn(),
      getIdeClient: vi.fn(),
    } as unknown as Config;

    execSyncSpy = vi.spyOn(child_process, 'execSync');
    globSyncSpy = vi.spyOn(glob, 'sync');
    platformSpy = vi.spyOn(process, 'platform', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if ideMode is not enabled', () => {
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(false);
    const command = ideCommand(mockConfig);
    expect(command).toBeNull();
  });

  it('should return the ide command if ideMode is enabled', () => {
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
    const command = ideCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('ide');
    expect(command?.subCommands).toHaveLength(2);
    expect(command?.subCommands?.[0].name).toBe('status');
    expect(command?.subCommands?.[1].name).toBe('install');
  });

  describe('status subcommand', () => {
    const mockGetConnectionStatus = vi.fn();
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getConnectionStatus: mockGetConnectionStatus,
      } as ReturnType<Config['getIdeClient']>);
    });

    it('should show connected status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: IDEConnectionStatus.Connected,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands![0].action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '🟢 Connected',
      });
    });

    it('should show connecting status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: IDEConnectionStatus.Connecting,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands![0].action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `🟡 Connecting...`,
      });
    });
    it('should show disconnected status', () => {
      mockGetConnectionStatus.mockReturnValue({
        status: IDEConnectionStatus.Disconnected,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands![0].action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected`,
      });
    });

    it('should show disconnected status with details', () => {
      const details = 'Something went wrong';
      mockGetConnectionStatus.mockReturnValue({
        status: IDEConnectionStatus.Disconnected,
        details,
      });
      const command = ideCommand(mockConfig);
      const result = command!.subCommands![0].action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected: ${details}`,
      });
    });
  });

  describe('install subcommand', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
      platformSpy.mockReturnValue('linux');
    });

    it('should show an error if VSCode is not installed', async () => {
      execSyncSpy.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const command = ideCommand(mockConfig);

      await command!.subCommands![1].action!(mockContext, '');
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: expect.stringMatching(/VS Code command-line tool .* not found/),
        }),
        expect.any(Number),
      );
    });

    it('should show an error if the VSIX file is not found', async () => {
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      globSyncSpy.mockReturnValue([]); // No .vsix file found

      const command = ideCommand(mockConfig);
      await command!.subCommands![1].action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: 'Could not find the required VS Code companion extension. Please file a bug via /bug.',
        }),
        expect.any(Number),
      );
    });

    it('should install the extension if found in the bundle directory', async () => {
      const vsixPath = '/path/to/bundle/gemini.vsix';
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      globSyncSpy.mockReturnValue([vsixPath]); // Found .vsix file

      const command = ideCommand(mockConfig);
      await command!.subCommands![1].action!(mockContext, '');

      expect(globSyncSpy).toHaveBeenCalledWith(
        expect.stringContaining('.vsix'),
      );
      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `code(.cmd)? --install-extension ${regexEscape(vsixPath)} --force`,
          ),
        ),
        { stdio: 'pipe' },
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing VS Code companion extension...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'VS Code companion extension installed successfully. Restart gemini-cli in a fresh terminal window.',
        }),
        expect.any(Number),
      );
    });

    it('should install the extension if found in the dev directory', async () => {
      const vsixPath = '/path/to/dev/gemini.vsix';
      execSyncSpy.mockReturnValue(''); // VSCode is installed
      // First glob call for bundle returns nothing, second for dev returns path.
      globSyncSpy.mockReturnValueOnce([]).mockReturnValueOnce([vsixPath]);

      const command = ideCommand(mockConfig);
      await command!.subCommands![1].action!(mockContext, '');

      expect(globSyncSpy).toHaveBeenCalledTimes(2);
      expect(execSyncSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `code(.cmd)? --install-extension ${regexEscape(vsixPath)} --force`,
          ),
        ),
        { stdio: 'pipe' },
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'VS Code companion extension installed successfully. Restart gemini-cli in a fresh terminal window.',
        }),
        expect.any(Number),
      );
    });

    it('should show an error if installation fails', async () => {
      const vsixPath = '/path/to/bundle/gemini.vsix';
      const errorMessage = 'Installation failed';
      execSyncSpy
        .mockReturnValueOnce('') // VSCode is installed check
        .mockImplementation(() => {
          // Installation command
          const error: Error & { stderr?: Buffer } = new Error(
            'Command failed',
          );
          error.stderr = Buffer.from(errorMessage);
          throw error;
        });
      globSyncSpy.mockReturnValue([vsixPath]);

      const command = ideCommand(mockConfig);
      await command!.subCommands![1].action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: `Failed to install VS Code companion extension.`,
        }),
        expect.any(Number),
      );
    });
  });
});
