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
  mkdir: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    tmpdir: vi.fn(() => '/tmp'),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
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
    expect(replaceMock).toHaveBeenCalledTimes(3);

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

    expect(replaceMock).toHaveBeenNthCalledWith(
      3,
      'GEMINI_CLI_IDE_AUTH_TOKEN',
      'test-auth-token',
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      'gemini',
      'ide',
      `gemini-ide-server-${process.ppid}-${port}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: expectedWorkspacePaths,
      authToken: 'test-auth-token',
    });
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('/tmp', 'gemini', 'ide'), {
      recursive: true,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
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
      'gemini',
      'ide',
      `gemini-ide-server-${process.ppid}-${port}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: '/foo/bar',
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
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
      'gemini',
      'ide',
      `gemini-ide-server-${process.ppid}-${port}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: '',
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
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
    expect(replaceMock).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_AUTH_TOKEN',
      'test-auth-token',
    );

    const port = getPortFromMock(replaceMock);
    const expectedPortFile = path.join(
      '/tmp',
      'gemini',
      'ide',
      `gemini-ide-server-${process.ppid}-${port}.json`,
    );
    const expectedContent = JSON.stringify({
      port: parseInt(port, 10),
      workspacePath: expectedWorkspacePaths,
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);

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
      authToken: 'test-auth-token',
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPortFile,
      expectedContent2,
    );
    expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
  });

  it('should clear env vars and delete port file on stop', async () => {
    await ideServer.start(mockContext);
    const replaceMock = mockContext.environmentVariableCollection.replace;
    const port = getPortFromMock(replaceMock);
    const portFile = path.join(
      '/tmp',
      'gemini',
      'ide',
      `gemini-ide-server-${process.ppid}-${port}.json`,
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
        'gemini',
        'ide',
        `gemini-ide-server-${process.ppid}-${port}.json`,
      );
      const expectedContent = JSON.stringify({
        port: parseInt(port, 10),
        workspacePath: expectedWorkspacePaths,
        authToken: 'test-auth-token',
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPortFile,
        expectedContent,
      );
      expect(fs.chmod).toHaveBeenCalledWith(expectedPortFile, 0o600);
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
  it('should resolve stop() while an MCP stream is open', async () => {
    // The bug: stop() awaited server.close(), whose callback fires only once
    // every established connection has drained. The MCP transport holds a
    // long-lived streaming response on GET /mcp, so nothing drained and
    // extension deactivate blocked behind stop() forever.
    //
    // An idle socket does not reproduce it: close() destroys those. The
    // connection has to be one the server is actively holding open, which
    // means a real session and a real stream.
    const initialize = await request(
      port,
      {
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: `localhost:${port}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer test-auth-token',
        },
      },
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'stop-test', version: '1.0.0' },
        },
      }),
    );
    const sessionId = initialize.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    // Held open by the server for the lifetime of the session.
    const stream = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'GET',
      headers: {
        Host: `localhost:${port}`,
        Accept: 'text/event-stream',
        Authorization: 'Bearer test-auth-token',
        'mcp-session-id': sessionId,
      },
    });
    const streamOpen = new Promise<void>((resolve, reject) => {
      stream.once('response', (res) => {
        expect(res.statusCode).toBe(200);
        res.resume();
        resolve();
      });
      stream.once('error', reject);
    });
    stream.end();
    await streamOpen;

    try {
      await expect(
        Promise.race([
          ideServer.stop().then(() => 'stopped' as const),
          new Promise<'timed out'>((resolve) =>
            setTimeout(() => resolve('timed out'), 3000),
          ),
        ]),
      ).resolves.toBe('stopped');

      // stop() must close the transport, not just stop listening. The
      // transport's onclose handler is what clears the keep-alive interval
      // and drops the session, so this log line is the observable proof that
      // the interval is not still pinging a server that is gone.
      expect(mockLog).toHaveBeenCalledWith(`Session closed: ${sessionId}`);
    } finally {
      stream.destroy();
    }
  });
});
