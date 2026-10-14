/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests: `IdeClient` must survive an IDE-server restart.
 *
 * VS Code "Developer: Reload Window" (or an extension update/disable) restarts
 * the companion extension host, which starts a NEW server on a NEW port with a
 * NEW auth token and a NEW port file. The integrated terminal — and the
 * `gemini` process in it — survives the reload, so its `GEMINI_CLI_IDE_*`
 * environment variables stay frozen at the OLD values. The port file in
 * `tmpdir()/gemini/ide` is the only up-to-date source of truth.
 *
 * Real HTTP servers (MCP SDK `StreamableHTTPServerTransport` over `node:http`)
 * and real port files in an isolated TMPDIR are used on purpose: the defects
 * live in the interaction between port-file discovery, the SDK transport's own
 * reconnection attempts and `IdeClient`'s state handling, none of which a
 * mocked transport can exercise.
 *
 * Context: https://github.com/google-gemini/gemini-cli/issues/28785
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from 'node:http';
import { text } from 'node:stream/consumers';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { getIdeProcessInfo } from './process-utils.js';
import { CloseDiffRequestSchema, OpenDiffRequestSchema } from './types.js';

// Avoid spawning `ps`/PowerShell; the pid only has to be alive and match the
// one used in the port-file name.
vi.mock('./process-utils.js');

const IDE_PID = process.pid;
const WORKSPACE = process.cwd();

/**
 * Minimal stand-in for the companion's `IDEServer`: same wire contract
 * (Bearer auth, Streamable HTTP MCP at `/mcp`, `openDiff`/`closeDiff` tools)
 * and the same discovery contract (port file
 * `gemini-ide-server-<pid>-<port>.json` with `{ port, workspacePath, authToken }`).
 */
class FakeIdeServer {
  readonly authToken = randomUUID();
  port = 0;
  portFile = '';
  /** Invoked whenever a client completes the MCP handshake with this server. */
  onSession: (() => void) | undefined;
  private server: http.Server | undefined;
  private readonly transports = new Map<
    string,
    StreamableHTTPServerTransport
  >();
  private readonly mcp = new McpServer(
    { name: 'fake-ide-companion', version: '0.0.0' },
    { capabilities: { logging: {} } },
  );

  constructor() {
    this.mcp.registerTool(
      'openDiff',
      { inputSchema: OpenDiffRequestSchema.shape },
      async () => ({ content: [] }),
    );
    this.mcp.registerTool(
      'closeDiff',
      { inputSchema: CloseDiffRequestSchema.shape },
      async () => ({ content: [] }),
    );
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('FakeIdeServer: no TCP address');
    }
    this.port = address.port;

    const dir = path.join(os.tmpdir(), 'gemini', 'ide');
    await fs.mkdir(dir, { recursive: true });
    this.portFile = path.join(
      dir,
      `gemini-ide-server-${IDE_PID}-${this.port}.json`,
    );
    await fs.writeFile(
      this.portFile,
      JSON.stringify({
        port: this.port,
        workspacePath: WORKSPACE,
        authToken: this.authToken,
      }),
    );
  }

  /**
   * `cleanup: true`  — the fixed extension (PR #29674): sessions closed,
   *                    sockets dropped, port file removed.
   * `cleanup: false` — the shipped extension (v0.20.0): `stop()` hangs, VS Code
   *                    kills the extension host after its deactivate timeout,
   *                    the port file is LEAKED.
   */
  async stop({ cleanup }: { cleanup: boolean }): Promise<void> {
    if (cleanup) {
      await Promise.allSettled(
        [...this.transports.values()].map((t) => t.close()),
      );
    }
    this.transports.clear();
    const server = this.server;
    this.server = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (cleanup) {
      await fs.unlink(this.portFile).catch(() => {});
    }
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.headers.authorization !== `Bearer ${this.authToken}`) {
      res.writeHead(401).end('Unauthorized');
      return;
    }
    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader)
      ? sessionHeader[0]
      : sessionHeader;

    if (req.method === 'POST') {
      const body: unknown = JSON.parse(await text(req));

      let transport = sessionId ? this.transports.get(sessionId) : undefined;
      if (!transport && !sessionId && isInitializeRequest(body)) {
        const fresh: StreamableHTTPServerTransport =
          new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              this.transports.set(id, fresh);
              this.onSession?.();
            },
          });
        fresh.onclose = () => {
          if (fresh.sessionId) this.transports.delete(fresh.sessionId);
        };
        await this.mcp.connect(fresh);
        transport = fresh;
      }
      if (!transport) {
        res.writeHead(400).end('Bad Request: no valid session');
        return;
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    const transport = sessionId ? this.transports.get(sessionId) : undefined;
    if (!transport) {
      res.writeHead(400).end('Invalid or missing session ID');
      return;
    }
    await transport.handleRequest(req, res);
  }
}

/** What the integrated terminal captured when it was created. */
function freezeTerminalEnv(server: FakeIdeServer) {
  vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(server.port));
  vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', server.authToken);
  vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', WORKSPACE);
}

