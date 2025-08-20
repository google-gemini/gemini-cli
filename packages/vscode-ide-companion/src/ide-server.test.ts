/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { IDEServer } from './ide-server.js';

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diffManager: { onDidChange: vi.fn(() => ({ dispose: vi.fn() })) } as any,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    tmpdir: vi.fn(() => '/tmp'),
  };
});

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/test/workspace1',
        },
      },
      {
        uri: {
          fsPath: '/test/workspace2',
        },
      },
    ],
  },
}));

vi.mock('./open-files-manager', () => {
  const OpenFilesManager = vi.fn();
  OpenFilesManager.prototype.onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
  return { OpenFilesManager };
});

describe('IDEServer', () => {
  let ideServer: IDEServer;
  let mockContext: vscode.ExtensionContext;
  let mockLog: (message: string) => void;

  beforeEach(() => {
    mockLog = vi.fn();
    ideServer = new IDEServer(mockLog, mocks.diffManager);
    mockContext = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
        clear: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(async () => {
    await ideServer.stop();
    vi.restoreAllMocks();
  });

  it('should set environment variables and workspace path on start', async () => {
    await ideServer.start(mockContext);

    const replaceMock = mockContext.environmentVariableCollection.replace;
    expect(replaceMock).toHaveBeenCalledTimes(2);

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_SERVER_PORT',
      expect.stringMatching(/^\d+$/), // port is a number as a string
    );

    const expectedWorkspacePaths = [
      '/test/workspace1',
      '/test/workspace2',
    ].join(path.delimiter);

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      expectedWorkspacePaths,
    );

    const port = vi
      .mocked(replaceMock)
      .mock.calls.find((call) => call[0] === 'GEMINI_CLI_IDE_SERVER_PORT')?.[1];

    const expectedPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePaths: expectedWorkspacePaths,
      }),
    );
  });
});
