/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { tmpdir } from '@google/gemini-cli-core';
import {
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffRejectedNotificationSchema,
  OpenDiffRequestSchema,
  CloseDiffRequestSchema,
} from '@google/gemini-cli-core/src/ide/types.js';
import type { z } from 'zod';
import { startHttpTransport } from './transport-http.js';
import { startStdioTransport } from './transport-stdio.js';

const IDE_INFO = { name: 'neovim', displayName: 'Neovim' };
const BRIDGE_DIR = path.join(tmpdir(), 'gemini', 'ide', 'neovim');
const CONTEXT_FILE = path.join(BRIDGE_DIR, 'context.json');
const REQUEST_DIR = path.join(BRIDGE_DIR, 'requests');
const RESPONSE_DIR = path.join(BRIDGE_DIR, 'responses');
const CONNECTION_DIR = path.join(tmpdir(), 'gemini', 'ide');

const MCP_SESSION_POLL_MS = 250;

type NotificationTransport = {
  send: (message: JSONRPCMessage) => Promise<void>;
};

type DiffResponse = {
  id: string;
  filePath: string;
  status: 'accepted' | 'rejected';
  content?: string;
};

async function ensureDirs(): Promise<void> {
  await fs.mkdir(REQUEST_DIR, { recursive: true });
  await fs.mkdir(RESPONSE_DIR, { recursive: true });
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return isRecord(error) && 'code' in error;
}

function isDiffResponse(value: unknown): value is DiffResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== 'string') {
    return false;
  }
  if (typeof value.filePath !== 'string') {
    return false;
  }
  if (value.status !== 'accepted' && value.status !== 'rejected') {
    return false;
  }
  if (
    value.status === 'accepted' &&
    value.content !== undefined &&
    typeof value.content !== 'string'
  ) {
    return false;
  }
  return true;
}

class BridgeWatcher {
  private lastContextMtime = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly broadcast: (notification: JSONRPCMessage) => Promise<void>,
    private readonly log: (message: string) => void,
  ) {}

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.poll();
    }, MCP_SESSION_POLL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async poll() {
    await this.pollContext();
    await this.pollDiffResponses();
  }

  private async pollContext() {
    try {
      const stats = await fs.stat(CONTEXT_FILE);
      if (stats.mtimeMs === this.lastContextMtime) {
        return;
      }
      this.lastContextMtime = stats.mtimeMs;
      const context = await readJsonFile(CONTEXT_FILE);
      if (!context) {
        return;
      }
      const notification = IdeContextNotificationSchema.parse({
        jsonrpc: '2.0',
        method: 'ide/contextUpdate',
        params: context,
      });
      await this.broadcast(notification);
    } catch (error) {
      // Ignore missing context file.
      if (!isErrnoException(error) || error.code !== 'ENOENT') {
        this.log(`Failed to read context: ${String(error)}`);
      }
    }
  }

  private async pollDiffResponses() {
    let files: string[] = [];
    try {
      files = await fs.readdir(RESPONSE_DIR);
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'ENOENT') {
        this.log(`Failed to read response dir: ${String(error)}`);
      }
      return;
    }

    for (const file of files) {
      if (!file.startsWith('diff-response-') || !file.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(RESPONSE_DIR, file);
      const response = await readJsonFile(filePath);
      if (!isDiffResponse(response)) {
        continue;
      }
      if (response.status === 'accepted') {
        const notification = IdeDiffAcceptedNotificationSchema.parse({
          jsonrpc: '2.0',
          method: 'ide/diffAccepted',
          params: {
            filePath: response.filePath,
            content: response.content ?? '',
          },
        });
        await this.broadcast(notification);
      } else {
        const notification = IdeDiffRejectedNotificationSchema.parse({
          jsonrpc: '2.0',
          method: 'ide/diffRejected',
          params: {
            filePath: response.filePath,
          },
        });
        await this.broadcast(notification);
      }
      await fs.unlink(filePath);
    }
  }
}

