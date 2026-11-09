/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Host-side half of the sandbox IDE bridge.
 *
 * The IDE companion extension listens on the host loopback interface and
 * authenticates every request with a per-window bearer token. Neither is
 * available from inside a container sandbox: the loopback interface is the
 * container's own (under gVisor it is entirely private to the sandbox), and
 * the token is deliberately never forwarded because it would let untrusted
 * sandboxed code talk to the IDE directly.
 *
 * Instead, the host launcher process (which already runs inside the IDE's
 * integrated terminal and can reach the companion) acts as a broker:
 *
 * ```text
 *  host                                     container
 *  ┌─────────────────────────────┐          ┌─────────────────────────────┐
 *  │ IDE companion (127.0.0.1)   │          │ gemini (CLI)                │
 *  │        ▲ Streamable HTTP    │          │   │ stdio MCP               │
 *  │        │ + bearer token     │          │   ▼                         │
 *  │ IdeBridge (this file)       │          │ ide-bridge.js connect       │
 *  │   MCP server over stdio ────┼─ exec ───┼─► ide-bridge.js serve       │
 *  └─────────────────────────────┘   pipe   └─────────────────────────────┘
 * ```
 *
 * The broker relays only what IDE integration needs: `tools/list`,
 * `tools/call` for `openDiff`/`closeDiff` with `filePath` inside the IDE
 * workspace, and the `ide/*` notifications sent by the companion. The token
 * never crosses into the container, and the relay only exists for the
 * lifetime of the sandboxed session. Because the channel is an exec pipe and
 * an in-container Unix socket, it does not depend on container networking at
 * all, which is what makes it work under gVisor (runsc).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import type { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Request,
  type Result,
} from '@modelcontextprotocol/sdk/types.js';
import {
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffClosedNotificationSchema,
  IdeDiffRejectedNotificationSchema,
  createProxyAwareFetch,
  debugLogger,
  getConnectionConfigFromFile,
  getIdeProcessInfo,
  getPortFromEnv,
  getVersion,
  isSubpath,
} from '@google/gemini-cli-core';
import { IDE_BRIDGE_READY_MARKER } from './ideBridgeHelper.js';

const logger = {
  debug: (...args: unknown[]) => debugLogger.debug('[IdeBridge]', ...args),
  warn: (...args: unknown[]) => debugLogger.warn('[IdeBridge]', ...args),
};

/** IDE tools the sandboxed CLI may invoke through the bridge. */
const ALLOWED_TOOLS: ReadonlySet<string> = new Set(['openDiff', 'closeDiff']);

const FORWARDED_NOTIFICATIONS = [
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffRejectedNotificationSchema,
  IdeDiffClosedNotificationSchema,
] as const;

type ForwardedNotification = z.infer<(typeof FORWARDED_NOTIFICATIONS)[number]>;

/** Per-attempt time allowed for `exec` to start the helper and report ready. */
const HELPER_START_TIMEOUT_MS = 10_000;
/** Total time to keep retrying `exec` while the container is starting. */
const ATTACH_TIMEOUT_MS = 60_000;
const ATTACH_RETRY_DELAY_MS = 250;

export interface IdeBridgeUpstream {
  /** Companion server port on the host loopback interface. */
  port: string;
  /** Bearer token for the companion server. Stays on the host. */
  authToken?: string;
  /** Absolute IDE workspace folders; `openDiff`/`closeDiff` are confined to them. */
  workspacePaths: string[];
}

/**
 * Resolves the companion connection exactly as the un-sandboxed CLI would:
 * the connection file written by the extension first, then the environment
 * the integrated terminal provides.
 */
export async function resolveIdeBridgeUpstream(): Promise<
  IdeBridgeUpstream | undefined
