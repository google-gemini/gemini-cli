/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ideContext, IdeContextNotificationSchema } from '../ide/ideContext.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [IDEClient]', ...args),
};

export type IDEConnectionState = {
  status: IDEConnectionStatus;
  details?: string;
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
  client: Client | undefined = undefined;
  connectionStatus: IDEConnectionStatus = IDEConnectionStatus.Disconnected;

  constructor() {
    this.connectToMcpServer().catch((err) => {
      logger.debug('Failed to initialize IdeClient:', err);
    });
  }

  getConnectionStatus(): {
    status: IDEConnectionStatus;
    details?: string;
  } {
    let details: string | undefined;
    if (this.connectionStatus === IDEConnectionStatus.Disconnected) {
      if (!process.env['GEMINI_CLI_IDE_SERVER_PORT']) {
        details = 'GEMINI_CLI_IDE_SERVER_PORT environment variable is not set.';
      }
    }
    return {
      status: this.connectionStatus,
      details,
    };
  }

  async connectToMcpServer(): Promise<void> {
    this.connectionStatus = IDEConnectionStatus.Connecting;
    const idePort = process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    if (!idePort) {
      logger.debug(
        'Unable to connect to IDE mode MCP server. GEMINI_CLI_IDE_SERVER_PORT environment variable is not set.',
      );
      this.connectionStatus = IDEConnectionStatus.Disconnected;
      return;
    }

    let transport: StreamableHTTPClientTransport | undefined;
    try {
      this.client = new Client({
        name: 'streamable-http-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });
      transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${idePort}/mcp`),
      );
      await this.client.connect(transport);

      this.client.setNotificationHandler(
        IdeContextNotificationSchema,
        (notification) => {
          ideContext.setIdeContext(notification.params);
        },
      );
      this.client.onerror = (error) => {
        logger.debug('IDE MCP client error:', error);
        this.connectionStatus = IDEConnectionStatus.Disconnected;
        ideContext.clearIdeContext();
      };
      this.client.onclose = () => {
        logger.debug('IDE MCP client connection closed.');
        this.connectionStatus = IDEConnectionStatus.Disconnected;
        ideContext.clearIdeContext();
      };

      this.connectionStatus = IDEConnectionStatus.Connected;
    } catch (error) {
      this.connectionStatus = IDEConnectionStatus.Disconnected;
      logger.debug('Failed to connect to MCP server:', error);
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
