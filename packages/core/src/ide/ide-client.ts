/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { isSubpath } from '../utils/paths.js';
import { detectIde, type IdeInfo } from '../ide/detect-ide.js';
import { ideContextStore } from './ideContext.js';
import {
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffClosedNotificationSchema,
  IdeDiffRejectedNotificationSchema,
} from './types.js';
import { getIdeProcessInfo } from './process-utils.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import * as os from 'node:os';
import * as path from 'node:path';
import { EnvHttpProxyAgent } from 'undici';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { IDE_REQUEST_TIMEOUT_MS } from './constants.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [IDEClient]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR] [IDEClient]', ...args),
};

export type DiffUpdateResult =
  | {
      status: 'accepted';
      content?: string;
    }
  | {
      status: 'rejected';
      content: undefined;
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
  authToken?: string;
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
  private currentIde: IdeInfo | undefined;
  private ideProcessInfo: { pid: number; command: string } | undefined;
  private authToken: string | undefined;
  private diffResponses = new Map<string, (result: DiffUpdateResult) => void>();
  private statusListeners = new Set<(state: IDEConnectionState) => void>();
  private trustChangeListeners = new Set<(isTrusted: boolean) => void>();
  private availableTools: string[] = [];
  /**
   * A mutex to ensure that only one diff view is open in the IDE at a time.
   * This prevents race conditions and UI issues in IDEs like VSCode that
   * can't handle multiple diff views being opened simultaneously.
   */
  private diffMutex = Promise.resolve();

  private constructor() {}

  static getInstance(): Promise<IdeClient> {
    if (!IdeClient.instancePromise) {
      IdeClient.instancePromise = (async () => {
        const client = new IdeClient();
        client.ideProcessInfo = await getIdeProcessInfo();
        client.currentIde = detectIde(client.ideProcessInfo);
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
    if (!this.currentIde) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: VS Code or VS Code forks`,
        false,
      );
      return;
    }

    this.setState(IDEConnectionStatus.Connecting);

    const configFromFile = await this.getConnectionConfigFromFile();
    if (configFromFile?.authToken) {
      this.authToken = configFromFile.authToken;
    }
    const workspacePath =
      configFromFile?.workspacePath ??
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

    const { isValid, error } = IdeClient.validateWorkspacePath(
      workspacePath,
      this.currentIde.displayName,
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
      `Failed to connect to IDE companion extension in ${this.currentIde.displayName}. Please ensure the extension is running. To install the extension, run /ide install.`,
      true,
    );
  }

  /**
   * Opens a diff view in the IDE, allowing the user to review and accept or
   * reject changes.
   *
   * This method sends a request to the IDE to display a diff between the
   * current content of a file and the new content provided. It then waits for
   * a notification from the IDE indicating that the user has either accepted
   * (potentially with manual edits) or rejected the diff.
   *
   * A mutex ensures that only one diff view can be open at a time to prevent
   * race conditions.
   *
   * @param filePath The absolute path to the file to be diffed.
   * @param newContent The proposed new content for the file.
   * @returns A promise that resolves with a `DiffUpdateResult`, indicating
   *   whether the diff was 'accepted' or 'rejected' and including the final
   *   content if accepted.
   */
  async openDiff(
    filePath: string,
    newContent: string,
  ): Promise<DiffUpdateResult> {
    const release = await this.acquireMutex();

    const promise = new Promise<DiffUpdateResult>((resolve, reject) => {
      if (!this.client) {
        // The promise will be rejected, and the finally block below will release the mutex.
        return reject(new Error('IDE client is not connected.'));
      }
      this.diffResponses.set(filePath, resolve);
      this.client
        .request(
          {
            method: 'tools/call',
            params: {
              name: `openDiff`,
              arguments: {
                filePath,
                newContent,
              },
            },
          },
          CallToolResultSchema,
          { timeout: IDE_REQUEST_TIMEOUT_MS },
        )
        .then((parsedResultData) => {
          if (parsedResultData.isError) {
            const textPart = parsedResultData.content.find(
              (part) => part.type === 'text',
            );
            const errorMessage =
              textPart?.text ?? `Tool 'openDiff' reported an error.`;
            logger.debug(
              `Request for openDiff ${filePath} failed with isError:`,
              errorMessage,
            );
            this.diffResponses.delete(filePath);
            reject(new Error(errorMessage));
          }
        })
        .catch((err) => {
          logger.debug(`Request for openDiff ${filePath} failed:`, err);
          this.diffResponses.delete(filePath);
          reject(err);
        });
    });

    // Ensure the mutex is released only after the diff interaction is complete.
    promise.finally(release);

    return promise;
  }

  /**
   * Acquires a lock to ensure sequential execution of critical sections.
   *
   * This method implements a promise-based mutex. It works by chaining promises.
   * Each call to `acquireMutex` gets the current `diffMutex` promise. It then
   * creates a *new* promise (`newMutex`) that will be resolved when the caller
   * invokes the returned `release` function. The `diffMutex` is immediately
   * updated to this `newMutex`.
   *
   * The method returns a promise that resolves with the `release` function only
   * *after* the *previous* `diffMutex` promise has resolved. This creates a
   * queue where each subsequent operation must wait for the previous one to release
   * the lock.
   *
   * @returns A promise that resolves to a function that must be called to
   *   release the lock.
   */
  private acquireMutex(): Promise<() => void> {
    let release: () => void;
    const newMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    const oldMutex = this.diffMutex;
    this.diffMutex = newMutex;
    return oldMutex.then(() => release);
  }

  async closeDiff(
    filePath: string,
    options?: { suppressNotification?: boolean },
  ): Promise<string | undefined> {
    try {
      if (!this.client) {
        return undefined;
      }
      const resultData = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: `closeDiff`,
            arguments: {
              filePath,
              suppressNotification: options?.suppressNotification,
            },
          },
        },
        CallToolResultSchema,
        { timeout: IDE_REQUEST_TIMEOUT_MS },
      );

      if (!resultData) {
        return undefined;
      }

      if (resultData.isError) {
        const textPart = resultData.content.find(
          (part) => part.type === 'text',
        );
        const errorMessage =
          textPart?.text ?? `Tool 'closeDiff' reported an error.`;
        logger.debug(
          `Request for closeDiff ${filePath} failed with isError:`,
          errorMessage,
        );
        return undefined;
      }

      const textPart = resultData.content.find((part) => part.type === 'text');

      if (textPart?.text) {
        try {
          const parsedJson = JSON.parse(textPart.text);
          if (parsedJson && typeof parsedJson.content === 'string') {
            return parsedJson.content;
          }
          if (parsedJson && parsedJson.content === null) {
            return undefined;
          }
        } catch (_e) {
          logger.debug(
            `Invalid JSON in closeDiff response for ${filePath}:`,
            textPart.text,
          );
        }
      }
    } catch (err) {
      logger.debug(`Request for closeDiff ${filePath} failed:`, err);
    }
    return undefined;
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

  getCurrentIde(): IdeInfo | undefined {
    return this.currentIde;
  }

  getConnectionStatus(): IDEConnectionState {
    return this.state;
  }

  getDetectedIdeDisplayName(): string | undefined {
    return this.currentIde?.displayName;
  }

  isDiffingEnabled(): boolean {
    return (
      !!this.client &&
      this.state.status === IDEConnectionStatus.Connected &&
      this.availableTools.includes('openDiff') &&
      this.availableTools.includes('closeDiff')
    );
  }

  private async discoverTools(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      logger.debug('Discovering tools from IDE...');
      const response = await this.client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
      );

      // Map the array of tool objects to an array of tool names (strings)
      this.availableTools = response.tools.map((tool) => tool.name);

      if (this.availableTools.length > 0) {
        logger.debug(
          `Discovered ${this.availableTools.length} tools from IDE: ${this.availableTools.join(', ')}`,
        );
      } else {
        logger.debug(
          'IDE supports tool discovery, but no tools are available.',
        );
      }
    } catch (error) {
      // It's okay if this fails, the IDE might not support it.
      // Don't log an error if the method is not found, which is a common case.
      if (
        error instanceof Error &&
        !error.message?.includes('Method not found')
      ) {
        logger.error(`Error discovering tools from IDE: ${error.message}`);
      } else {
        logger.debug('IDE does not support tool discovery.');
      }
      this.availableTools = [];
    }
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
      ideContextStore.clear();
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
      return undefined;
    }

    // For backwards compatability
    try {
      const portFile = path.join(
        os.tmpdir(),
        `gemini-ide-server-${this.ideProcessInfo.pid}.json`,
      );
      const portFileContents = await fs.promises.readFile(portFile, 'utf8');
      return JSON.parse(portFileContents);
    } catch (_) {
      // For newer extension versions, the file name matches the pattern
      // /^gemini-ide-server-${pid}-\d+\.json$/. If multiple IDE
      // windows are open, multiple files matching the pattern are expected to
      // exist.
    }

    const portFileDir = path.join(os.tmpdir(), 'gemini', 'ide');
    let portFiles;
    try {
      portFiles = await fs.promises.readdir(portFileDir);
    } catch (e) {
      logger.debug('Failed to read IDE connection directory:', e);
      return undefined;
    }

    const fileRegex = new RegExp(
      `^gemini-ide-server-${this.ideProcessInfo.pid}-\\d+\\.json$`,
    );
    const matchingFiles = portFiles
      .filter((file) => fileRegex.test(file))
      .sort();
    if (matchingFiles.length === 0) {
      return undefined;
    }

    let fileContents: string[];
    try {
      fileContents = await Promise.all(
        matchingFiles.map((file) =>
          fs.promises.readFile(path.join(portFileDir, file), 'utf8'),
        ),
      );
    } catch (e) {
      logger.debug('Failed to read IDE connection config file(s):', e);
      return undefined;
    }
    const parsedContents = fileContents.map((content) => {
      try {
        return JSON.parse(content);
      } catch (e) {
        logger.debug('Failed to parse JSON from config file: ', e);
        return undefined;
      }
    });

    const validWorkspaces = parsedContents.filter((content) => {
      if (!content) {
        return false;
      }
      const { isValid } = IdeClient.validateWorkspacePath(
        content.workspacePath,
        this.currentIde?.displayName,
        process.cwd(),
      );
      return isValid;
    });

    if (validWorkspaces.length === 0) {
      return undefined;
    }

    if (validWorkspaces.length === 1) {
      return validWorkspaces[0];
    }

    const portFromEnv = this.getPortFromEnv();
    if (portFromEnv) {
      const matchingPort = validWorkspaces.find(
        (content) => String(content.port) === portFromEnv,
      );
      if (matchingPort) {
        return matchingPort;
      }
    }

    return validWorkspaces[0];
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
        ideContextStore.set(notification.params);
        const isTrusted = notification.params.workspaceState?.isTrusted;
        if (isTrusted !== undefined) {
          for (const listener of this.trustChangeListeners) {
            listener(isTrusted);
          }
        }
      },
    );
    this.client.onerror = (_error) => {
      const errorMessage = _error instanceof Error ? _error.message : `_error`;
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable\n${errorMessage}`,
        true,
      );
    };
    this.client.onclose = () => {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection closed. To reconnect, run /ide enable.`,
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
      IdeDiffRejectedNotificationSchema,
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

    // For backwards compatability. Newer extension versions will only send
    // IdeDiffRejectedNotificationSchema.
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
          requestInit: {
            headers: this.authToken
              ? { Authorization: `Bearer ${this.authToken}` }
              : {},
          },
        },
      );
      await this.client.connect(transport);
      this.registerClientHandlers();
      await this.discoverTools();
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
      await this.discoverTools();
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