/** What the CLI does on startup and on `/ide enable`. */
async function slashIdeEnable(
  ideClient: IdeClient,
): Promise<IDEConnectionStatus> {
  await ideClient.connect({ logToConsole: false });
  return ideClient.getConnectionStatus().status;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('IdeClient after the IDE server restarts (Reload Window)', () => {
  let tmp: string;
  const servers: FakeIdeServer[] = [];

  const startServer = async () => {
    const s = new FakeIdeServer();
    await s.start();
    servers.push(s);
    return s;
  };

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-client-restart-'));
    // os.tmpdir() reads these on every call; both the "extension" (port file
    // writer) and the CLI (port file reader) must agree on the directory.
    vi.stubEnv('TMPDIR', tmp);
    vi.stubEnv('TMP', tmp);
    vi.stubEnv('TEMP', tmp);
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: IDE_PID,
      command: 'code',
    });
    // Fresh `gemini` process.
    (IdeClient as unknown as { instancePromise: null }).instancePromise = null;
  });

  afterEach(async () => {
    const ideClient = await IdeClient.getInstance();
    await ideClient.disconnect();
    for (const s of servers.splice(0)) {
      await s.stop({ cleanup: true });
    }
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reconnects to the restarted server although a leaked port file matches the frozen env port', async () => {
    const gen1 = await startServer();
    freezeTerminalEnv(gen1);
    const ideClient = await IdeClient.getInstance();
    // Harness sanity: the initial connection goes through the port file.
    expect(await slashIdeEnable(ideClient)).toBe(IDEConnectionStatus.Connected);

    // Reload Window with the shipped extension: the port file for gen1 leaks.
    await gen1.stop({ cleanup: false });
    const gen2 = await startServer();
    expect(gen2.port).not.toBe(gen1.port);

    // /ide enable — the only live server is gen2 and its port file is there.
    await slashIdeEnable(ideClient);

    // On failure the diff shows the user-facing reason, e.g. "Failed to connect
    // to IDE companion extension in VS Code…" after trying the dead gen1 port.
    expect(ideClient.getConnectionStatus()).toEqual({
      status: IDEConnectionStatus.Connected,
      details: undefined,
    });
    expect(ideClient.isDiffingEnabled()).toBe(true);
  });

  it('keeps a successful reconnection even when the superseded transport reports late errors', async () => {
    const gen1 = await startServer();
    freezeTerminalEnv(gen1);
    const ideClient = await IdeClient.getInstance();
    // Harness sanity: the initial connection goes through the port file.
    expect(await slashIdeEnable(ideClient)).toBe(IDEConnectionStatus.Connected);

    // Reload Window with the fixed extension: clean shutdown, no leaked file.
    await gen1.stop({ cleanup: true });
    const gen2 = await startServer();
    expect(gen2.port).not.toBe(gen1.port);

    // /ide enable right away: discovery finds gen2 only.
    expect(await slashIdeEnable(ideClient)).toBe(IDEConnectionStatus.Connected);

    // The SDK transport of the OLD client now retries its SSE stream against
    // the dead port (1 s, then 1.5 s, then gives up). None of that concerns the
    // new connection.
    await sleep(4_000);

    // On failure the state carries "IDE connection error. The connection was
    // lost unexpectedly…" raised by the superseded client.
    expect(ideClient.getConnectionStatus()).toEqual({
      status: IDEConnectionStatus.Connected,
      details: undefined,
    });
    expect(ideClient.isDiffingEnabled()).toBe(true);
  }, 15_000);

  it('connects past several leaked port files when no env hint is available', async () => {
    // Files left behind by earlier sessions (crash, kill -9, older companion).
    const stale1 = await startServer();
    const stale2 = await startServer();
    await stale1.stop({ cleanup: false });
    await stale2.stop({ cleanup: false });
    const live = await startServer();
    // A terminal opened outside the IDE (or with the collection cleared).
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '');
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', '');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '');

    const ideClient = await IdeClient.getInstance();
    await slashIdeEnable(ideClient);

    expect(ideClient.getConnectionStatus()).toEqual({
      status: IDEConnectionStatus.Connected,
      details: undefined,
    });
    expect(ideClient.isDiffingEnabled()).toBe(true);
    expect(live.port).not.toBe(stale1.port);
  });

  it('still prefers the window the terminal belongs to when several servers are alive', async () => {
    const otherWindow = await startServer();
    const ownWindow = await startServer();
    freezeTerminalEnv(ownWindow);
    const accepted = new Set<number>();
    for (const server of [otherWindow, ownWindow]) {
      server.onSession = () => accepted.add(server.port);
    }

    const ideClient = await IdeClient.getInstance();
    await slashIdeEnable(ideClient);

    expect(ideClient.getConnectionStatus().status).toBe(
      IDEConnectionStatus.Connected,
    );
    expect([...accepted]).toEqual([ownWindow.port]);
  });
});