function createMcpServer(
  writeDiffRequest: (filePath: string, newContent: string) => Promise<void>,
  writeCloseRequest: (
    filePath: string,
    suppressNotification?: boolean,
  ) => Promise<void>,
): McpServer {
  const server = new McpServer(
    {
      name: 'gemini-cli-neovim-ide-companion',
      version: '0.1.0',
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'openDiff',
    {
      description:
        '(IDE Tool) Open a diff view to create or modify a file. Returns a notification once the diff has been accepted or rejected.',
      inputSchema: OpenDiffRequestSchema.shape,
    },
    async ({ filePath, newContent }: z.infer<typeof OpenDiffRequestSchema>) => {
      await writeDiffRequest(filePath, newContent);
      return { content: [] };
    },
  );

  server.registerTool(
    'closeDiff',
    {
      description: '(IDE Tool) Close an open diff view for a specific file.',
      inputSchema: CloseDiffRequestSchema.shape,
    },
    async (params: z.infer<typeof CloseDiffRequestSchema>) => {
      await writeCloseRequest(params.filePath, params.suppressNotification);
      const response = { content: null };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response),
          },
        ],
      };
    },
  );

  return server;
}

async function writeDiscoveryFile({
  port,
  authToken,
  workspacePath,
  stdio,
}: {
  port: number;
  authToken: string;
  workspacePath: string;
  stdio?: { command: string; args?: string[] };
}): Promise<void> {
  await fs.mkdir(CONNECTION_DIR, { recursive: true });
  const idePid = process.ppid || process.pid;
  const filePath = path.join(
    CONNECTION_DIR,
    `gemini-ide-server-${idePid}-${port}.json`,
  );
  const content = {
    port,
    authToken,
    workspacePath,
    ideInfo: IDE_INFO,
    ...(stdio ? { stdio } : {}),
  };
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8');
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Ignore chmod failures on unsupported platforms.
  }
}

export async function runSidecar(): Promise<void> {
  await ensureDirs();

  const args = new Set(process.argv.slice(2));
  const useStdio = args.has('--stdio');
  const useHttp = args.has('--http') || !useStdio;

  const workspacePath =
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] || process.cwd();
  const authToken = process.env['GEMINI_CLI_IDE_AUTH_TOKEN'] || randomUUID();

  const log = (message: string) => {
    if (process.env['GEMINI_CLI_NEOVIM_SIDE_CAR_DEBUG']) {
      // eslint-disable-next-line no-console
      console.error(`[neovim-ide-companion] ${message}`);
    }
  };

  const transports = new Set<NotificationTransport>();
  const broadcast = async (notification: JSONRPCMessage) => {
    await Promise.all(
      Array.from(transports).map((transport) => transport.send(notification)),
    );
  };

  const writeDiffRequest = async (filePath: string, newContent: string) => {
    const id = randomUUID();
    const requestPath = path.join(REQUEST_DIR, `diff-request-${id}.json`);
    await writeJsonFile(requestPath, {
      id,
      filePath,
      newContent,
    });
  };

  const writeCloseRequest = async (
    filePath: string,
    suppressNotification?: boolean,
  ) => {
    const id = randomUUID();
    const requestPath = path.join(REQUEST_DIR, `diff-close-${id}.json`);
    await writeJsonFile(requestPath, {
      id,
      filePath,
      suppressNotification: !!suppressNotification,
      type: 'close',
    });
  };

  const mcpServer = createMcpServer(writeDiffRequest, writeCloseRequest);

  const bridgeWatcher = new BridgeWatcher(broadcast, log);
  bridgeWatcher.start();

  if (useHttp) {
    const stdioCommand = process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'];
    const stdioArgsRaw = process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'];
    let stdio:
      | {
          command: string;
          args?: string[];
        }
      | undefined;
    if (stdioCommand) {
      let parsedArgs: string[] | undefined;
      if (stdioArgsRaw) {
        try {
          const value = JSON.parse(stdioArgsRaw);
          if (Array.isArray(value)) {
            parsedArgs = value.map((arg) => String(arg));
          }
        } catch {
          // Ignore invalid args.
        }
      }
      stdio = { command: stdioCommand, args: parsedArgs };
    }

    const httpServer = await startHttpTransport({
      mcpServer,
      authToken,
      onTransportAdded: (transport) => transports.add(transport),
      onTransportClosed: (transport) => transports.delete(transport),
      log,
    });
    await writeDiscoveryFile({
      port: httpServer.port,
      authToken,
      workspacePath,
      stdio,
    });
  }

  if (useStdio) {
    const transport = await startStdioTransport(mcpServer);
    transports.add(transport);
  }

  process.on('SIGINT', () => {
    bridgeWatcher.stop();
    process.exit(0);
  });
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  runSidecar();
}
