/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockInstance } from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
        config: null, // Will be set per test
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
        connect: vi.fn(),
        getCurrentIde: vi.fn(),
        getDetectedIdeDisplayName: vi.fn(),
        getConnectionStatus: vi.fn(),
        getOpenFiles: vi.fn(),
      })),
      setIdeModeAndSyncConnection: vi.fn(),
      setIdeMode: vi.fn(),
    } as unknown as Config;

    platformSpy = vi.spyOn(process, 'platform', 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Command Structure', () => {
    it('should have correct command metadata', () => {
      expect(ideCommand.name).toBe('ide');
      expect(ideCommand.description).toBe('Manage IDE integration');
      expect(typeof ideCommand.action).toBe('function');
    });
  });

  describe('Status Action', () => {
    beforeEach(() => {
      mockContext.services.config = mockConfig;
    });

    it('should show connected status', async () => {
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Connected,
        }),
        getOpenFiles: vi.fn().mockResolvedValue([]),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('🟢 Connected to VS Code'),
      });
    });

    it('should show connecting status', async () => {
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Connecting,
        }),
        getOpenFiles: vi.fn().mockResolvedValue([]),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '🟡 Connecting...',
      });
    });

    it('should show disconnected status', async () => {
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Disconnected,
        }),
        getOpenFiles: vi.fn().mockResolvedValue([]),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: '🔴 Disconnected',
      });
    });

    it('should show disconnected status with details', async () => {
      const details = 'Connection failed';
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Disconnected,
          details,
        }),
        getOpenFiles: vi.fn().mockResolvedValue([]),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `🔴 Disconnected: ${details}`,
      });
    });

    it('should handle config not available', async () => {
      mockContext.services.config = null;

      const result = await ideCommand.action!(mockContext, 'status');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      });
    });
  });

  describe('Install Action', () => {
    const mockInstall = vi.fn();

    beforeEach(() => {
      mockContext.services.config = mockConfig;
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Disconnected,
        }),
      } as ReturnType<Config['getIdeClient']>);
      vi.mocked(core.getIdeInstaller).mockReturnValue({
        install: mockInstall,
        isInstalled: vi.fn(),
      });
      platformSpy.mockReturnValue('linux');
    });

    it('should install the extension successfully', async () => {
      mockInstall.mockResolvedValue({
        success: true,
        message: 'Successfully installed.',
      });

      const result = await ideCommand.action!(mockContext, 'install');

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Successfully installed.',
      });
    });

    it('should handle installation failure', async () => {
      mockInstall.mockResolvedValue({
        success: false,
        message: 'Installation failed.',
      });

      const result = await ideCommand.action!(mockContext, 'install');

      expect(core.getIdeInstaller).toHaveBeenCalledWith('vscode');
      expect(mockInstall).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining('Installation failed.'),
      });
    });

    it('should handle no IDE detected', async () => {
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => null,
        getDetectedIdeDisplayName: () => 'Unknown',
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'install');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          'No IDE detected. Please ensure VSCode or JetBrains IDE is running.',
      });
    });
  });

  describe('Connect Action', () => {
    beforeEach(() => {
      mockContext.services.config = mockConfig;
      // Mock getIdeInstaller for connect tests
      vi.mocked(core.getIdeInstaller).mockReturnValue({
        install: vi.fn().mockResolvedValue({
          success: false,
          message: 'Mock install failed',
        }),
        isInstalled: vi.fn(),
      });
    });

    it('should connect to IDE successfully', async () => {
      const mockConnect = vi.fn().mockResolvedValue(undefined);
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        connect: mockConnect,
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Connected,
        }),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'connect');

      expect(mockConnect).toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: '🟢 Connected to VS Code',
      });
    });

    it('should handle connection failure', async () => {
      const mockConnect = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'));
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        connect: mockConnect,
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, 'connect');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to connect: Connection failed',
      });
    });
  });

  describe('Default Action (Status)', () => {
    it('should show status when no action specified', async () => {
      mockContext.services.config = mockConfig;
      vi.mocked(mockConfig.getIdeClient).mockReturnValue({
        getCurrentIde: () => DetectedIde.VSCode,
        getDetectedIdeDisplayName: () => 'VS Code',
        getConnectionStatus: () => ({
          status: core.IDEConnectionStatus.Connected,
        }),
        getOpenFiles: vi.fn().mockResolvedValue([]),
      } as ReturnType<Config['getIdeClient']>);

      const result = await ideCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: expect.stringContaining('🟢 Connected to VS Code'),
      });
    });
  });
});
