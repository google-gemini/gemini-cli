/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  detectIde,
  DetectedIde,
  getIdeDisplayName,
} from '../ide/detect-ide.js';
import {
  ideContext,
  IdeContextNotificationSchema,
  IdeDiffAcceptedNotificationSchema,
  IdeDiffClosedNotificationSchema,
  CloseDiffResponseSchema,
  DiffUpdateResult,
} from '../ide/ideContext.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [IDEClient]', ...args),
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
  private static instance: IdeClient;
  private client: Client | undefined = undefined;
  private state: IDEConnectionState = {
    status: IDEConnectionStatus.Disconnected,
    details:
      'IDE integration is currently disabled. To enable it, run /ide enable.',
  };
  private readonly currentIde: DetectedIde | undefined;
  private readonly currentIdeDisplayName: string | undefined;
  private diffResponses = new Map<string, (result: DiffUpdateResult) => void>();

  private constructor() {
    this.currentIde = detectIde();
    if (this.currentIde) {
      this.currentIdeDisplayName = getIdeDisplayName(this.currentIde);
    }
  }

  static getInstance(): IdeClient {
    if (!IdeClient.instance) {
      IdeClient.instance = new IdeClient();
    }
    return IdeClient.instance;
  }

  async connect(): Promise<void> {
    this.setState(IDEConnectionStatus.Connecting);

    if (!this.currentIde || !this.currentIdeDisplayName) {
      this.setState(IDEConnectionStatus.Disconnected);
      return;
    }

    if (!this.validateWorkspacePath()) {
      return;
    }

    const port = this.getPortFromEnv();
    if (!port) {
      return;
    }

    await this.establishConnection(port);
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

  async closeDiff(filePath: string): Promise<string | undefined> {
    try {
      const result = await this.client?.callTool({
        name: `closeDiff`,
        arguments: {
          filePath,
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
    const content = await this.closeDiff(filePath);
    const resolver = this.diffResponses.get(filePath);
    if (resolver) {
      if (outcome === 'accepted') {
        resolver({ status: 'accepted', content });
      } else {
        resolver({ status: 'rejected', content: undefined });
      }
      this.diffResponses.delete(filePath);
    }
  }

  disconnect() {
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

  private setState(status: IDEConnectionStatus, details?: string) {
    const isAlreadyDisconnected =
      this.state.status === IDEConnectionStatus.Disconnected &&
      status === IDEConnectionStatus.Disconnected;

    // Only update details if the state wasn't already disconnected, so that
    // the first detail message is preserved.
    if (!isAlreadyDisconnected) {
      this.state = { status, details };
    }

    if (status === IDEConnectionStatus.Disconnected) {
      logger.debug('IDE integration disconnected:', details);
      ideContext.clearIdeContext();
    }
  }

  private validateWorkspacePath(): boolean {
    const ideWorkspacePath = process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
    if (ideWorkspacePath === undefined) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Failed to connect to IDE companion extension for ${this.currentIdeDisplayName}. Please ensure the extension is running and try refreshing your terminal. To install the extension, run /ide install.`,
      );
      return false;
    }
    if (ideWorkspacePath === '') {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `To use this feature, please open a single workspace folder in ${this.currentIdeDisplayName} and try again.`,
      );
      return false;
    }
    if (ideWorkspacePath !== process.cwd()) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Directory mismatch. Gemini CLI is running in a different location than the open workspace in ${this.currentIdeDisplayName}. Please run the CLI from the same directory as your project's root folder.`,
      );
      return false;
    }
    return true;
  }

  private getPortFromEnv(): string | undefined {
    const port = process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    if (!port) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Failed to connect to IDE companion extension for ${this.currentIdeDisplayName}. Please ensure the extension is running and try refreshing your terminal. To install the extension, run /ide install.`,
      );
      return undefined;
    }
    return port;
  }

  private registerClientHandlers() {
    if (!this.client) {
      return;
    }

    this.client.setNotificationHandler(
      IdeContextNotificationSchema,
      (notification) => {
        ideContext.setIdeContext(notification.params);
      },
    );
    this.client.onerror = (_error) => {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`,
      );
    };
    this.client.onclose = () => {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`,
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

  private async establishConnection(port: string) {
    let transport: StreamableHTTPClientTransport | undefined;
    try {
      this.client = new Client({
        name: 'streamable-http-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });
      transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/mcp`),
      );
      await this.client.connect(transport);
      this.registerClientHandlers();
      this.setState(IDEConnectionStatus.Connected);
    } catch (_error) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Failed to connect to IDE companion extension for ${this.currentIdeDisplayName}. Please ensure the extension is running and try refreshing your terminal. To install the extension, run /ide install.`,
      );
      if (transport) {
        try {
          await transport.close();
        } catch (closeError) {
          logger.debug('Failed to close transport:', closeError);
        }
      }
    }
  }
}
