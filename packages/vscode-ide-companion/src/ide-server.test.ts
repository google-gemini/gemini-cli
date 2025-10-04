/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import type * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { IDEServer } from './ide-server.js';
import type { DiffManager } from './diff-manager.js';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-auth-token'),
}));

const mocks = vi.hoisted(() => ({
  diffManager: {
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DiffManager,
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  unlink: vi.fn(() => Promise.resolve(undefined)),
  chmod: vi.fn(() => Promise.resolve(undefined)),
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
    isTrusted: true,
  },
}));

vi.mock('vscode', () => vscodeMock);

vi.mock('./open-files-manager', () => {
  const OpenFilesManager = vi.fn();
  OpenFilesManager.prototype.onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
  return { OpenFilesManager };
});

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
      `gemini-ide-server-${port}.json`,
    );
    const expectedPpidPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: expectedWorkspacePaths,
      ppid: process.ppid,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPpidPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
    expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);
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
      `gemini-ide-server-${port}.json`,
    );
    const expectedPpidPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: '/foo/bar',
      ppid: process.ppid,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPpidPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
    expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);
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
      `gemini-ide-server-${port}.json`,
    );
    const expectedPpidPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: '',
      ppid: process.ppid,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPpidPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
    expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);
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
    await ideServer.syncEnvVars();

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
      `gemini-ide-server-${port}.json`,
    );
    const expectedPpidPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: expectedWorkspacePaths,
      ppid: process.ppid,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPpidPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
    expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);

    // Simulate removing a folder
    vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/baz/qux' } }];
    await ideServer.syncEnvVars();

    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/baz/qux',
    );
    const expectedContent2 = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: '/baz/qux',
      ppid: process.ppid,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent2,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPpidPortFile,
      expectedContent2,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
    expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);
  });

  it('should clear env vars and delete port file on stop', async () => {
    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;
    const port = getPortFromMock(replaceMock);
    const portFile = path.join('/tmp', `gemini-ide-server-${port}.json`);
    const ppidPortFile = path.join(
      '/tmp',
      `gemini-ide-server-${process.ppid}.json`,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(portFile, expect.any(String));
    expect(fs.writeFile).toHaveBeenCalledWith(ppidPortFile, expect.any(String));

    await ideServer.stop();

    expect(mockContext.environmentVariableCollection.clear).toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith(portFile);
    expect(fs.unlink).toHaveBeenCalledWith(ppidPortFile);
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
        `gemini-ide-server-${port}.json`,
      );
      const expectedPpidPortFile = path.join(
        '/tmp',
        `gemini-ide-server-${process.ppid}.json`,
      );
      const expectedContent = JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: expectedWorkspacePaths,
        ppid: process.ppid,
        authToken: 'test-auth-token',
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPortFile,
        expectedContent,
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPpidPortFile,
        expectedContent,
      );
      expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
      expect(fs.chmod).toHaveBeenCalledWith(expectedPpidPortFile, 0o600);
    },
  );

  describe('auth token', () => {
    let port: number;

    beforeEach(async () => {
      await ideServer.start(mockContext);
      port = (ideServer as unknown as { port: number }).port;
    });

    it('should reject request without auth token', async () => {
      const response = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {},
          id: 1,
        }),
      });
      expect(response.status).toBe(401);
    });

    it('should allow request with valid auth token', async () => {
      const response = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer test-auth-token`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {},
          id: 1,
        }),
      });
      expect(response.status).not.toBe(401);
    });

    it('should reject request with invalid auth token', async () => {
      const response = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {},
          id: 1,
        }),
      });
      expect(response.status).toBe(401);
      const body = await response.text();
      expect(body).toBe('Unauthorized');
    });

    it('should reject request with malformed auth token', async () => {
      const malformedHeaders = [
        'Bearer',
        'invalid-token',
        'Bearer token extra',
      ];

      for (const header of malformedHeaders) {
        const response = await fetch(`http://localhost:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: header,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {},
            id: 1,
          }),
        });
        expect(response.status, `Failed for header: ${header}`).toBe(401);
        const body = await response.text();
        expect(body, `Failed for header: ${header}`).toBe('Unauthorized');
      }
    });
  });
});

const request = (
  port: string,
  options: http.RequestOptions,
  body?: string,
): Promise<http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        ...options,
      },
      (res) => {
        res.resume(); // Consume response data to free up memory
        resolve(res);
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });

describe('IDEServer HTTP endpoints', () => {
  let ideServer: IDEServer;
  let mockContext: vscode.ExtensionContext;
  let mockLog: (message: string) => void;
  let port: string;

  beforeEach(async () => {
    mockLog = vi.fn();
    ideServer = new IDEServer(mockLog, mocks.diffManager);
    mockContext = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
        clear: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;
    port = getPortFromMock(replaceMock);
  });

  afterEach(async () => {
    await ideServer.stop();
    vi.restoreAllMocks();
  });

  it('should deny requests with an origin header', async () => {
    const response = await request(
      port,
      {
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: `localhost:${port}`,
          Origin: 'https://evil.com',
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize' }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('should deny requests with an invalid host header', async () => {
    const response = await request(
      port,
      {
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: 'evil.com',
          'Content-Type': 'application/json',
        },
      },
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize' }),
    );
    expect(response.statusCode).toBe(403);
  });

  it('should allow requests with a valid host header', async () => {
    const response = await request(
      port,
      {
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: `localhost:${port}`,
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-auth-token',
        },
      },
      JSON.stringify({ jsonrpc: '2.0', method: 'initialize' }),
    );
    // We expect a 400 here because we are not sending a valid MCP request,
    // but it's not a host error, which is what we are testing.
    expect(response.statusCode).toBe(400);
  });
});
