/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { IDE_REQUEST_TIMEOUT_MS } from './constants.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  getConnectionConfigFromFile,
  getIdeServerHost,
  getPortFromEnv,
  getStdioConfigFromEnv,
  validateWorkspacePath,
  createProxyAwareFetch,
  type StdioConfig,
} from './ide-connection-utils.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => debugLogger.debug('[DEBUG] [IDEClient]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => debugLogger.error('[ERROR] [IDEClient]', ...args),
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
        const connectionConfig = client.ideProcessInfo
          ? await getConnectionConfigFromFile(client.ideProcessInfo.pid)
          : undefined;
        client.currentIde = detectIde(
          client.ideProcessInfo,
          connectionConfig?.ideInfo,
        );
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

  async connect(options: { logToConsole?: boolean } = {}): Promise<void> {
    const logError = options.logToConsole ?? true;
    if (!this.currentIde) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: Antigravity, VS Code, or VS Code forks.`,
        false,
      );
      return;
    }

    this.setState(IDEConnectionStatus.Connecting);

    const connectionConfig = this.ideProcessInfo
      ? await getConnectionConfigFromFile(this.ideProcessInfo.pid)
      : undefined;
    const authToken =
      connectionConfig?.authToken ?? process.env['GEMINI_CLI_IDE_AUTH_TOKEN'];

    const workspacePath =
      connectionConfig?.workspacePath ??
      process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

    const { isValid, error } = validateWorkspacePath(
      workspacePath,
      process.cwd(),
    );

    if (!isValid) {
      this.setState(IDEConnectionStatus.Disconnected, error, logError);
      return;
    }

    if (connectionConfig) {
      if (connectionConfig.port) {
        const connected = await this.establishHttpConnection(
          connectionConfig.port,
          authToken,
        );
        if (connected) {
          return;
        }
      }
      if (connectionConfig.stdio) {
        const connected = await this.establishStdioConnection(
          connectionConfig.stdio,
        );
        if (connected) {
          return;
        }
      }
    }

    const portFromEnv = getPortFromEnv();
    if (portFromEnv) {
      const connected = await this.establishHttpConnection(
        portFromEnv,
        authToken,
      );
      if (connected) {
        return;
      }
    }

    const stdioConfigFromEnv = getStdioConfigFromEnv();
    if (stdioConfigFromEnv) {
      const connected = await this.establishStdioConnection(stdioConfigFromEnv);
      if (connected) {
        return;
      }
    }

    this.setState(
      IDEConnectionStatus.Disconnected,
      `Failed to connect to IDE companion extension in ${this.currentIde.displayName}. Please ensure the extension is running. To install the extension, run /ide install.`,
      logError,
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const parsedJson = JSON.parse(textPart.text);
          if (parsedJson && typeof parsedJson.content === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
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

    // For backwards compatibility. Newer extension versions will only send
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

  private async establishHttpConnection(
    port: string,
    authToken: string | undefined,
  ): Promise<boolean> {
    let transport: StreamableHTTPClientTransport | undefined;
    try {
      const ideServerHost = getIdeServerHost();
      const portNumber = parseInt(port, 10);
      // validate port to prevent Server-Side Request Forgery (SSRF) vulnerability
      if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
        return false;
      }
      const serverUrl = `http://${ideServerHost}:${portNumber}/mcp`;
      logger.debug('Attempting to connect to IDE via HTTP SSE');
      logger.debug(`Server URL: ${serverUrl}`);
      this.client = new Client({
        name: 'streamable-http-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });
      transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        fetch: await createProxyAwareFetch(ideServerHost),
        requestInit: {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
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
