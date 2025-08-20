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
import { DiffManager } from './diff-manager.js';

const mocks = vi.hoisted(() => ({
  diffManager: {
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DiffManager,
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  unlink: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    tmpdir: vi.fn(() => '/tmp'),
  };
});

const vscodeMock = vi.hoisted(() => ({
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

vi.mock('vscode', () => vscodeMock);

vi.mock('./open-files-manager', () => {
  const OpenFilesManager = vi.fn();
  OpenFilesManager.prototype.onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
  return { OpenFilesManager };
});

describe('IDEServer', () => {
  let ideServer: IDEServer;
  let mockContext: vscode.ExtensionContext;
  let mockLog: (message: string) => void;

  const getPortFromMock = (
    replaceMock: ReturnType<
      () => vscode.ExtensionContext['environmentVariableCollection']['replace']
    >,
  ) => {
    const port = vi
      .mocked(replaceMock)
      .mock.calls.find((call) => call[0] === 'GEMINI_CLI_IDE_SERVER_PORT')?.[1];

    if (port === undefined) {
      expect.fail('Port was not set');
    }
    return port;
  };

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
    vscodeMock.workspace.workspaceFolders = [
      { uri: { fsPath: '/test/workspace1' } },
      { uri: { fsPath: '/test/workspace2' } },
    ];
  });

  it('should set environment variables and workspace path on start with multiple folders', async () => {
    await ideServer.start(mockContext);

    const replaceMock = mockContext.environmentVariableCollection.replace;
    expect(replaceMock).toHaveBeenCalledTimes(2);

    expect(replaceMock).toHaveBeenNthCalledWith(
      1,
      'GEMINI_CLI_IDE_SERVER_PORT',
      expect.any(String), // port is a number as a string
    );

    const expectedWorkspacePaths = [
      '/test/workspace1',
      '/test/workspace2',
    ].join(path.delimiter);

    expect(replaceMock).toHaveBeenNthCalledWith(
      2,
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      expectedWorkspacePaths,
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: expectedWorkspacePaths,
      }),
    );
  });

  it('should set a single folder path', async () => {
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/foo/bar' } }];

    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar',
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: '/foo/bar',
      }),
    );
  });

  it('should set an empty string if no folders are open', async () => {
    vscodeMock.workspace.workspaceFolders = [];

    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '',
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: '',
      }),
    );
  });

  it('should update the path when workspace folders change', async () => {
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/foo/bar' } }];
    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar',
    );

    // Simulate adding a folder
    vscodeMock.workspace.workspaceFolders = [
      { uri: { fsPath: '/foo/bar' } },
      { uri: { fsPath: '/baz/qux' } },
    ];
    await ideServer.updateWorkspacePath();

    const expectedWorkspacePaths = ['/foo/bar', '/baz/qux'].join(
      path.delimiter,
    );
    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      expectedWorkspacePaths,
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: expectedWorkspacePaths,
      }),
    );

    // Simulate removing a folder
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/baz/qux' } }];
    await ideServer.updateWorkspacePath();

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/baz/qux',
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: '/baz/qux',
      }),
    );
  });

  it('should clear env vars and delete port file on stop', async () => {
    await ideServer.start(mockContext);
    const portFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(portFile, expect.any(String));

    await ideServer.stop();

    expect(mockContext.environmentVariableCollection.clear).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith(portFile);
  });

  it.skipIf(process.platform !== 'win32')(
    'should handle windows paths',
    async () => {
      vscodeMock.workspace.workspaceFolders = [
        { uri: { fsPath: 'c:\\foo\\bar' } },
        { uri: { fsPath: 'd:\\baz\\qux' } },
      ];

      await ideServer.start(mockContext);
      const replaceMock = mockContext.environmentVariableCollection.replace;
      const expectedWorkspacePaths = 'c:\\foo\\bar;d:\\baz\\qux';

      expect(replaceMock).toHaveBeenCalledWith(
        'GEMINI_CLI_IDE_WORKSPACE_PATH',
        expectedWorkspacePaths,
      );

      const port = getPortFromMock(replaceMock);
      const expectedPortFile = path.join(
        '/tmp',
        `gemini-ide-server-${process.ppid}.json`,
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPortFile,
        JSON.stringify({
          port: parseInt(port, 10),
          workspacePath: expectedWorkspacePaths,
        }),
      );
    },
  );
});