> {
  let fromFile: Awaited<ReturnType<typeof getConnectionConfigFromFile>>;
  try {
    const ideProcessInfo = await getIdeProcessInfo();
    fromFile = ideProcessInfo
      ? await getConnectionConfigFromFile(ideProcessInfo.pid)
      : undefined;
  } catch (error) {
    // Discovery must never prevent the sandbox from starting.
    logger.debug('IDE connection discovery failed:', error);
    fromFile = undefined;
  }

  const port =
    fromFile?.port !== undefined ? String(fromFile.port) : getPortFromEnv();
  if (!port) {
    return undefined;
  }

  const workspacePath =
    fromFile?.workspacePath ?? process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
  const workspacePaths = (workspacePath ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((p) => path.resolve(p));

  return {
    port,
    authToken: fromFile?.authToken ?? process.env['GEMINI_CLI_IDE_AUTH_TOKEN'],
    workspacePaths,
  };
}

export interface IdeBridgeOptions {
  upstream: IdeBridgeUpstream;
  /** Where the launcher placed the helper script, as seen from the container. */
  helperPathInContainer: string;
  /** Unix socket the helper serves inside the container. */
  socketPathInContainer: string;
}

export interface IdeBridgeAttachOptions {
  /**
   * Command prefix that runs a program inside the sandbox with piped stdio,
   * e.g. `['docker', 'exec', '-i', '--user', '1000:1000', '<container>']`.
   * The bridge appends `node <helper> serve <socket>`.
   */
  execCommand: string[];
  /** Lets the retry loop stop once the sandbox has exited. */
  isSandboxAlive: () => boolean;
}

export class IdeBridge {
  private upstreamInfo: IdeBridgeUpstream;
  private upstream: Client | undefined;
  private upstreamConnecting: Promise<Client> | undefined;
  private everConnected = false;
  private downstream:
    | Server<Request, ForwardedNotification, Result>
    | undefined;
  private downstreamTransport: StdioServerTransport | undefined;
  private helper: ChildProcess | undefined;
  private attachOptions: IdeBridgeAttachOptions | undefined;
  private attaching: Promise<void> | undefined;
  /** Replayed to a (re)connecting CLI, which otherwise misses the initial update. */
  private lastContextUpdate: ForwardedNotification | undefined;
  private stopped = false;

  constructor(private readonly options: IdeBridgeOptions) {
    this.upstreamInfo = options.upstream;
  }

  get upstreamPort(): string {
    return this.upstreamInfo.port;
  }

  /**
   * Connects to the IDE companion on the host. Rejects when the companion is
   * unreachable, in which case the launcher simply does not set the bridge up
   * and the sandboxed CLI reports the IDE as unavailable.
   */
  async connectUpstream(): Promise<void> {
    await this.ensureUpstream();
  }

  /** Returns the live companion client, (re)connecting if necessary. */
  private ensureUpstream(): Promise<Client> {
    if (this.upstream) {
      return Promise.resolve(this.upstream);
    }
    if (!this.upstreamConnecting) {
      this.upstreamConnecting = this.openUpstream().finally(() => {
        this.upstreamConnecting = undefined;
      });
    }
    return this.upstreamConnecting;
  }

  private async openUpstream(): Promise<Client> {
    if (this.everConnected) {
      // After an IDE restart (for example VS Code's "Reload Window") the
      // extension writes a new port and token to its connection file while
      // this process's environment still carries the old ones. Re-resolve so
      // `/ide enable` inside the sandbox finds the new server, like the
      // un-sandboxed CLI does.
      try {
        const fresh = await resolveIdeBridgeUpstream();
        if (fresh) {
          this.upstreamInfo = fresh;
        }
      } catch (error) {
        logger.debug('could not re-resolve the IDE companion:', error);
      }
    }
    const { port, authToken } = this.upstreamInfo;
    const portNumber = parseInt(port, 10);
    if (
      !Number.isInteger(portNumber) ||
      portNumber <= 0 ||
      portNumber > 65535
    ) {
      throw new Error(`Invalid IDE companion port: ${port}`);
    }
    const host = '127.0.0.1';
    const client = new Client({
      name: 'gemini-cli-sandbox-ide-bridge',
      version: await getVersion(),
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://${host}:${portNumber}/mcp`),
      {
        fetch: await createProxyAwareFetch(host),
        requestInit: {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      },
    );

    for (const schema of FORWARDED_NOTIFICATIONS) {
      client.setNotificationHandler(schema, (notification) => {
        if (notification.method === 'ide/contextUpdate') {
          this.lastContextUpdate = notification;
        }
        void this.forwardToSandbox(notification);
      });
    }
    // The un-sandboxed CLI treats any transport error as a lost connection
    // and asks the user to run `/ide enable`; mirror that for the sandbox.
    client.onclose = () => {
      logger.debug('IDE companion connection closed');
      void this.dropUpstream(client);
    };
    client.onerror = (error) => {
      logger.debug('IDE companion connection error:', error);
      void this.dropUpstream(client);
    };

    await client.connect(transport);
    this.upstream = client;
    this.everConnected = true;
    logger.debug(`connected to IDE companion on ${host}:${portNumber}`);
    return client;
  }

  /**
   * Forgets a dead companion client, closes the sandbox session so the CLI
   * inside reports the disconnect, and keeps the helper available so that a
   * later `/ide enable` can reconnect through a fresh upstream connection.
   */
  private async dropUpstream(client: Client): Promise<void> {
    if (this.upstream !== client) {
      return;
    }
    this.upstream = undefined;
    try {
      await client.close();
    } catch {
      // already gone
    }
    await this.detach();
    void this.reattach();
  }

  /**
   * Runs an upstream request, reconnecting once when the failure is a
   * transport error (companion restarted or gone) rather than an error the
   * companion itself returned.
   */
  private async withUpstream<T>(
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await this.getUpstream();
    try {
      return await fn(client);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      logger.debug('IDE companion request failed; reconnecting:', error);
      await this.dropUpstream(client);
      return fn(await this.getUpstream());
    }
  }

  private async getUpstream(): Promise<Client> {
    try {
      return await this.ensureUpstream();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(
        ErrorCode.InternalError,
        `The IDE companion is not reachable from the host: ${message}`,
      );
    }
  }

  /**
   * Execs the helper into the (possibly still starting) container and serves
   * the bridged MCP endpoint over its stdio. Resolves once attached, or once
   * the sandbox exits or the attach deadline passes.
   */
  async attach(options: IdeBridgeAttachOptions): Promise<void> {
    this.attachOptions = options;
    if (!this.attaching) {
      this.attaching = this.attachLoop(options).finally(() => {
        this.attaching = undefined;
      });
    }
    return this.attaching;
  }

  private async attachLoop(options: IdeBridgeAttachOptions): Promise<void> {
    const deadline = Date.now() + ATTACH_TIMEOUT_MS;
    while (!this.stopped) {
      if (!options.isSandboxAlive()) {
        logger.debug('sandbox exited before the IDE bridge attached');
        return;
      }
      const helper = await this.startHelper(options);
      if (this.stopped) {
        helper?.kill();
        return;
      }
      if (helper) {
        this.helper = helper;
        await this.serve(helper);
        return;
      }
      if (Date.now() > deadline) {
        logger.warn(
          'could not start the IDE bridge helper inside the sandbox; IDE integration is unavailable in this session',
        );
        return;
      }
      await delay(ATTACH_RETRY_DELAY_MS);
    }
  }

  /** Re-execs the helper after it (or the companion) went away mid-session. */
  private async reattach(): Promise<void> {
    const options = this.attachOptions;
    if (this.stopped || this.helper || !options || !options.isSandboxAlive()) {
      return;
    }
    await this.attach(options);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.detach();
    const upstream = this.upstream;
    this.upstream = undefined;
    try {
      await upstream?.close();
    } catch (error) {
      logger.debug('error closing IDE companion connection:', error);
    }
  }

  /**
   * Runs `<execCommand...> node <helper> serve <socket>` and waits for the
   * ready marker. Returns undefined when that fails (typically because the
   * container is not running yet) so the caller can retry.
   */
  private startHelper(
    options: IdeBridgeAttachOptions,
  ): Promise<ChildProcess | undefined> {
    const [command, ...prefix] = options.execCommand;
    if (!command) {
      return Promise.resolve(undefined);
    }
    const args = [
      ...prefix,
      'node',
      this.options.helperPathInContainer,
      'serve',
      this.options.socketPathInContainer,
    ];
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let settled = false;
      let stderr = '';
      // Start-up listeners only; serve() installs its own once attached.
      const onData = (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.includes(IDE_BRIDGE_READY_MARKER)) {
          settle(child);
        }
      };
      const onFailure = () => settle(undefined);
      const settle = (result: ChildProcess | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stderr?.off('data', onData);
        child.off('error', onFailure);
        child.off('exit', onFailure);
        if (!result) {
          child.kill();
          if (stderr.trim()) {
            logger.debug(`helper exec failed: ${stderr.trim()}`);
          }
        }
        resolve(result);
      };
      const timer = setTimeout(
        () => settle(undefined),
        HELPER_START_TIMEOUT_MS,
      );
      child.stderr?.on('data', onData);
      child.on('error', onFailure);
      child.on('exit', onFailure);
    });
  }

  private async serve(helper: ChildProcess): Promise<void> {
    if (!helper.stdout || !helper.stdin) {
      throw new Error('IDE bridge helper has no stdio pipes');
    }
    const server = new Server<Request, ForwardedNotification, Result>(
      { name: 'gemini-cli-sandbox-ide-bridge', version: await getVersion() },
      { capabilities: { tools: {}, logging: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const { tools } = await this.withUpstream((client) => client.listTools());
      return { tools: tools.filter((tool) => ALLOWED_TOOLS.has(tool.name)) };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      if (!ALLOWED_TOOLS.has(name)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Tool '${name}' is not available from inside the sandbox`,
        );
      }
      this.assertWithinWorkspace(args?.['filePath']);
      return this.withUpstream((client) =>
        client.callTool({ name, arguments: args }, CallToolResultSchema),
      );
    });

    server.oninitialized = () => {
      logger.debug('sandboxed CLI connected through the IDE bridge');
      void this.ensureUpstream()
        .then(() => {
          if (this.lastContextUpdate) {
            return this.forwardToSandbox(this.lastContextUpdate);
          }
          return undefined;
        })
        .catch((error: unknown) => {
          logger.debug('IDE companion unavailable for the new session:', error);
        });
    };

    helper.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text && text !== IDE_BRIDGE_READY_MARKER) {
        logger.debug(`helper: ${text}`);
      }
    });
    helper.on('exit', (code, signal) => {
      logger.debug(`helper exited (code=${code}, signal=${signal})`);
      if (this.helper === helper) {
        // Unexpected: not one of our own detach() calls.
        void this.detach().then(() => this.reattach());
      }
    });

    const transport = new StdioServerTransport(helper.stdout, helper.stdin);
    await server.connect(transport);
    this.downstream = server;
    this.downstreamTransport = transport;
    logger.debug('IDE bridge attached to the sandbox');
  }

  /**
   * `openDiff`/`closeDiff` take host paths. The sandbox mounts the project at
   * its host path, so the check is the same one the IDE workspace implies:
   * the file must live under one of the workspace folders. Anything else
   * (sandboxed code probing for arbitrary host files) is refused here, on the
   * host, before it reaches the IDE.
   */
  private assertWithinWorkspace(filePath: unknown): void {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'filePath must be an absolute path',
      );
    }
    const resolved = path.resolve(filePath);
    const allowed = this.upstreamInfo.workspacePaths.some((workspace) =>
      isSubpath(workspace, resolved),
    );
    if (!allowed) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Refusing to open '${filePath}' from inside the sandbox: it is outside the IDE workspace`,
      );
    }
  }

  private async forwardToSandbox(
    notification: ForwardedNotification,
  ): Promise<void> {
    const downstream = this.downstream;
    if (!downstream) {
      return;
    }
    try {
      await downstream.notification(notification);
    } catch (error) {
      logger.debug(`could not forward ${notification.method}:`, error);
    }
  }

  private async detach(): Promise<void> {
    const transport = this.downstreamTransport;
    const helper = this.helper;
    this.downstream = undefined;
    this.downstreamTransport = undefined;
    this.helper = undefined;
    try {
      await transport?.close();
    } catch (error) {
      logger.debug('error closing bridge transport:', error);
    }
    if (helper && helper.exitCode === null && helper.signalCode === null) {
      helper.kill();
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
