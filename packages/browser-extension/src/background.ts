/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserContextManager } from './browser-context-manager.js';

const GEMINI_CLI_PORT = 'gemini-cli-port';
const MCP_SERVER_PORT = 'mcp-server-port';

class BrowserMcpServer {
  private mcpServer: McpServer;
  private contextManager: BrowserContextManager;
  private connections = new Map<string, chrome.runtime.Port>();

  constructor() {
    this.contextManager = new BrowserContextManager();
    this.mcpServer = new McpServer(
      {
        name: 'gemini-cli-browser-companion',
        version: '0.1.15',
      },
      { capabilities: { logging: {} } },
    );

    this.setupPortCommunication();
    this.setupContextUpdates();
  }

  private setupPortCommunication() {
    // Listen for connections from Gemini CLI
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === GEMINI_CLI_PORT) {
        const sessionId = this.generateSessionId();
        this.connections.set(sessionId, port);

        port.onMessage.addListener((message) => {
          this.handleMcpMessage(sessionId, message);
        });

        port.onDisconnect.addListener(() => {
          this.connections.delete(sessionId);
          console.log(`Gemini CLI session disconnected: ${sessionId}`);
        });

        console.log(`Gemini CLI connected: ${sessionId}`);
        this.sendInitialContext(sessionId);
      }
    });

    // Listen for external connections (from MCP transport)
    chrome.runtime.onConnectExternal.addListener((port) => {
      if (port.name === MCP_SERVER_PORT) {
        const sessionId = this.generateSessionId();
        this.connections.set(sessionId, port);

        port.onMessage.addListener((message) => {
          this.handleMcpMessage(sessionId, message);
        });

        port.onDisconnect.addListener(() => {
          this.connections.delete(sessionId);
        });
      }
    });
  }

  private setupContextUpdates() {
    this.contextManager.onContextChange((context) => {
      // Broadcast context updates to all connected clients
      for (const [sessionId, port] of this.connections) {
        try {
          port.postMessage({
            type: 'context-update',
            data: context,
          });
        } catch (error) {
          console.error(`Failed to send context update to ${sessionId}:`, error);
          this.connections.delete(sessionId);
        }
      }
    });
  }

  private handleMcpMessage(sessionId: string, message: unknown) {
    // Handle MCP protocol messages
    // This would integrate with the MCP server when needed
    console.log(`Received MCP message from ${sessionId}:`, message);
  }

  private sendInitialContext(sessionId: string) {
    const port = this.connections.get(sessionId);
    if (port) {
      try {
        port.postMessage({
          type: 'initial-context',
          data: this.contextManager.getCurrentContext(),
        });
      } catch (error) {
        console.error(`Failed to send initial context to ${sessionId}:`, error);
      }
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }
}

// Initialize the MCP server
const browserMcpServer = new BrowserMcpServer();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Gemini CLI Browser Companion installed');
    // Open the welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html'),
    });
  }
});

// Export for potential use in other parts of the extension
export { browserMcpServer };