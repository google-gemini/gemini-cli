/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import type * as fs from 'node:fs';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { getIdeServerHost, isGvisorSandbox } from './ide-connection-utils.js';
import { getIdeProcessInfo } from './process-utils.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((targetPath: fs.PathLike) => {
      if (targetPath === '/.dockerenv') {
        return true;
      }
      return actual.existsSync(targetPath);
    }),
    promises: {
      ...actual.promises,
      // Inside the sandbox container, the host's /tmp/gemini/ide discovery directory is not mounted
      open: vi
        .fn()
        .mockRejectedValue(new Error('ENOENT: no such file or directory')),
      readdir: vi
        .fn()
        .mockRejectedValue(new Error('ENOENT: no such file or directory')),
      readFile: vi
        .fn()
        .mockRejectedValue(new Error('ENOENT: no such file or directory')),
    },
  };
});

vi.mock('./process-utils.js', () => ({
  getIdeProcessInfo: vi.fn(),
}));

describe('Issue #21331: IDE Companion connection under gVisor (runsc) sandbox', () => {
  let mockCompanionServer: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    // Reset IdeClient singleton instancePromise between tests
    (
      IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
    ).instancePromise = null;

    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: 1,
      command: '/sbin/docker-init -- bash',
    });

    // Start a local HTTP server mirroring IDEServer's exact binding (127.0.0.1),
    // Host header validation, and Bearer token authentication.
    await new Promise<void>((resolve, reject) => {
      mockCompanionServer = http.createServer((req, res) => {
        const host = (req.headers.host || '').toLowerCase();
        const allowedHosts = [
          `localhost:${serverPort}`,
          `127.0.0.1:${serverPort}`,
          `host.docker.internal:${serverPort}`,
          `host.containers.internal:${serverPort}`,
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

      mockCompanionServer.listen(0, '127.0.0.1', () => {
        const address = mockCompanionServer.address();
        if (address && typeof address !== 'string') {
          serverPort = address.port;
          resolve();
        } else {
          reject(new Error('Failed to bind mock companion server'));
        }
      });
      mockCompanionServer.on('error', reject);
    });

    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', process.cwd());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await new Promise<void>((resolve) => {
      mockCompanionServer.close(() => resolve());
    });
  });

  it('reports explicit gVisor network isolation error when GEMINI_SANDBOX=runsc', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(serverPort));
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', 'valid-auth-token');

    // Inside the container, getIdeServerHost() maps to host.docker.internal
    expect(getIdeServerHost()).toBe('host.docker.internal');
    expect(isGvisorSandbox()).toBe(true);

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'gVisor (runsc) sandboxing enforces strict network isolation which prevents host loopback communication.',
    );
    expect(ideClient.getConnectionStatus().details).not.toContain(
      '/ide install',
    );
  });

  it('reports explicit gVisor network isolation error when SANDBOX env var contains runsc', async () => {
    vi.stubEnv('SANDBOX', 'gemini-cli-sandbox-runsc-a1b2c3');
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(serverPort));
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', 'valid-auth-token');

    expect(isGvisorSandbox()).toBe(true);

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'gVisor (runsc) sandboxing enforces strict network isolation which prevents host loopback communication.',
    );
  });

  it('reports explicit gVisor network isolation error when GEMINI_CLI_IDE_WORKSPACE_PATH is unset (e.g. file-based discovery on host)', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', undefined);

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'gVisor (runsc) sandboxing enforces strict network isolation which prevents host loopback communication.',
    );
    expect(ideClient.getConnectionStatus().details).not.toContain(
      '/ide install',
    );
  });

  it('preserves directory mismatch error under gVisor when GEMINI_CLI_IDE_WORKSPACE_PATH points to another directory', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '/non-matching/workspace/path');

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'Directory mismatch.',
    );
  });

  it('preserves open workspace folder error under gVisor when GEMINI_CLI_IDE_WORKSPACE_PATH is empty string', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'runsc');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '');

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'please open a workspace folder in your IDE',
    );
  });

  it('preserves standard /ide install error message when not running under gVisor', async () => {
    vi.stubEnv('GEMINI_SANDBOX', 'docker');
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(serverPort));
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', 'valid-auth-token');

    expect(isGvisorSandbox()).toBe(false);

    const ideClient = await IdeClient.getInstance();
    await ideClient.connect({ logToConsole: false });

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Disconnected,
    );
    expect(ideClient.getConnectionStatus().details).toContain(
      'Please ensure the extension is running. To install the extension, run /ide install.',
    );
  });
});
