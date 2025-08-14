/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('IdeClient', () => {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.cwd = vi.fn().mockReturnValue('/Users/person/gemini-cli');
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
  });

  it('should connect if cwd is within the IDE workspace path', async () => {
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '/Users/person/gemini-cli';
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';

    vi.doMock('./detect-ide.js', () => ({
      detectIde: () => 'vscode',
      getIdeInfo: () => ({ displayName: 'VS Code' }),
      DetectedIde: { VSCODE: 'vscode' },
    }));
    vi.doMock('../utils/paths.js', () => ({
      isSubpath: () => true,
    }));

    const { IdeClient, IDEConnectionStatus } = await import('./ide-client.js');
    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'Failed to connect',
    );
  });

  it('should not connect if GEMINI_CLI_IDE_WORKSPACE_PATH is undefined', async () => {
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

    vi.doMock('./detect-ide.js', () => ({
      detectIde: () => 'vscode',
      getIdeInfo: () => ({ displayName: 'VS Code' }),
      DetectedIde: { VSCODE: 'vscode' },
    }));

    const { IdeClient, IDEConnectionStatus } = await import('./ide-client.js');
    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    const status = ideClient.getConnectionStatus();
    expect(status.status).toBe(IDEConnectionStatus.Disconnected);
    expect(status.details).toContain('Failed to connect');
  });

  it('should not connect if GEMINI_CLI_IDE_WORKSPACE_PATH is empty', async () => {
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '';

    vi.doMock('./detect-ide.js', () => ({
      detectIde: () => 'vscode',
      getIdeInfo: () => ({ displayName: 'VS Code' }),
      DetectedIde: { VSCODE: 'vscode' },
    }));

    const { IdeClient, IDEConnectionStatus } = await import('./ide-client.js');
    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    const status = ideClient.getConnectionStatus();
    expect(status.status).toBe(IDEConnectionStatus.Disconnected);
    expect(status.details).toContain('please open a workspace folder');
  });

  it('should not connect if cwd is not within the IDE workspace path', async () => {
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '/some/other/path';

    vi.doMock('./detect-ide.js', () => ({
      detectIde: () => 'vscode',
      getIdeInfo: () => ({ displayName: 'VS Code' }),
      DetectedIde: { VSCODE: 'vscode' },
    }));
    vi.doMock('../utils/paths.js', () => ({
      isSubpath: () => false,
    }));

    const { IdeClient, IDEConnectionStatus } = await import('./ide-client.js');
    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    const status = ideClient.getConnectionStatus();
    expect(status.status).toBe(IDEConnectionStatus.Disconnected);
    expect(status.details).toContain('Directory mismatch');
  });

  it('should handle multiple workspace paths', async () => {
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] =
      '/some/other/path:/Users/person/gemini-cli';
    process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '12345';

    vi.doMock('./detect-ide.js', () => ({
      detectIde: () => 'vscode',
      getIdeInfo: () => ({ displayName: 'VS Code' }),
      DetectedIde: { VSCODE: 'vscode' },
    }));
    vi.doMock('../utils/paths.js', () => ({
      isSubpath: (parent: string) => parent === '/Users/person/gemini-cli',
    }));

    const { IdeClient, IDEConnectionStatus } = await import('./ide-client.js');
    const ideClient = IdeClient.getInstance();
    await ideClient.connect();

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'Failed to connect',
    );
  });
});
