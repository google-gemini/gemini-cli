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
import { ideContext, IdeContextNotificationSchema } from '../ide/ideContext.js';
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
