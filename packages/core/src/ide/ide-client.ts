/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { isSubpath } from '../utils/paths.js';
import { detectIde, type DetectedIde, getIdeInfo } from '../ide/detect-ide.js';
import type { DiffUpdateResult } from '../ide/ideContext.js';
import {
  ideContext,
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffClosedNotificationSchema,
  CloseDiffResponseSchema,
} from '../ide/ideContext.js';
import { getIdeProcessInfo } from './process-utils.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as os from 'node:os';
import * as path from 'node:path';
import { EnvHttpProxyAgent } from 'undici';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [IDEClient]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR] [IDEClient]', ...args),
};

export type IDEConnectionState = {
  status: IDEConnectionStatus;
  details?: string; // User-facing
};

export enum IDEConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
}

type StdioConfig = {
  command: string;
  args: string[];
};

type ConnectionConfig = {
  port?: string;
  stdio?: StdioConfig;
};

function getRealPath(path: string): string {
  try {
    return fs.realpathSync(path);
  } catch (_e) {
    // If realpathSync fails, it might be because the path doesn't exist.
    // In that case, we can fall back to the original path.
    return path;
  }
}

/**
 * Manages the connection to and interaction with the IDE server.
 */
export class IdeClient {
  private static instancePromise: Promise<IdeClient> | null = null;
  private client: Client | undefined = undefined;
  private state: IDEConnectionState = {
    status: IDEConnectionStatus.Disconnected,
    details:
      'IDE integration is currently disabled. To enable it, run /ide enable.',
  };
  private currentIde: DetectedIde | undefined;
  private currentIdeDisplayName: string | undefined;
  private ideProcessInfo: { pid: number; command: string } | undefined;
  private diffResponses = new Map<string, (result: DiffUpdateResult) => void>();
  private statusListeners = new Set<(state: IDEConnectionState) => void>();
  private trustChangeListeners = new Set<(isTrusted: boolean) => void>();

  private constructor() {}

  static getInstance(): Promise<IdeClient> {
    if (!IdeClient.instancePromise) {
      IdeClient.instancePromise = (async () => {
        const client = new IdeClient();
        client.ideProcessInfo = await getIdeProcessInfo();
        client.currentIde = detectIde(client.ideProcessInfo);
        if (client.currentIde) {
          client.currentIdeDisplayName = getIdeInfo(
            client.currentIde,
          ).displayName;
        }
        return client;
      })();
    }
    return IdeClient.instancePromise;
  }

  addStatusChangeListener(listener: (state: IDEConnectionState) => void) {
    this.statusListeners.add(listener);
  }

  removeStatusChangeListener(listener: (state: IDEConnectionState) => void) {
    this.statusListeners.delete(listener);
  }

  addTrustChangeListener(listener: (isTrusted: boolean) => void) {
    this.trustChangeListeners.add(listener);
  }

