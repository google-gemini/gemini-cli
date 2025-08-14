/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import * as detectIde from '../ide/detect-ide.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock dependencies
vi.mock('node:fs');
vi.mock('../ide/detect-ide.js');

type IdeClientTestApi = {
  instance: IdeClient | undefined;
  establishConnection: (port: string) => Promise<void>;
  setState: (
    status: IDEConnectionStatus,
    details?: string,
    logToConsole?: boolean,
  ) => void;
};

describe('IdeClient', () => {
  let originalProcess: NodeJS.Process;

  beforeEach(() => {
    // Mock process.cwd and process.env
    originalProcess = process;
    vi.stubGlobal('process', {
      ...originalProcess,
      cwd: vi.fn(),
      env: { ...originalProcess.env },
    });

    // Mock detectIde to simulate being in VSCode
    vi.mocked(detectIde.detectIde).mockReturnValue(
      detectIde.DetectedIde.VSCode,
    );
    vi.mocked(detectIde.getIdeInfo).mockReturnValue({
      displayName: 'VSCode',
    });

    // Mock fs.realpathSync to return the path itself
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

    // Reset singleton instance before each test
    (IdeClient as unknown as IdeClientTestApi).instance = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    (IdeClient as unknown as IdeClientTestApi).instance = undefined;
  });

  describe('connect', () => {
    it('should set state to Disconnected if GEMINI_CLI_IDE_WORKSPACE_PATH is not set', async () => {
      const ideClient = IdeClient.getInstance();
      delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
      await ideClient.connect();
      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Disconnected);
      expect(state.details).toContain(
        'Failed to connect to IDE companion extension',
      );
    });

    it('should set state to Disconnected if GEMINI_CLI_IDE_WORKSPACE_PATH is empty', async () => {
      const ideClient = IdeClient.getInstance();
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '';
      await ideClient.connect();
      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Disconnected);
      expect(state.details).toContain('please open a folder or workspace');
    });

    it('should set state to Connected if cwd is within a single workspace root', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoot = '/path/to/workspace';
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoot;
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue('/path/to/workspace/project');
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });

    it('should set state to Connected if cwd is the same as the single workspace root', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoot = '/path/to/workspace';
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoot;
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue(workspaceRoot);
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });

    it('should set state to Disconnected if cwd is outside a single workspace root', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoot = '/path/to/workspace';
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoot;
      vi.mocked(process.cwd).mockReturnValue('/path/to/another/project');
      await ideClient.connect();
      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Disconnected);
      expect(state.details).toContain('Directory mismatch');
    });

    it('should set state to Connected if cwd is within one of multiple workspace roots', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoots = ['/path/to/workspace1', '/path/to/workspace2'];
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoots.join(
        path.delimiter,
      );
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue('/path/to/workspace2/project');
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });

    it('should set state to Connected if cwd is the same as one of multiple workspace roots', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoots = ['/path/to/workspace1', '/path/to/workspace2'];
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoots.join(
        path.delimiter,
      );
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue('/path/to/workspace1');
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });

    it('should set state to Disconnected if cwd is outside all multiple workspace roots', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoots = ['/path/to/workspace1', '/path/to/workspace2'];
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoots.join(
        path.delimiter,
      );
      vi.mocked(process.cwd).mockReturnValue('/path/to/another/project');
      await ideClient.connect();
      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Disconnected);
      expect(state.details).toContain('Directory mismatch');
    });

    it('should be case-insensitive when comparing paths', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoot = '/Path/To/Workspace';
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoot;
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue('/path/to/workspace/project');
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });

    it('should handle non-existent paths gracefully by falling back to original path', async () => {
      const ideClient = IdeClient.getInstance();
      const workspaceRoot = '/path/to/non-existent';
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = workspaceRoot;
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';
      vi.mocked(process.cwd).mockReturnValue('/path/to/non-existent/project');
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        if (p.toString().includes('non-existent')) {
          throw new Error('ENOENT');
        }
        return p.toString();
      });
      const establishConnectionSpy = vi
        .spyOn(ideClient as unknown as IdeClientTestApi, 'establishConnection')
        .mockImplementation(async () => {
          (ideClient as unknown as IdeClientTestApi).setState(
            IDEConnectionStatus.Connected,
          );
        });

      await ideClient.connect();

      const state = ideClient.getConnectionStatus();
      expect(state.status).toBe(IDEConnectionStatus.Connected);
      expect(establishConnectionSpy).toHaveBeenCalled();
    });
  });
});
