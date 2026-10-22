/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reproduction for https://github.com/google-gemini/gemini-cli/issues/21331
 * ("IDE companion extension fails to connect with gVisor (runsc) sandbox").
 *
 * Unlike ide-client.test.ts, this file exercises the REAL connection path:
 * real `ide-connection-utils` (host selection, connection-file discovery,
 * workspace validation), the real MCP client and the real undici `fetch`,
 * against an in-process stand-in for the VS Code companion server that
 * enforces the same gates as packages/vscode-ide-companion/src/ide-server.ts:
 *
 *   - listens on 127.0.0.1 only
 *   - Host allow-list: `localhost:<port>` | `127.0.0.1:<port>` (else 403)
 *   - `Authorization: Bearer <token>` (else 401)
 *   - Streamable-HTTP MCP server exposing openDiff/closeDiff
 *
 * Only two things are faked: the IDE process lookup (walking the `ps` tree
 * under a test runner is meaningless) and the `/.dockerenv` container marker.
 *
 * The "container sandbox" topology reproduces exactly what
 * packages/cli/src/utils/sandbox.ts gives the CLI inside the container:
 * `GEMINI_CLI_IDE_SERVER_PORT`, `GEMINI_CLI_IDE_WORKSPACE_PATH` and
 * `TERM_PROGRAM` are forwarded, `GEMINI_CLI_IDE_AUTH_TOKEN` is not, the host
 * tmpdir (and therefore the connection file) is not visible, and `/.dockerenv`
 * exists. The gVisor-specific part of the issue (netstack's private loopback
 * under `docker --network host`) is a kernel-level behaviour that cannot be
 * modelled in a unit test. The fix — the launcher bridging the connection over
 * `docker exec` stdio — lives in packages/cli (see ideBridge.ts and its test);
 * this file pins down why that bridge is needed and what the CLI tells users
 * when it is absent.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import { getIdeProcessInfo } from './process-utils.js';
import { CloseDiffRequestSchema, OpenDiffRequestSchema } from './types.js';

const containerMarker = vi.hoisted(() => ({ present: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...(actual as object),
    // `getIdeServerHost()` decides it is inside a container when
    // `/.dockerenv` exists. Everything else goes to the real fs.
    existsSync: (p: fs.PathLike) =>
      (containerMarker.present && String(p) === '/.dockerenv') ||
      actual.existsSync(p),
  };
});

vi.mock('./process-utils.js', () => ({
  getIdeProcessInfo: vi.fn(),
}));

interface SeenRequest {
  host: string;
  auth: 'none' | 'bad' | 'ok';
  status: number;
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
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
}

/**
 * Starts a companion-server stand-in on the host loopback and records what
 * it sees, so a failing test can report which gate rejected the CLI.
 */
