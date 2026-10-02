/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import type * as fs from 'node:fs';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { getIdeServerHost } from './ide-connection-utils.js';
import { getIdeProcessInfo } from './process-utils.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((targetPath: fs.PathLike) => {
      if (
        targetPath === '/.dockerenv' &&
        process.env['GEMINI_SANDBOX'] === 'runsc'
      ) {
        return true;
      }
      return actual.existsSync(targetPath);
    }),
    promises: {
      ...actual.promises,
      // In sandbox container, host /tmp/gemini/ide discovery directory does not exist
      readdir: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory')),
    },
  };
});

vi.mock('./process-utils.js', () => ({
  getIdeProcessInfo: vi.fn(),
}));

describe('IDE Companion under gVisor (runsc) Sandbox Constraints', () => {
  let mockServer: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    // Reset IdeClient singleton instance promise
    (
      IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
    ).instancePromise = null;

    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: 12345,
      command: 'code',
    });

    // Start a mock host companion server bound strictly to 127.0.0.1
    await new Promise<void>((resolve, reject) => {
      mockServer = http.createServer((req, res) => {
        const host = req.headers.host || '';
        const allowedHosts = [
          `localhost:${serverPort}`,
          `127.0.0.1:${serverPort}`,
        ];

        if (!allowedHosts.includes(host)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid Host header' }));
          return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== 'Bearer valid-auth-token') {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { tools: [] } }));
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer.address();
        if (address && typeof address !== 'string') {
          serverPort = address.port;
          resolve();
        } else {
          reject(new Error('Failed to bind server'));
        }
      });
      mockServer.on('error', reject);
    });

    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', process.cwd());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  it('fails to connect when executed within gVisor netstack constraints (blocked host-gateway port / loopback isolation)', async () => {
    // In a container sandbox, /.dockerenv existence is simulated via the module-level fs mock when GEMINI_SANDBOX is runsc
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');

    // IdeServerHost resolves to host.docker.internal in a container
    expect(getIdeServerHost()).toBe('host.docker.internal');

    // Inside gVisor sandbox, host.docker.internal routes to the gateway (e.g. 172.17.0.1) or
    // unrouted container loopback. An inaccessible/blocked port reflects the host service being bound
    // only to 127.0.0.1 on the host. Sockets on the gateway IP reject connections with ECONNREFUSED.
    const blockedGatewayPort = 65432;
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(blockedGatewayPort));
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', 'valid-auth-token');

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    // Connection must fail due to ECONNREFUSED on the blocked port, providing informative gVisor explanation
    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'gVisor (runsc) sandboxing enforces strict network isolation',
    );
  });

  it('fails to connect when executed within gVisor IPC unix socket constraints (missing IPC socket path / --host-uds=none)', async () => {
    // In gVisor, unix domain sockets from the host are blocked (--host-uds=none) or missing from /tmp
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_STDIO_COMMAND', '/nonexistent/ide-uds-bridge');
    vi.stubEnv(
      'GEMINI_CLI_IDE_SERVER_STDIO_ARGS',
      JSON.stringify(['--socket', '/tmp/nonexistent-ide.sock']),
    );

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'Failed to connect to IDE companion extension in VS Code',
    );
  });
});
