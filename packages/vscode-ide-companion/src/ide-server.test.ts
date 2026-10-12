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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IdeContextNotificationSchema } from '@google/gemini-cli-core/src/ide/types.js';

const { vscodeMock: baseVscodeMock } = await vi.hoisted(
  () => import('./utils/vscode-mock.js'),
);

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
  ...baseVscodeMock,
  workspace: {
    ...baseVscodeMock.workspace,
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
  // A schema-valid IdeContext so the GET /mcp handler can emit the initial
  // `ide/contextUpdate` notification instead of throwing on parse.
  OpenFilesManager.prototype.state = {
    workspaceState: { openFiles: [], isTrusted: true },
  };
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

  describe('shutdown with active MCP sessions', () => {
    type ServerTransports = Record<string, StreamableHTTPServerTransport>;
    const getTransports = () =>
      (ideServer as unknown as { transports: ServerTransports }).transports;

    /**
     * Connects exactly the way IdeClient does. The SDK client opens a
     * long-lived standalone `GET /mcp` SSE stream right after `initialize`
     * (fire-and-forget), so we wait for the server's initial
     * `ide/contextUpdate` push — which can only arrive over that stream — to
     * know the socket is open end-to-end.
     */
    const connectMcpClient = async (port: string) => {
      const client = new Client({ name: 'test-client', version: '0.0.0' });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
        {
          requestInit: { headers: { Authorization: 'Bearer test-auth-token' } },
        },
      );
      const sseStreamLive = new Promise<void>((resolve) => {
        client.setNotificationHandler(IdeContextNotificationSchema, () =>
          resolve(),
        );
      });
      await client.connect(transport);
      await Promise.race([
        sseStreamLive,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('GET /mcp SSE stream never became live')),
            2_000,
          ),
        ),
      ]);
      return client;
    };

    const withDeadline = <T>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise.then(() => 'resolved' as const),
        new Promise<'timed-out'>((resolve) =>
          setTimeout(() => resolve('timed-out'), ms),
        ),
      ]);

    const getServer = () =>
      (ideServer as unknown as { server: http.Server }).server;

    /** Holds `server.close()` until the returned function is called. */
    const gateServerClose = (server: http.Server) => {
      const realClose = server.close.bind(server);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(server, 'close').mockImplementation((cb) => {
        void gate.then(() => realClose(cb));
        return server;
      });
      return release;
    };

    const latestPort = () =>
      vi
        .mocked(mockContext.environmentVariableCollection.replace)
        .mock.calls.filter(([k]) => k === 'GEMINI_CLI_IDE_SERVER_PORT')
        .at(-1)?.[1] as string;

    const portFileFor = (p: string) =>
      path.join(
        '/tmp',
        'gemini',
        'ide',
        `gemini-ide-server-${process.ppid}-${p}.json`,
      );

    const shutdownLogCount = () =>
      vi
        .mocked(mockLog)
        .mock.calls.filter(([m]) => m === 'IDE server shut down').length;

    let port: string;
    let clients: Client[];

    beforeEach(async () => {
      clients = [];
      await ideServer.start(mockContext);
      port = getPortFromMock(mockContext.environmentVariableCollection.replace);
    });

    afterEach(async () => {
      // Drain client sockets so a hung stop() cannot wedge the runner.
      await Promise.allSettled(clients.map((c) => c.close()));
    });

    // Regression test for https://github.com/google-gemini/gemini-cli/issues/28785
    it('should resolve stop() while a session holds an open SSE stream', async () => {
      clients.push(await connectMcpClient(port));
      expect(Object.keys(getTransports())).toHaveLength(1);

      const outcome = await withDeadline(ideServer.stop(), 2_000);

      expect(outcome, 'stop() hung while a client held GET /mcp open').toBe(
        'resolved',
      );
      expect(mockLog).toHaveBeenCalledWith('IDE server shut down');
    });

    it('should close sessions, clear keep-alive, and clean up on stop()', async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
      clients.push(await connectMcpClient(port));
      const [sessionId] = Object.keys(getTransports());

      await ideServer.stop();

      expect(Object.keys(getTransports())).toHaveLength(0);
      expect(mockLog).toHaveBeenCalledWith(`Session closed: ${sessionId}`);
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(
        mockContext.environmentVariableCollection.clear,
      ).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should close every session when multiple clients are connected', async () => {
      // randomUUID is mocked to a constant, so give each session a unique id.
      const { randomUUID } = await import('node:crypto');
      vi.mocked(randomUUID)
        .mockReturnValueOnce('session-a' as ReturnType<typeof randomUUID>)
        .mockReturnValueOnce('session-b' as ReturnType<typeof randomUUID>);

      clients.push(await connectMcpClient(port));
      clients.push(await connectMcpClient(port));
      expect(Object.keys(getTransports()).sort()).toEqual([
        'session-a',
        'session-b',
      ]);

      const outcome = await withDeadline(ideServer.stop(), 2_000);

      expect(outcome).toBe('resolved');
      expect(Object.keys(getTransports())).toHaveLength(0);
      expect(mockLog).toHaveBeenCalledWith('Session closed: session-a');
      expect(mockLog).toHaveBeenCalledWith('Session closed: session-b');
    });

    it('should make stop() idempotent', async () => {
      clients.push(await connectMcpClient(port));

      await ideServer.stop();
      await expect(ideServer.stop()).resolves.toBeUndefined();

      expect(
        vi
          .mocked(mockLog)
          .mock.calls.filter(([m]) => m === 'IDE server shut down'),
      ).toHaveLength(1);
    });

    it('should be stoppable again after a restart', async () => {
      clients.push(await connectMcpClient(port));
      await ideServer.stop();

      await ideServer.start(mockContext);
      clients.push(await connectMcpClient(latestPort()));
      expect(Object.keys(getTransports())).toHaveLength(1);

      const outcome = await withDeadline(ideServer.stop(), 2_000);

      expect(outcome).toBe('resolved');
      expect(Object.keys(getTransports())).toHaveLength(0);
      expect(shutdownLogCount()).toBe(2);
    });

    it('should make concurrent stop() calls await the same in-flight shutdown', async () => {
      clients.push(await connectMcpClient(port));
      const releaseClose = gateServerClose(getServer());

      const first = ideServer.stop();
      const second = ideServer.stop();

      // The second caller must not resolve while the listener is still
      // closing and cleanup (env collection, port file) has not run yet.
      expect(await withDeadline(second, 50)).toBe('timed-out');
      expect(
        mockContext.environmentVariableCollection.clear,
      ).not.toHaveBeenCalled();

      releaseClose();
      await expect(Promise.all([first, second])).resolves.toEqual([
        undefined,
        undefined,
      ]);
      expect(
        mockContext.environmentVariableCollection.clear,
      ).toHaveBeenCalledTimes(1);
      expect(shutdownLogCount()).toBe(1);
      expect(mockLog).not.toHaveBeenCalledWith(
        expect.stringContaining('Error shutting down IDE server'),
      );
    });

    it('should not let a late-finishing stop() clobber a restarted server', async () => {
      vi.mocked(fs.unlink).mockClear();
      clients.push(await connectMcpClient(port));
      const releaseOldClose = gateServerClose(getServer());
      const oldStop = ideServer.stop();

      // Restart while the old shutdown is still draining.
      await ideServer.start(mockContext);
      const newPort = latestPort();
      expect(newPort).not.toBe(port);
      clients.push(await connectMcpClient(newPort));

      releaseOldClose();
      await oldStop;

      // The old shutdown removed only its own port file and left the new
      // server's env vars alone.
      expect(fs.unlink).toHaveBeenCalledWith(portFileFor(port));
      expect(fs.unlink).not.toHaveBeenCalledWith(portFileFor(newPort));
      expect(
        mockContext.environmentVariableCollection.clear,
      ).not.toHaveBeenCalled();

      // ...and the new server is still fully stoppable.
      expect(await withDeadline(ideServer.stop(), 2_000)).toBe('resolved');
      expect(shutdownLogCount()).toBe(2);
      expect(fs.unlink).toHaveBeenCalledWith(portFileFor(newPort));
      expect(
        mockContext.environmentVariableCollection.clear,
      ).toHaveBeenCalledTimes(1);
    });

    it('should keep a second shutdown joinable when the first finishes later', async () => {
      clients.push(await connectMcpClient(port));
      const releaseOldClose = gateServerClose(getServer());
      const oldStop = ideServer.stop();

      await ideServer.start(mockContext);
      clients.push(await connectMcpClient(latestPort()));
      const releaseNewClose = gateServerClose(getServer());
      const newStop = ideServer.stop();

      // First shutdown completes while the second is still in flight.
      releaseOldClose();
      await oldStop;

      // The server must still report "stopping": a further stop() joins the
      // second shutdown instead of returning instantly as "stopped".
      expect(await withDeadline(ideServer.stop(), 50)).toBe('timed-out');

      releaseNewClose();
      await expect(newStop).resolves.toBeUndefined();
      expect(shutdownLogCount()).toBe(2);
    });

    it('should still clean up when the HTTP server fails to close', async () => {
      const server = (ideServer as unknown as { server: http.Server }).server;
      const closeSpy = vi.spyOn(server, 'close').mockImplementation((cb) => {
        cb?.(new Error('close failed'));
        return server;
      });

      try {
        await expect(ideServer.stop()).rejects.toThrow('close failed');

        expect(
          mockContext.environmentVariableCollection.clear,
        ).toHaveBeenCalled();
        expect(fs.unlink).toHaveBeenCalled();
        // A follow-up stop() must not try to close the dead server again.
        await expect(ideServer.stop()).resolves.toBeUndefined();
      } finally {
        closeSpy.mockRestore();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    describe('keep-alive', () => {
      const KEEP_ALIVE_MS = 60_000;

      beforeEach(() => {
        // Only fake the interval APIs so real sockets/fetch keep working.
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should close the session after 3 consecutive missed pings', async () => {
        clients.push(await connectMcpClient(port));
        const [sessionId] = Object.keys(getTransports());
        const transport = getTransports()[sessionId];
        const closeSpy = vi.spyOn(transport, 'close');
        vi.spyOn(transport, 'send').mockRejectedValue(new Error('EPIPE'));

        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2);
        expect(closeSpy).not.toHaveBeenCalled();
        expect(getTransports()[sessionId]).toBe(transport);

        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(getTransports()[sessionId]).toBeUndefined();
        expect(mockLog).toHaveBeenCalledWith(
          expect.stringContaining(`Session ${sessionId} missed 3 pings`),
        );
        expect(mockLog).toHaveBeenCalledWith(`Session closed: ${sessionId}`);

        // Interval is gone: no further pings are attempted.
        const sendCalls = vi.mocked(transport.send).mock.calls.length;
        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2);
        expect(transport.send).toHaveBeenCalledTimes(sendCalls);
      });

      it('should reset the missed-ping count on a successful ping', async () => {
        clients.push(await connectMcpClient(port));
        const [sessionId] = Object.keys(getTransports());
        const transport = getTransports()[sessionId];
        const closeSpy = vi.spyOn(transport, 'close');
        vi.spyOn(transport, 'send')
          .mockRejectedValueOnce(new Error('EPIPE'))
          .mockRejectedValueOnce(new Error('EPIPE'))
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('EPIPE'))
          .mockRejectedValueOnce(new Error('EPIPE'));

        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 5);

        expect(transport.send).toHaveBeenCalledTimes(5);
        expect(closeSpy).not.toHaveBeenCalled();
        expect(getTransports()[sessionId]).toBe(transport);
      });

      it('should log and stop pinging if closing the evicted session fails', async () => {
        clients.push(await connectMcpClient(port));
        const [sessionId] = Object.keys(getTransports());
        const transport = getTransports()[sessionId];
        vi.spyOn(transport, 'send').mockRejectedValue(new Error('EPIPE'));
        const closeSpy = vi
          .spyOn(transport, 'close')
          .mockRejectedValue(new Error('close failed'));

        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 3);

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(mockLog).toHaveBeenCalledWith(
          `Failed to close transport for session ${sessionId}: close failed`,
        );

        // The interval must not keep retrying a transport that cannot close.
        const sendCalls = vi.mocked(transport.send).mock.calls.length;
        await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 2);
        expect(transport.send).toHaveBeenCalledTimes(sendCalls);
        expect(closeSpy).toHaveBeenCalledTimes(1);
      });
    });
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
});