async function startCompanionStandIn(authToken: string) {
  const seen: SeenRequest[] = [];
  const transports = new Map<string, StreamableHTTPServerTransport>();
  let port = 0;

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    const record: SeenRequest = { host, auth: 'none', status: 0 };
    seen.push(record);
    const reply = (status: number, body: string) => {
      record.status = status;
      res.writeHead(status).end(body);
    };

    // ide-server.ts: Host allow-list
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) {
      reply(403, JSON.stringify({ error: 'Invalid Host header' }));
      return;
    }
    // ide-server.ts: bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      reply(401, 'Unauthorized');
      return;
    }
    const [scheme, token] = authHeader.split(' ');
    record.auth = scheme === 'Bearer' && token === authToken ? 'ok' : 'bad';
    if (record.auth !== 'ok') {
      reply(401, 'Unauthorized');
      return;
    }

    // ide-server.ts: Streamable-HTTP MCP
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    let transport =
      typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
      if (!isInitializeRequest(body)) {
        reply(400, 'Bad Request');
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
        { description: 'stand-in', inputSchema: OpenDiffRequestSchema.shape },
        async () => ({ content: [] }),
      );
      mcp.registerTool(
        'closeDiff',
        { description: 'stand-in', inputSchema: CloseDiffRequestSchema.shape },
        async () => ({ content: [{ type: 'text', text: '{}' }] }),
      );
      await mcp.connect(transport);
    }
    record.status = 200;
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;

  return {
    port,
    seen,
    close: async () => {
      await Promise.allSettled([...transports.values()].map((t) => t.close()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Renders the outcome of a connection attempt as a multi-line report. Tests
 * assert on this string (rather than on the bare status) so that a failure
 * prints the user-facing message and the gate that rejected the CLI.
 */
function describeOutcome(client: IdeClient, seen: SeenRequest[]): string {
  const { status, details } = client.getConnectionStatus();
  let gate: string;
  if (seen.length === 0) {
    gate =
      'gate 2 — the CLI targeted host.docker.internal; the loopback-only ' +
      'companion server never saw a request';
  } else if (seen.some((r) => r.status === 403)) {
    gate = 'gate 3 — Host allow-list rejected the request';
  } else if (seen.some((r) => r.status === 401)) {
    gate = 'gate 4 — missing/invalid bearer token';
  } else {
    gate = 'reached the MCP handler';
  }
  return [
    `IdeClient status: ${status}`,
    `details: ${details ?? ''}`,
    `companion saw ${seen.length} request(s): ${JSON.stringify(seen)}`,
    `=> ${gate}`,
  ].join('\n');
}

const CONNECTED_LINE = new RegExp(
  `^IdeClient status: ${IDEConnectionStatus.Connected}$`,
  'm',
);

async function freshIdeClient(): Promise<IdeClient> {
  (
    IdeClient as unknown as { instancePromise: Promise<IdeClient> | null }
  ).instancePromise = null;
  return IdeClient.getInstance();
}

describe('IdeClient inside a container sandbox (#21331)', () => {
  const AUTH_TOKEN = 'companion-token-for-test';
  let companion: Awaited<ReturnType<typeof startCompanionStandIn>>;
  let emptyTmp: string;
  let client: IdeClient | undefined;

  beforeEach(async () => {
    (getIdeProcessInfo as Mock).mockResolvedValue({
      pid: 4242,
      command: 'code',
    });
    containerMarker.present = false;
    companion = await startCompanionStandIn(AUTH_TOKEN);
    emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-sandbox-test-'));

    // Environment the VS Code integrated terminal provides, minus the pieces
    // each scenario controls below.
    vi.stubEnv('TERM_PROGRAM', 'vscode');
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', String(companion.port));
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', process.cwd());
    // An empty tmpdir: inside the container the host's connection file
    // (/tmp/gemini/ide/*.json) is not visible.
    vi.stubEnv('TMPDIR', emptyTmp);
    for (const name of [
      'GEMINI_CLI_IDE_SERVER_STDIO_COMMAND',
      'GEMINI_CLI_IDE_SERVER_STDIO_ARGS',
      'SSH_CONNECTION',
      'VSCODE_REMOTE_CONTAINERS_SESSION',
      'REMOTE_CONTAINERS',
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'http_proxy',
      'https_proxy',
      'NO_PROXY',
      'no_proxy',
      'SANDBOX',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(async () => {
    await client?.disconnect();
    client = undefined;
    await companion.close();
    fs.rmSync(emptyTmp, { recursive: true, force: true });
    containerMarker.present = false;
    vi.unstubAllEnvs();
  });

  /** Exactly what `start_sandbox` in packages/cli/src/utils/sandbox.ts yields. */
  function enterContainerSandbox() {
    containerMarker.present = true; // the sandbox image has /.dockerenv
    vi.stubEnv('SANDBOX', 'gemini-cli-sandbox'); // Dockerfile: ENV SANDBOX=...
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', ''); // never forwarded
  }

  it('control: connects from the host (integrated-terminal topology)', async () => {
    vi.stubEnv('GEMINI_CLI_IDE_AUTH_TOKEN', AUTH_TOKEN);

    client = await freshIdeClient();
    await client.connect({ logToConsole: false });

    expect(describeOutcome(client, companion.seen)).toMatch(CONNECTED_LINE);
    expect(companion.seen[0]).toMatchObject({
      host: `127.0.0.1:${companion.port}`,
      auth: 'ok',
      status: 200,
    });
    expect(client.isDiffingEnabled()).toBe(true);
  });

  // Why the sandbox launcher bridges the connection over stdio (see
  // packages/cli/src/utils/ideBridge.ts) instead of forwarding the port: a
  // CLI inside a container cannot reach a companion that listens only on the
  // host loopback interface, and under gVisor the loopback is private to the
  // sandbox altogether.
  it('cannot reach a loopback-only companion over a forwarded HTTP port from inside a container', async () => {
    enterContainerSandbox();

    client = await freshIdeClient();
    await client.connect({ logToConsole: false });

    const outcome = describeOutcome(client, companion.seen);
    expect(outcome).not.toMatch(CONNECTED_LINE);
    // Nothing ever passes both the Host and bearer gates.
    expect(companion.seen.every((r) => r.status !== 200)).toBe(true);
  });

  // When the connection cannot succeed inside a sandbox, the message must name
  // the sandbox instead of sending users to `/ide install` for an extension
  // that is installed and running on the host.
  it('tells sandboxed users why the companion is unreachable instead of suggesting /ide install', async () => {
    enterContainerSandbox();

    client = await freshIdeClient();
    await client.connect({ logToConsole: false });

    const outcome = describeOutcome(client, companion.seen);
    expect(outcome).not.toMatch(CONNECTED_LINE);
    expect(outcome).not.toContain('/ide install');
    expect(client.getConnectionStatus().details).toMatch(/inside a sandbox/);
  });

  it('keeps the /ide install advice outside a sandbox', async () => {
    // Host topology, but the extension is not running: nothing advertises a
    // port or workspace, so the CLI should still point at /ide install.
    vi.stubEnv('GEMINI_CLI_IDE_SERVER_PORT', '');
    vi.stubEnv('GEMINI_CLI_IDE_WORKSPACE_PATH', '');
    delete process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

    client = await freshIdeClient();
    await client.connect({ logToConsole: false });

    expect(client.getConnectionStatus().details).toContain('/ide install');
  });
});
