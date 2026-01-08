/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Manages browser lifecycle for the Browser Agent.
 *
 * Handles:
 * - Browser management via chrome-devtools-mcp with --isolated mode
 * - CDP connection via raw MCP SDK Client (NOT registered in main registry)
 * - Visual tools via --experimental-vision flag
 *
 * IMPORTANT: The MCP client here is ISOLATED from the main agent's tool registry.
 * Tools discovered from chrome-devtools-mcp are NOT registered in the main registry.
 * They are wrapped as DeclarativeTools and passed directly to the browser agent.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';

// Pin chrome-devtools-mcp version for reproducibility
// v0.13.0+ required for --experimental-vision support
const CHROME_DEVTOOLS_MCP_VERSION = '0.13.0';

// Default timeout for MCP operations
const MCP_TIMEOUT_MS = 60_000;

/**
 * Content item from an MCP tool call response.
 * Can be text or image (for take_screenshot).
 */
export interface McpContentItem {
  type: 'text' | 'image';
  text?: string;
  /** Base64-encoded image data (for type='image') */
  data?: string;
  /** MIME type of the image (e.g., 'image/png') */
  mimeType?: string;
}

/**
 * Result from an MCP tool call.
 */
export interface McpToolCallResult {
  content?: McpContentItem[];
  isError?: boolean;
}

/**
 * Manages browser lifecycle and ISOLATED MCP client for the Browser Agent.
 *
 * The browser is launched and managed by chrome-devtools-mcp in --isolated mode.
 * Visual tools (click_at, etc.) are enabled via --experimental-vision flag.
 *
 * Key isolation property: The MCP client here does NOT register tools
 * in the main ToolRegistry. Tools are kept local to the browser agent.
 */
export class BrowserManager {
  // Raw MCP SDK Client - NOT the wrapper McpClient
  private rawMcpClient: Client | undefined;
  private mcpTransport: StdioClientTransport | undefined;
  private discoveredTools: McpTool[] = [];

  constructor(private config: Config) {}

  /**
   * Gets the raw MCP SDK Client for direct tool calls.
   * This client is ISOLATED from the main tool registry.
   */
  async getRawMcpClient(): Promise<Client> {
    if (this.rawMcpClient) {
      return this.rawMcpClient;
    }
    await this.ensureConnection();
    if (!this.rawMcpClient) {
      throw new Error('Failed to initialize chrome-devtools MCP client');
    }
    return this.rawMcpClient;
  }

  /**
   * Gets the tool definitions discovered from the MCP server.
   * These are dynamically fetched from chrome-devtools-mcp.
   */
  async getDiscoveredTools(): Promise<McpTool[]> {
    await this.ensureConnection();
    return this.discoveredTools;
  }

  /**
   * Calls a tool on the MCP server.
   *
   * @param toolName The name of the tool to call
   * @param args Arguments to pass to the tool
   * @param signal Optional AbortSignal to cancel the call
   * @returns The result from the MCP server
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Operation cancelled');
    }

    const client = await this.getRawMcpClient();
    const callPromise = client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: MCP_TIMEOUT_MS },
    );

    // If no signal, just await directly
    if (!signal) {
      return this.toResult(await callPromise);
    }

    // Race the call against the abort signal
    let onAbort: (() => void) | undefined;
    try {
      const result = await Promise.race([
        callPromise,
        new Promise<never>((_resolve, reject) => {
          onAbort = () =>
            reject(signal.reason ?? new Error('Operation cancelled'));
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      return this.toResult(result);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  /**
   * Safely maps a raw MCP SDK callTool response to our typed McpToolCallResult
   * without using unsafe type assertions.
   */
  private toResult(
    raw: Awaited<ReturnType<Client['callTool']>>,
  ): McpToolCallResult {
    return {
      content: Array.isArray(raw.content)
        ? raw.content.map(
            (item: {
              type?: string;
              text?: string;
              data?: string;
              mimeType?: string;
            }) => ({
              type: item.type === 'image' ? 'image' : 'text',
              text: item.text,
              data: item.data,
              mimeType: item.mimeType,
            }),
          )
        : undefined,
      isError: raw.isError === true,
    };
  }

  /**
   * Ensures browser and MCP client are connected.
   */
  async ensureConnection(): Promise<void> {
    if (this.rawMcpClient) {
      return;
    }
    await this.connectMcp();
  }

  /**
   * Closes browser and cleans up connections.
   * The browser process is managed by chrome-devtools-mcp, so closing
   * the transport will terminate the browser.
   */
  async close(): Promise<void> {
    // Close MCP client first
    if (this.rawMcpClient) {
      try {
        await this.rawMcpClient.close();
      } catch (error) {
        debugLogger.error(
          `Error closing MCP client: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.rawMcpClient = undefined;
    }

    // Close transport (this terminates the npx process and browser)
    if (this.mcpTransport) {
      try {
        await this.mcpTransport.close();
      } catch (error) {
        debugLogger.error(
          `Error closing MCP transport: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      this.mcpTransport = undefined;
    }

    this.discoveredTools = [];
  }

  /**
   * Connects to chrome-devtools-mcp which manages the browser process.
   *
   * Spawns npx chrome-devtools-mcp with:
   * - --isolated: Manages its own browser instance
   * - --experimental-vision: Enables visual tools (click_at, etc.)
   *
   * IMPORTANT: This does NOT use McpClientManager and does NOT register
   * tools in the main ToolRegistry. The connection is isolated to this
   * BrowserManager instance.
   */
  private async connectMcp(): Promise<void> {
    debugLogger.log('Connecting isolated MCP client to chrome-devtools-mcp...');

    // Create raw MCP SDK Client (not the wrapper McpClient)
    this.rawMcpClient = new Client(
      {
        name: 'gemini-cli-browser-agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    // Build args for chrome-devtools-mcp
    const browserConfig = this.config.getBrowserAgentConfig();
    const sessionMode = browserConfig.customConfig.sessionMode ?? 'isolated';

    const mcpArgs = [
      '-y',
      `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}`,
      sessionMode === 'existing' ? '--existing' : '--isolated',
      '--experimental-vision',
    ];

    // Add optional settings from config
    if (browserConfig.customConfig.headless) {
      mcpArgs.push('--headless');
    }
    if (browserConfig.customConfig.chromeProfilePath) {
      mcpArgs.push(
        '--profile-path',
        browserConfig.customConfig.chromeProfilePath,
      );
    }

    debugLogger.log(
      `Launching chrome-devtools-mcp (${sessionMode} mode) with args: ${mcpArgs.join(' ')}`,
    );

    // Create stdio transport to npx chrome-devtools-mcp
    this.mcpTransport = new StdioClientTransport({
      command: 'npx',
      args: mcpArgs,
    });

    // Connect to MCP server
    await this.rawMcpClient.connect(this.mcpTransport);
    debugLogger.log('MCP client connected to chrome-devtools-mcp');

    // Discover tools from the MCP server
    await this.discoverTools();
  }

  /**
   * Discovers tools from the connected MCP server.
   */
  private async discoverTools(): Promise<void> {
    if (!this.rawMcpClient) {
      throw new Error('MCP client not connected');
    }

    const response = await this.rawMcpClient.listTools();
    this.discoveredTools = response.tools;

    debugLogger.log(
      `Discovered ${this.discoveredTools.length} tools from chrome-devtools-mcp: ` +
        this.discoveredTools.map((t) => t.name).join(', '),
    );
  }
}
