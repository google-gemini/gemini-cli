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
import { type Config, DetectedIde } from '@google/gemini-cli-core';
import * as core from '@google/gemini-cli-core';

vi.mock('child_process');
vi.mock('glob');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof core>();
  return {
    ...original,
    getOauthClient: vi.fn(original.getOauthClient),
    getIdeInstaller: vi.fn(original.getIdeInstaller),
  };
});

describe('ideCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let platformSpy: MockInstance;

  beforeEach(() => {
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
      services: {
        settings: {
          setValue: vi.fn(),
        },
      },
    } as unknown as CommandContext;

    mockConfig = {
      getIdeMode: vi.fn(),
      getIdeClient: vi.fn(() => ({
        reconnect: vi.fn(),
        disconnect: vi.fn(),
        getCurrentIde: vi.fn(),
        getDetectedIdeDisplayName: vi.fn(),
        getConnectionStatus: vi.fn(),
      })),
      setIdeModeAndSyncConnection: vi.fn(),
      setIdeMode: vi.fn(),
    } as unknown as Config;

    platformSpy = vi.spyOn(process, 'platform', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if config is not provided', () => {
    const command = ideCommand(null);
    expect(command).toBeNull();
  });

  it('should return the ide command', () => {
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
    vi.mocked(mockConfig.getIdeClient).mockReturnValue({
      getCurrentIde: () => DetectedIde.VSCode,
      getDetectedIdeDisplayName: () => 'VS Code',
      getConnectionStatus: () => ({
        status: core.IDEConnectionStatus.Disconnected,
      }),
    } as ReturnType<Config['getIdeClient']>);
    const command = ideCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('ide');
    expect(command?.subCommands).toHaveLength(3);
    expect(command?.subCommands?.[0].name).toBe('enable');
    expect(command?.subCommands?.[1].name).toBe('status');
    expect(command?.subCommands?.[2].name).toBe('install');
  });

  it('should show disable command when connected', () => {
    vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
    vi.mocked(mockConfig.getIdeClient).mockReturnValue({
      getCurrentIde: () => DetectedIde.VSCode,
      getDetectedIdeDisplayName: () => 'VS Code',
      getConnectionStatus: () => ({
        status: core.IDEConnectionStatus.Connected,
      }),
    } as ReturnType<Config['getIdeClient']>);
    const command = ideCommand(mockConfig);
    expect(command).not.toBeNull();
    const subCommandNames = command?.subCommands?.map((cmd) => cmd.name);
    expect(subCommandNames).toContain('disable');
    expect(subCommandNames).not.toContain('enable');
  });

  describe('status subcommand', () => {
    const mockGetConnectionStatus = vi.fn();
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getConnectionStatus: mockGetConnectionStatus,
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
      } as unknown as ReturnType<Config['getIdeClient']>);
    });

    it('should show connected status', async () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Connected,
      });
      const command = ideCommand(mockConfig);
      const result = await command!.subCommands!.find(
        (c) => c.name === 'status',
      )!.action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '🟢 Connected to VS Code',
      });
    });

    it('should show connecting status', async () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Connecting,
      });
      const command = ideCommand(mockConfig);
      const result = await command!.subCommands!.find(
        (c) => c.name === 'status',
      )!.action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `🟡 Connecting...`,
      });
    });
    it('should show disconnected status', async () => {
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Disconnected,
      });
      const command = ideCommand(mockConfig);
      const result = await command!.subCommands!.find(
        (c) => c.name === 'status',
      )!.action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected`,
      });
    });

    it('should show disconnected status with details', async () => {
      const details = 'Something went wrong';
      mockGetConnectionStatus.mockReturnValue({
        status: core.IDEConnectionStatus.Disconnected,
        details,
      });
      const command = ideCommand(mockConfig);
      const result = await command!.subCommands!.find(
        (c) => c.name === 'status',
      )!.action!(mockContext, '');
      expect(mockGetConnectionStatus).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected: ${details}`,
      });
    });
  });

  describe('install subcommand', () => {
    const mockInstall = vi.fn();
    beforeEach(() => {
      vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Disconnected,
        }),
        getDetectedIdeDisplayName: () => 'VS Code',
      } as unknown as ReturnType<Config['getIdeClient']>);
      vi.mocked(core.getIdeInstaller).mockReturnValue({
        install: mockInstall,
        isInstalled: vi.fn(),
      });
      platformSpy.mockReturnValue('linux');
    });

    it('should install the extension', async () => {
      mockInstall.mockResolvedValue({
        success: true,
        message: 'Successfully installed.',
      });

      const command = ideCommand(mockConfig);
      await command!.subCommands!.find((c) => c.name === 'install')!.action!(
        mockContext,
        '',
      );

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing IDE companion...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'Successfully installed.',
        }),
        expect.any(Number),
      );
    }, 10000);

    it('should show an error if installation fails', async () => {
      mockInstall.mockResolvedValue({
        success: false,
        message: 'Installation failed.',
      });

      const command = ideCommand(mockConfig);
      await command!.subCommands!.find((c) => c.name === 'install')!.action!(
        mockContext,
        '',
      );

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: `Installing IDE companion...`,
        }),
        expect.any(Number),
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text: 'Installation failed.',
        }),
        expect.any(Number),
      );
    });
  });
});
