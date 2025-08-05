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
    details: "IDE integration is currently disabled. To enable it, run /ide enable."
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
    if (!this.currentIde) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        'Not running in a supported IDE, skipping connection.',
      );
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
    this.client?.close();
    this.setState(IDEConnectionStatus.Disconnected, 'IDE integration disabled. To enable it again, run /ide enable.');
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
    this.state = { status, details };

    if (status === IDEConnectionStatus.Disconnected) {
      logger.debug('IDE integration is disconnected. ', details);
      ideContext.clearIdeContext();
    }
  }

  private getPortFromEnv(): string | undefined {
    const port = process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    if (!port) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        'Gemini CLI Companion extension not found. Install via /ide install and restart the CLI in a fresh terminal window.',
      );
      return undefined;
    }
    return port;
  }

  private validateWorkspacePath(): boolean {
    const ideWorkspacePath = process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];
    if (!ideWorkspacePath) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        'IDE integration requires a single workspace folder to be open in the IDE. Please ensure one folder is open and try again.',
      );
      return false;
    }
    if (ideWorkspacePath !== process.cwd()) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Gemini CLI is running in a different directory (${process.cwd()}) from the IDE's open workspace (${ideWorkspacePath}). Please run Gemini CLI in the same directory.`,
      );
      return false;
    }
    return true;
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
      this.setState(IDEConnectionStatus.Disconnected, 'Client error.');
    };

    this.client.onclose = () => {
      this.setState(IDEConnectionStatus.Disconnected, 'Connection closed.');
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

      this.registerClientHandlers();

      await this.client.connect(transport);

      this.setState(IDEConnectionStatus.Connected);
    } catch (error) {
      this.setState(
        IDEConnectionStatus.Disconnected,
        `Failed to connect to IDE server: ${error}`,
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