  removeTrustChangeListener(listener: (isTrusted: boolean) => void) {
    this.trustChangeListeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (!this.currentIde || !this.currentIdeDisplayName) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: VS Code or VS Code forks`,
        false,
      );
      return;
    }

    this.setState(IDEConnectionStatus.Connecting);

    const configFromFile = await this.getConnectionConfigFromFile();
    const workspacePath =
      configFromFile?.workspacePath ??
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

    const { isValid, error } = IdeClient.validateWorkspacePath(
      workspacePath,
      this.currentIdeDisplayName,
      process.cwd(),
    );

    if (!isValid) {
      this.setState(IDEConnectionStatus.Disconnected, error, true);
      return;
    }

    if (configFromFile) {
      if (configFromFile.port) {
        const connected = await this.establishHttpConnection(
          configFromFile.port,
        );
        if (connected) {
          return;
        }
      }
      if (configFromFile.stdio) {
        const connected = await this.establishStdioConnection(
          configFromFile.stdio,
        );
        if (connected) {
          return;
        }
      }
    }

    const portFromEnv = this.getPortFromEnv();
    if (portFromEnv) {
      const connected = await this.establishHttpConnection(portFromEnv);
      if (connected) {
        return;
      }
    }

    const stdioConfigFromEnv = this.getStdioConfigFromEnv();
    if (stdioConfigFromEnv) {
      const connected = await this.establishStdioConnection(stdioConfigFromEnv);
      if (connected) {
        return;
      }
    }

    this.setState(
      IDEConnectionStatus.Disconnected,
      `Failed to connect to IDE companion extension in ${this.currentIdeDisplayName}. Please ensure the extension is running. To install the extension, run /ide install.`,
      true,
    );
  }

  /**
   * A diff is accepted with any modifications if the user performs one of the
   * following actions:
   * - Clicks the checkbox icon in the IDE to accept
   * - Runs `command+shift+p` > "Gemini CLI: Accept Diff in IDE" to accept
   * - Selects "accept" in the CLI UI
   * - Saves the file via `ctrl/command+s`
   *
   * A diff is rejected if the user performs one of the following actions:
   * - Clicks the "x" icon in the IDE
   * - Runs "Gemini CLI: Close Diff in IDE"
   * - Selects "no" in the CLI UI
   * - Closes the file
   */
  async openDiff(
    filePath: string,
    newContent?: string,
  ): Promise<DiffUpdateResult> {
    return new Promise<DiffUpdateResult>((resolve, reject) => {
      this.diffResponses.set(filePath, resolve);
      this.client
        ?.callTool({
          name: `openDiff`,
          arguments: {
            filePath,
            newContent,
          },
        })
        .catch((err) => {
          logger.debug(`callTool for ${filePath} failed:`, err);
          reject(err);
        });
    });
  }

  async closeDiff(
    filePath: string,
    options?: { suppressNotification?: boolean },
  ): Promise<string | undefined> {
    try {
      const result = await this.client?.callTool({
        name: `closeDiff`,
        arguments: {
          filePath,
          suppressNotification: options?.suppressNotification,
        },
      });

      if (result) {
        const parsed = CloseDiffResponseSchema.parse(result);
        return parsed.content;
      }
    } catch (err) {
      logger.debug(`callTool for ${filePath} failed:`, err);
    }
    return;
  }

  // Closes the diff. Instead of waiting for a notification,
  // manually resolves the diff resolver as the desired outcome.
  async resolveDiffFromCli(filePath: string, outcome: 'accepted' | 'rejected') {
    const resolver = this.diffResponses.get(filePath);
    const content = await this.closeDiff(filePath, {
      // Suppress notification to avoid race where closing the diff rejects the
      // request.
      suppressNotification: true,
    });

    if (resolver) {
      if (outcome === 'accepted') {
        resolver({ status: 'accepted', content });
      } else {
        resolver({ status: 'rejected', content: undefined });
      }
      this.diffResponses.delete(filePath);
    }
  }

  async disconnect() {
    if (this.state.status === IDEConnectionStatus.Disconnected) {
      return;
    }
    for (const filePath of this.diffResponses.keys()) {
      await this.closeDiff(filePath);
    }
    this.diffResponses.clear();
    this.setState(
      IDEConnectionStatus.Disconnected,
      'IDE integration disabled. To enable it again, run /ide enable.',
    );
    this.client?.close();
  }

  getCurrentIde(): DetectedIde | undefined {
    return this.currentIde;
  }

  getConnectionStatus(): IDEConnectionState {
    return this.state;
  }

  getDetectedIdeDisplayName(): string | undefined {
    return this.currentIdeDisplayName;
  }

  private setState(
    status: IDEConnectionStatus,
    details?: string,
    logToConsole = false,
  ) {
    const isAlreadyDisconnected =
      this.state.status === IDEConnectionStatus.Disconnected &&
      status === IDEConnectionStatus.Disconnected;

    // Only update details & log to console if the state wasn't already
    // disconnected, so that the first detail message is preserved.
    if (!isAlreadyDisconnected) {
      this.state = { status, details };
      for (const listener of this.statusListeners) {
        listener(this.state);
      }
      if (details) {
        if (logToConsole) {
          logger.error(details);
        } else {
          // We only want to log disconnect messages to debug
          // if they are not already being logged to the console.
          logger.debug(details);
        }
      }
    }

    if (status === IDEConnectionStatus.Disconnected) {
      ideContext.clearIdeContext();
    }
  }

  static validateWorkspacePath(
    ideWorkspacePath: string | undefined,
    currentIdeDisplayName: string | undefined,
    cwd: string,
  ): { isValid: boolean; error?: string } {
    if (ideWorkspacePath === undefined) {
      return {
        isValid: false,
        error: `Failed to connect to IDE companion extension in ${currentIdeDisplayName}. Please ensure the extension is running. To install the extension, run /ide install.`,
      };
    }

    if (ideWorkspacePath === '') {
      return {
        isValid: false,
        error: `To use this feature, please open a workspace folder in ${currentIdeDisplayName} and try again.`,
      };
    }

    const ideWorkspacePaths = ideWorkspacePath.split(path.delimiter);
    const realCwd = getRealPath(cwd);
    const isWithinWorkspace = ideWorkspacePaths.some((workspacePath) => {
      const idePath = getRealPath(workspacePath);
      return isSubpath(idePath, realCwd);
    });

    if (!isWithinWorkspace) {
      return {
        isValid: false,
        error: `Directory mismatch. Gemini CLI is running in a different location than the open workspace in ${currentIdeDisplayName}. Please run the CLI from one of the following directories: ${ideWorkspacePaths.join(
          ', ',
        )}`,
      };
    }
    return { isValid: true };
  }

  private getPortFromEnv(): string | undefined {
    const port = process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    if (!port) {
      return undefined;
    }
    return port;
  }

  private getStdioConfigFromEnv(): StdioConfig | undefined {
    const command = process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'];
    if (!command) {
      return undefined;
    }

    const argsStr = process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'];
    let args: string[] = [];
    if (argsStr) {
      try {
        const parsedArgs = JSON.parse(argsStr);
        if (Array.isArray(parsedArgs)) {
          args = parsedArgs;
        } else {
          logger.error(
            'GEMINI_CLI_IDE_SERVER_STDIO_ARGS must be a JSON array string.',
          );
        }
      } catch (e) {
        logger.error('Failed to parse GEMINI_CLI_IDE_SERVER_STDIO_ARGS:', e);
      }
    }

    return { command, args };
  }

  private async getConnectionConfigFromFile(): Promise<
    (ConnectionConfig & { workspacePath?: string }) | undefined
  > {
    if (!this.ideProcessInfo) {
      return {};
    }
    try {
      const portFile = path.join(
        os.tmpdir(),
        `gemini-ide-server-${this.ideProcessInfo.pid}.json`,
      );
      const portFileContents = await fs.promises.readFile(portFile, 'utf8');
      return JSON.parse(portFileContents);
    } catch (_) {
      return undefined;
    }
  }

  private createProxyAwareFetch() {
    // ignore proxy for 'localhost' by deafult to allow connecting to the ide mcp server
    const existingNoProxy = process.env['NO_PROXY'] || '';
    const agent = new EnvHttpProxyAgent({
      noProxy: [existingNoProxy, 'localhost'].filter(Boolean).join(','),
    });
    const undiciPromise = import('undici');
    return async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const { fetch: fetchFn } = await undiciPromise;
      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        ...init,
        dispatcher: agent,
      };
      const options = fetchOptions as unknown as import('undici').RequestInit;
      const response = await fetchFn(url, options);
      return new Response(response.body as ReadableStream<unknown> | null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  private registerClientHandlers() {
    if (!this.client) {
      return;
    }

    this.client.setNotificationHandler(
      IdeContextNotificationSchema,
      (notification) => {
        ideContext.setIdeContext(notification.params);
        const isTrusted = notification.params.workspaceState?.isTrusted;
        if (isTrusted !== undefined) {
          for (const listener of this.trustChangeListeners) {
            listener(isTrusted);
          }
        }
      },
    );
    this.client.onerror = (_error) => {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`,
        true,
      );
    };
    this.client.onclose = () => {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`,
        true,
      );
    };
    this.client.setNotificationHandler(
      IdeDiffAcceptedNotificationSchema,
      (notification) => {
        const { filePath, content } = notification.params;
        const resolver = this.diffResponses.get(filePath);
        if (resolver) {
          resolver({ status: 'accepted', content });
          this.diffResponses.delete(filePath);
        } else {
          logger.debug(`No resolver found for ${filePath}`);
        }
      },
    );

    this.client.setNotificationHandler(
      IdeDiffClosedNotificationSchema,
      (notification) => {
        const { filePath } = notification.params;
        const resolver = this.diffResponses.get(filePath);
        if (resolver) {
          resolver({ status: 'rejected', content: undefined });
          this.diffResponses.delete(filePath);
        } else {
          logger.debug(`No resolver found for ${filePath}`);
        }
      },
    );
  }

  private async establishHttpConnection(port: string): Promise<boolean> {
    let transport: StreamableHTTPClientTransport | undefined;
    try {
      logger.debug('Attempting to connect to IDE via HTTP SSE');
      this.client = new Client({
        name: 'streamable-http-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });
      transport = new StreamableHTTPClientTransport(
        new URL(`http://${getIdeServerHost()}:${port}/mcp`),
        {
          fetch: this.createProxyAwareFetch(),
        },
      );
      await this.client.connect(transport);
      this.registerClientHandlers();
      this.setState(IDEConnectionStatus.Connected);
      return true;
    } catch (_error) {
      if (transport) {
        try {
          await transport.close();
        } catch (closeError) {
          logger.debug('Failed to close transport:', closeError);
        }
      }
      return false;
    }
  }

  private async establishStdioConnection({
    command,
    args,
  }: StdioConfig): Promise<boolean> {
    let transport: StdioClientTransport | undefined;
    try {
      logger.debug('Attempting to connect to IDE via stdio');
      this.client = new Client({
        name: 'stdio-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });

      transport = new StdioClientTransport({
        command,
        args,
      });
      await this.client.connect(transport);
      this.registerClientHandlers();
      this.setState(IDEConnectionStatus.Connected);
      return true;
    } catch (_error) {
      if (transport) {
        try {
          await transport.close();
        } catch (closeError) {
          logger.debug('Failed to close transport:', closeError);
        }
      }
      return false;
    }
  }
}

function getIdeServerHost() {
  const isInContainer =
    fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
  return isInContainer ? 'host.docker.internal' : 'localhost';
}
