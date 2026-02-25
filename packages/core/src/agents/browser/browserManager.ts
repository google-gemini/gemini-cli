/**
 * @license
 * Copyright 2026 Google LLC
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
import { Storage } from '../../config/storage.js';
import * as path from 'node:path';

// Pin chrome-devtools-mcp version for reproducibility.
const CHROME_DEVTOOLS_MCP_VERSION = '0.17.1';

// Default browser profile directory name within ~/.gemini/
const BROWSER_PROFILE_DIR = 'cli-browser-profile';

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
    const sessionMode = browserConfig.customConfig.sessionMode ?? 'persistent';

    const mcpArgs = [
      '-y',
      `chrome-devtools-mcp@${CHROME_DEVTOOLS_MCP_VERSION}`,
      '--experimental-vision',
    ];

    // Session mode determines how the browser is managed:
    // - "isolated": Temp profile, cleaned up after session (--isolated)
    // - "persistent": Persistent profile at ~/.gemini/cli-browser-profile/ (default)
    // - "existing": Connect to already-running Chrome (--autoConnect, requires
    //   remote debugging enabled at chrome://inspect/#remote-debugging)
    if (sessionMode === 'isolated') {
      mcpArgs.push('--isolated');
    } else if (sessionMode === 'existing') {
      mcpArgs.push('--autoConnect');
    }

    // Add optional settings from config
    if (browserConfig.customConfig.headless) {
      mcpArgs.push('--headless');
    }
    if (browserConfig.customConfig.profilePath) {
      mcpArgs.push('--userDataDir', browserConfig.customConfig.profilePath);
    } else if (sessionMode === 'persistent') {
      // Default persistent profile lives under ~/.gemini/cli-browser-profile
      const defaultProfilePath = path.join(
        Storage.getGlobalGeminiDir(),
        BROWSER_PROFILE_DIR,
      );
      mcpArgs.push('--userDataDir', defaultProfilePath);
    }

    debugLogger.log(
      `Launching chrome-devtools-mcp (${sessionMode} mode) with args: ${mcpArgs.join(' ')}`,
    );

    // Create stdio transport to npx chrome-devtools-mcp.
    // stderr is piped (not inherited) to prevent MCP server banners and
    // warnings from corrupting the UI in alternate buffer mode.
    this.mcpTransport = new StdioClientTransport({
      command: 'npx',
      args: mcpArgs,
      stderr: 'pipe',
    });

    // Forward piped stderr to debugLogger so it's visible with --debug.
    const stderrStream = this.mcpTransport.stderr;
    if (stderrStream) {
      stderrStream.on('data', (chunk: Buffer) => {
        debugLogger.log(
          `[chrome-devtools-mcp stderr] ${chunk.toString().trimEnd()}`,
        );
      });
    }

    this.mcpTransport.onclose = () => {
      debugLogger.error(
        'chrome-devtools-mcp transport closed unexpectedly. ' +
          'The MCP server process may have crashed.',
      );
      this.rawMcpClient = undefined;
    };
    this.mcpTransport.onerror = (error: Error) => {
      debugLogger.error(
        `chrome-devtools-mcp transport error: ${error.message}`,
      );
    };

    // Connect to MCP server — use a shorter timeout for 'existing' mode
    // since it should connect quickly if remote debugging is enabled.
    const connectTimeoutMs =
      sessionMode === 'existing' ? 15_000 : MCP_TIMEOUT_MS;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await this.rawMcpClient!.connect(this.mcpTransport!);
          debugLogger.log('MCP client connected to chrome-devtools-mcp');
          await this.discoverTools();
        })(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out connecting to chrome-devtools-mcp (${connectTimeoutMs}ms)`,
                ),
              ),
            connectTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      await this.close();

      // Provide error-specific, session-mode-aware remediation
      throw this.createConnectionError(
        error instanceof Error ? error.message : String(error),
        sessionMode,
      );
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Creates an Error with context-specific remediation based on the actual
   * error message and the current sessionMode.
   */
  private createConnectionError(message: string, sessionMode: string): Error {
    const lowerMessage = message.toLowerCase();

    // "already running for the current profile" — persistent mode profile lock
    if (lowerMessage.includes('already running')) {
      if (sessionMode === 'persistent' || sessionMode === 'isolated') {
        return new Error(
          `Could not connect to Chrome: ${message}\n\n` +
            `The Chrome profile is locked by another running instance.\n` +
            `To fix this:\n` +
            `  1. Close all Chrome windows using this profile, OR\n` +
            `  2. Set sessionMode to "isolated" in settings.json to use a temporary profile, OR\n` +
            `  3. Set profilePath in settings.json to use a different profile directory`,
        );
      }
      // existing mode — shouldn't normally hit this, but handle gracefully
      return new Error(
        `Could not connect to Chrome: ${message}\n\n` +
          `The Chrome profile is locked.\n` +
          `Close other Chrome instances and try again.`,
      );
    }

    // Timeout errors
    if (lowerMessage.includes('timed out')) {
      if (sessionMode === 'existing') {
        return new Error(
          `Timed out connecting to Chrome: ${message}\n\n` +
            `To use sessionMode "existing", you must:\n` +
            `  1. Open Chrome (version 144+)\n` +
            `  2. Navigate to chrome://inspect/#remote-debugging\n` +
            `  3. Enable remote debugging\n\n` +
            `Alternatively, set sessionMode to "persistent" (default) in settings.json to launch a dedicated browser.`,
        );
      }
      return new Error(
        `Timed out connecting to Chrome: ${message}\n\n` +
          `Possible causes:\n` +
          `  1. Chrome is not installed or not in PATH\n` +
          `  2. npx cannot download chrome-devtools-mcp (check network/proxy)\n` +
          `  3. Chrome failed to start (try setting headless: true in settings.json)`,
      );
    }

    // Generic "existing" mode failures (connection refused, etc.)
    if (sessionMode === 'existing') {
      return new Error(
        `Failed to connect to existing Chrome instance: ${message}\n\n` +
          `To use sessionMode "existing", you must:\n` +
          `  1. Open Chrome (version 144+)\n` +
          `  2. Navigate to chrome://inspect/#remote-debugging\n` +
          `  3. Enable remote debugging\n\n` +
          `Alternatively, set sessionMode to "persistent" (default) in settings.json to launch a dedicated browser.`,
      );
    }

    // Generic fallback — include sessionMode for debugging context
    return new Error(
      `Failed to connect to Chrome (sessionMode: ${sessionMode}): ${message}`,
    );
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
