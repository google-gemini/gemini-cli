/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end test of the sandbox IDE bridge without a container:
 *
 *   IdeClient (real, stdio transport)
 *     └─ node ide-bridge.js connect <socket>      (real helper, "CLI side")
 *          └─ node ide-bridge.js serve <socket>   (real helper, "exec'd side")
 *               └─ IdeBridge (real)               (host side, MCP relay)
 *                    └─ companion stand-in        (HTTP + Host/Bearer gates)
 *
 * `docker exec -i <container>` is replaced by a node shim that simply runs
 * the helper, which is the only thing the exec does once the container is up.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  IdeClient,
  IDEConnectionStatus,
  ideContextStore,
} from '@google/gemini-cli-core';
import { IdeBridge, resolveIdeBridgeUpstream } from './ideBridge.js';
import {
  IDE_BRIDGE_HELPER_SOURCE,
  IDE_BRIDGE_READY_MARKER,
} from './ideBridgeHelper.js';

const AUTH_TOKEN = 'companion-token-for-test';

interface ToolCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

/** Companion server stand-in with the same gates as ide-server.ts. */
async function startCompanion() {
  const toolCalls: ToolCall[] = [];
  const rejected: Array<{ host: string; status: number }> = [];
  const transports = new Map<string, StreamableHTTPServerTransport>();
  let sseWaiters: Array<() => void> = [];
  let sseOpen = false;
  let port = 0;

  const readJson = (req: http.IncomingMessage): Promise<unknown> =>
    new Promise((resolve) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        raw += chunk;
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : undefined);
        } catch {
          resolve(undefined);
        }
      });
    });

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) {
      rejected.push({ host, status: 403 });
      res.writeHead(403).end('{"error":"Invalid Host header"}');
      return;
    }
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || token !== AUTH_TOKEN) {
      rejected.push({ host, status: 401 });
      res.writeHead(401).end('Unauthorized');
      return;
    }
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    let transport =
      typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (!isInitializeRequest(body)) {
        res.writeHead(400).end('Bad Request');
        return;
      }
      const created = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, created);
        },
      });
      transport = created;
      const mcp = new McpServer(
        { name: 'gemini-cli-companion-mcp-server', version: '1.0.0' },
        { capabilities: { logging: {} } },
      );
      mcp.registerTool(
        'openDiff',
        {
          description: '(IDE Tool) Open a diff view',
          inputSchema: { filePath: z.string(), newContent: z.string() },
        },
        async (args) => {
          toolCalls.push({ name: 'openDiff', args });
          return { content: [] };
        },
      );
      mcp.registerTool(
        'closeDiff',
        {
          description: '(IDE Tool) Close a diff view',
          inputSchema: {
            filePath: z.string(),
            suppressNotification: z.boolean().optional(),
          },
        },
        async (args) => {
          toolCalls.push({ name: 'closeDiff', args });
          return { content: [{ type: 'text', text: '{}' }] };
        },
      );
      await mcp.connect(transport);
    }
    if (req.method === 'GET') {
      sseOpen = true;
      for (const resolve of sseWaiters) resolve();
      sseWaiters = [];
    }
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;

  return {
    port,
    toolCalls,
    rejected,
    /** Resolves once a client has opened the SSE stream notifications go to. */
    waitForSse: () =>
      sseOpen
        ? Promise.resolve()
        : new Promise<void>((resolve) => sseWaiters.push(resolve)),
    push: async (method: string, params: Record<string, unknown>) => {
      for (const transport of transports.values()) {
        await transport.send({ jsonrpc: '2.0', method, params });
      }
    },
    close: async () => {
      await Promise.allSettled([...transports.values()].map((t) => t.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const EXEC_SHIM_SOURCE = `
// Stands in for "docker exec -i <container>": runs the helper with this node.
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'node') args.shift();
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`;

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function freshIdeClient(): Promise<IdeClient> {
  (
    IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
  ).instancePromise = null;
  return IdeClient.getInstance();
}

// Unix sockets are not available to node on Windows; the bridge itself only
// ever runs them inside Linux containers.
describe.skipIf(process.platform === 'win32')(
  'IdeBridge (end to end, without a container)',
  () => {
    let companion: Awaited<ReturnType<typeof startCompanion>>;
    let bridge: IdeBridge | undefined;
    let ideClient: IdeClient | undefined;
    let rawClient: Client | undefined;
    let workDir: string;
    let helperPath: string;
    let shimPath: string;
    let socketPath: string;
    let emptyTmp: string;

    beforeEach(async () => {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-bridge-'));
      helperPath = path.join(workDir, 'ide-bridge.js');
      shimPath = path.join(workDir, 'exec-shim.cjs');
      socketPath = path.join(workDir, 'b.sock');
      emptyTmp = path.join(workDir, 'tmp');
      fs.mkdirSync(emptyTmp);
      fs.writeFileSync(helperPath, IDE_BRIDGE_HELPER_SOURCE);
      fs.writeFileSync(shimPath, EXEC_SHIM_SOURCE);
      companion = await startCompanion();

      // Inside the sandbox: no connection file, only what the launcher sets.
      for (const name of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(name, emptyTmp);
      vi.stubEnv('TERM_PROGRAM', 'vscode');
      vi.stubEnv('SANDBOX', 'gemini-cli-sandbox');
      vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '');
      vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', '');
      vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', process.cwd());
      vi.stubEnv('GEMINI_CLI_IDE_SERVER_STDIO_COMMAND', process.execPath);
      vi.stubEnv(
        'GEMINI_CLI_IDE_SERVER_STDIO_ARGS',
        JSON.stringify([helperPath, 'connect', socketPath]),
      );
      for (const name of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'http_proxy',
        'https_proxy',
        'NO_PROXY',
        'no_proxy',
      ]) {
        vi.stubEnv(name, '');
      }
      ideContextStore.clear();
    });

    afterEach(async () => {
      await ideClient?.disconnect();
      ideClient = undefined;
      await rawClient?.close();
      rawClient = undefined;
      await bridge?.stop();
      bridge = undefined;
      await companion.close();
      fs.rmSync(workDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });

    async function startBridge(workspacePaths = [process.cwd()]) {
      bridge = new IdeBridge({
        upstream: {
          port: String(companion.port),
          authToken: AUTH_TOKEN,
          workspacePaths,
        },
        helperPathInContainer: helperPath,
        socketPathInContainer: socketPath,
      });
      await bridge.connectUpstream();
      await companion.waitForSse();
      await bridge.attach({
        execCommand: [process.execPath, shimPath],
        isSandboxAlive: () => true,
      });
      return bridge;
    }

    it('connects the real IdeClient to the companion through the bridge', async () => {
      await startBridge();
      // Sent before the CLI connects; the bridge must replay it.
      await companion.push('ide/contextUpdate', {
        workspaceState: {
          openFiles: [
            {
              path: path.join(process.cwd(), 'README.md'),
              isActive: true,
              timestamp: 1,
            },
          ],
          isTrusted: true,
        },
      });

      ideClient = await freshIdeClient();
      await ideClient.connect({ logToConsole: false });

      const state = ideClient.getConnectionStatus();
      expect(state.details ?? state.status).toBe(IDEConnectionStatus.Connected);
      expect(ideClient.isDiffingEnabled()).toBe(true);
      await waitFor(() => ideContextStore.get() !== undefined);
      expect(ideContextStore.get()?.workspaceState?.openFiles?.[0]?.path).toBe(
        path.join(process.cwd(), 'README.md'),
      );
      // The companion only ever saw authenticated loopback traffic.
      expect(companion.rejected).toEqual([]);
    });

    it('relays openDiff inside the workspace and resolves it from the IDE', async () => {
      await startBridge();
      ideClient = await freshIdeClient();
      await ideClient.connect({ logToConsole: false });

      const filePath = path.join(process.cwd(), 'src', 'new-file.ts');
      const pending = ideClient.openDiff(filePath, 'content');
      await waitFor(() => companion.toolCalls.length === 1);
      expect(companion.toolCalls[0]).toEqual({
        name: 'openDiff',
        args: { filePath, newContent: 'content' },
      });

      await companion.push('ide/diffAccepted', { filePath, content: 'edited' });
      await expect(pending).resolves.toEqual({
        status: 'accepted',
        content: 'edited',
      });
    });

    it('refuses openDiff for paths outside the IDE workspace', async () => {
      await startBridge();
      ideClient = await freshIdeClient();
      await ideClient.connect({ logToConsole: false });

      const outside = path.join(os.homedir(), '.ssh', 'authorized_keys');
      await expect(ideClient.openDiff(outside, 'x')).rejects.toThrow(
        /outside the IDE workspace/,
      );
      expect(companion.toolCalls).toEqual([]);
    });

    it('only exposes openDiff and closeDiff to the sandbox', async () => {
      await startBridge();
      rawClient = new Client({ name: 'sandboxed-caller', version: '0' });
      await rawClient.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [helperPath, 'connect', socketPath],
        }),
      );

      const { tools } = await rawClient.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'closeDiff',
        'openDiff',
      ]);
      await expect(
        rawClient.callTool({
          name: 'readFile',
          arguments: { filePath: process.cwd() },
        }),
      ).rejects.toThrow(/not available from inside the sandbox/);
      await expect(
        rawClient.readResource({ uri: 'file:///etc/passwd' }),
      ).rejects.toThrow();
      expect(companion.toolCalls).toEqual([]);
    });

    it('lets /ide enable reconnect after the IDE companion restarts on a new port', async () => {
      await startBridge();
      ideClient = await freshIdeClient();
      await ideClient.connect({ logToConsole: false });
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );

      // "Reload Window": the extension host dies and comes back on a new
      // port with a new token, which only the connection file / environment
      // of a *new* terminal would know. The bridge must notice on its own.
      const old = companion;
      await old.close();
      companion = await startCompanion();
      vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(companion.port));
      vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', AUTH_TOKEN);

      // Like the un-sandboxed CLI, the sandboxed one is told the connection
      // went away rather than silently keeping a dead session.
      await waitFor(
        () =>
          ideClient!.getConnectionStatus().status ===
          IDEConnectionStatus.Disconnected,
      );
      expect(ideClient.getConnectionStatus().details).toMatch(
        /run \/ide enable/,
      );

      // `/ide enable` → the connector finds the (re-exec'd) helper and the
      // bridge re-resolves and reconnects to the new companion.
      await ideClient.connect({ logToConsole: false });
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(ideClient.isDiffingEnabled()).toBe(true);

      const filePath = path.join(process.cwd(), 'after-reload.ts');
      const pending = ideClient.openDiff(filePath, 'x');
      await waitFor(() => companion.toolCalls.length === 1);
      await companion.push('ide/diffAccepted', { filePath, content: 'y' });
      await expect(pending).resolves.toEqual({
        status: 'accepted',
        content: 'y',
      });
      expect(old.toolCalls).toEqual([]);
    });

    it('reports the ready marker from the helper and tolerates a slow container', async () => {
      // A shim that fails the first time stands in for "container not running yet".
      const flakyShim = path.join(workDir, 'flaky-shim.cjs');
      const marker = path.join(workDir, 'first-attempt-done');
      fs.writeFileSync(
        flakyShim,
        `const fs = require('node:fs');
if (!fs.existsSync(${JSON.stringify(marker)})) {
  fs.writeFileSync(${JSON.stringify(marker)}, '');
  process.stderr.write('Error response from daemon: No such container\\n');
  process.exit(1);
}
${EXEC_SHIM_SOURCE}`,
      );
      bridge = new IdeBridge({
        upstream: {
          port: String(companion.port),
          authToken: AUTH_TOKEN,
          workspacePaths: [process.cwd()],
        },
        helperPathInContainer: helperPath,
        socketPathInContainer: socketPath,
      });
      await bridge.connectUpstream();
      await bridge.attach({
        execCommand: [process.execPath, flakyShim],
        isSandboxAlive: () => true,
      });
      expect(fs.existsSync(marker)).toBe(true);
      expect(IDE_BRIDGE_READY_MARKER).toBe('gemini-ide-bridge: listening');

      ideClient = await freshIdeClient();
      await ideClient.connect({ logToConsole: false });
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });
  },
);

describe('resolveIdeBridgeUpstream', () => {
  let emptyTmp: string;

  beforeEach(() => {
    emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-bridge-env-'));
    for (const name of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(name, emptyTmp);
  });

  afterEach(() => {
    fs.rmSync(emptyTmp, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('uses the integrated-terminal environment when no connection file exists', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '4242');
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', 'tok');
    vi.stubEnv(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      ['/w/one', '/w/two'].join(path.delimiter),
    );

    await expect(resolveIdeBridgeUpstream()).resolves.toEqual({
      port: '4242',
      authToken: 'tok',
      workspacePaths: [path.resolve('/w/one'), path.resolve('/w/two')],
    });
  });

  it('returns undefined when no companion is advertised', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '');
    await expect(resolveIdeBridgeUpstream()).resolves.toBeUndefined();
  });
});
