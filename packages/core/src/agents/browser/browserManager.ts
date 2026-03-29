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
import { coreEvents } from '../../utils/events.js';
import type { Config } from '../../config/config.js';
import { Storage } from '../../config/storage.js';
import { getBrowserConsentIfNeeded } from '../../utils/browserConsent.js';
import { injectInputBlocker } from './inputBlocker.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { injectAutomationOverlay } from './automationOverlay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default browser profile directory name within ~/.gemini/
const BROWSER_PROFILE_DIR = 'cli-browser-profile';

// Default timeout for MCP operations
const MCP_TIMEOUT_MS = 60_000;

// Maximum reconnection attempts before giving up
const MAX_RECONNECT_RETRIES = 3;

// Base delay (ms) for exponential backoff between reconnection attempts
const RECONNECT_BASE_DELAY_MS = 500;

/**
 * Tools that can cause a full-page navigation (explicitly or implicitly).
 *
 * When any of these completes successfully, the current page DOM is replaced
 * and the injected automation overlay is lost. BrowserManager re-injects the
 * overlay after every successful call to one of these tools.
 *
 * Note: chrome-devtools-mcp is a pure request/response server and emits no
 * MCP notifications, so listening for page-load events via the protocol is
 * not possible. Intercepting at callTool() is the equivalent mechanism.
 */
const POTENTIALLY_NAVIGATING_TOOLS = new Set([
  'click', // clicking a link navigates
  'click_at', // coordinate click can also follow a link
  'navigate_page',
  'new_page',
  'select_page', // switching pages can lose the overlay
  'press_key', // Enter on a focused link/form triggers navigation
  'handle_dialog', // confirming beforeunload can trigger navigation
]);

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
  // --- Static singleton management ---
  private static instances = new Map<string, BrowserManager>();

  /**
   * Returns the cache key for a given config.
   * Uses `sessionMode:profilePath` so different profiles get separate instances.
   */
  private static getInstanceKey(config: Config): string {
    const browserConfig = config.getBrowserAgentConfig();
    const sessionMode = browserConfig.customConfig.sessionMode ?? 'persistent';
    const profilePath = browserConfig.customConfig.profilePath ?? 'default';
    return `${sessionMode}:${profilePath}`;
  }

  /**
   * Returns an existing BrowserManager for the current config's session mode
   * and profile, or creates a new one.
   */
  static getInstance(config: Config): BrowserManager {
    const key = BrowserManager.getInstanceKey(config);
    let instance = BrowserManager.instances.get(key);
    if (!instance) {
      instance = new BrowserManager(config);
      BrowserManager.instances.set(key, instance);
      debugLogger.log(`Created new BrowserManager singleton (key: ${key})`);
    } else {
      debugLogger.log(
        `Reusing existing BrowserManager singleton (key: ${key})`,
      );
    }
    return instance;
  }

  /**
   * Closes all cached BrowserManager instances and clears the cache.
   * Called on /clear commands and CLI exit.
   */
  static async resetAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(BrowserManager.instances.values()).map((instance) =>
        instance.close(),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        debugLogger.error(
          `Error during BrowserManager cleanup: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        );
      }
    }
    BrowserManager.instances.clear();
  }

  /**
   * Alias for resetAll — used by CLI exit cleanup for clarity.
   */
  static async closeAll(): Promise<void> {
    await BrowserManager.resetAll();
  }

  // --- Instance state ---
  // Raw MCP SDK Client - NOT the wrapper McpClient
  private rawMcpClient: Client | undefined;
  private mcpTransport: StdioClientTransport | undefined;
  private discoveredTools: McpTool[] = [];
  private disconnected = false;
  private connectionPromise: Promise<void> | undefined;

  /** State for action rate limiting */
  private actionCounter = 0;
  private readonly maxActionsPerTask: number;

  /**
   * Whether to inject the automation overlay.
   * Always false in headless mode (no visible window to decorate).
   */
  private readonly shouldInjectOverlay: boolean;
  private readonly shouldDisableInput: boolean;

  constructor(private config: Config) {
    const browserConfig = config.getBrowserAgentConfig();
    this.shouldInjectOverlay = !browserConfig?.customConfig?.headless;
    this.shouldDisableInput = config.shouldDisableBrowserUserInput();
    this.maxActionsPerTask =
      browserConfig?.customConfig.maxActionsPerTask ?? 100;
  }

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

    // Hard enforcement of per-action rate limit
    if (this.actionCounter > this.maxActionsPerTask) {
      const error = new Error(
        `Browser agent reached maximum action limit (${this.maxActionsPerTask}). ` +
          `Task terminated to prevent runaway execution. To config the limit, use maxActionsPerTask in the settings.`,
      );
      throw error;
    }
    this.actionCounter++;

    const errorMessage = this.checkNavigationRestrictions(toolName, args);
    if (errorMessage) {
      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }

    const client = await this.getRawMcpClient();
    const callPromise = client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: MCP_TIMEOUT_MS },
    );

    let result: McpToolCallResult;

    // If no signal, just await directly
    if (!signal) {
      result = this.toResult(await callPromise);
    } else {
      // Race the call against the abort signal
      let onAbort: (() => void) | undefined;
      try {
        const raw = await Promise.race([
          callPromise,
          new Promise<never>((_resolve, reject) => {
            onAbort = () =>
              reject(signal.reason ?? new Error('Operation cancelled'));
            signal.addEventListener('abort', onAbort, { once: true });
          }),
        ]);
        result = this.toResult(raw);
      } finally {
        if (onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    }

    // Re-inject the automation overlay and input blocker after tools that
    // can cause a full-page navigation. chrome-devtools-mcp emits no MCP
    // notifications, so callTool() is the only interception point.
    //
    // The input blocker injection is idempotent: the injected function
    // reuses the existing DOM element when present and only recreates
    // it when navigation has actually replaced the page DOM.
    if (
      !result.isError &&
      POTENTIALLY_NAVIGATING_TOOLS.has(toolName) &&
      !signal?.aborted
    ) {
      try {
        if (this.shouldInjectOverlay) {
          await injectAutomationOverlay(this, signal);
        }
        if (this.shouldDisableInput) {
          await injectInputBlocker(this, signal);
        }
      } catch {
        // Never let overlay/blocker failures interrupt the tool result
      }
    }

    return result;
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
   * Returns whether the MCP client is currently connected and healthy.
   */
  isConnected(): boolean {
    return this.rawMcpClient !== undefined && !this.disconnected;
  }

  /**
   * Ensures browser and MCP client are connected.
   * If a previous connection was lost (e.g., user closed the browser),
   * this will reconnect with exponential backoff (up to MAX_RECONNECT_RETRIES).
   *
   * Concurrent callers share a single in-flight connection promise so that
   * two subagents racing at startup do not trigger duplicate connectMcp() calls.
   */
  async ensureConnection(): Promise<void> {
    // Already connected and healthy — nothing to do
    if (this.rawMcpClient && !this.disconnected) {
      return;
    }

    // A connection is already being established — wait for it instead of racing
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // If previously connected but transport died, clean up before reconnecting
    if (this.disconnected) {
      debugLogger.log(
        'Previous browser connection was lost. Cleaning up before reconnecting...',
      );
      await this.close();
      this.disconnected = false;
    }

    // Start connecting; store the promise so concurrent callers can join it
    this.connectionPromise = this.connectWithRetry().finally(() => {
      this.connectionPromise = undefined;
    });

    return this.connectionPromise;
  }

  /**
   * Connects to chrome-devtools-mcp with exponential backoff retry.
   */
  private async connectWithRetry(): Promise<void> {
    // Request browser consent if needed (first-run privacy notice)
    const consentGranted = await getBrowserConsentIfNeeded();
    if (!consentGranted) {
      throw new Error(
        'Browser agent requires user consent to proceed. ' +
          'Please re-run and accept the privacy notice.',
      );
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RECONNECT_RETRIES; attempt++) {
      try {
        await this.connectMcp();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RECONNECT_RETRIES - 1) {
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);
          debugLogger.log(
            `Connection attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError!;
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

    // Close transport (this terminates the browser)
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
    this.connectionPromise = undefined;
  }

  /**
   * Connects to chrome-devtools-mcp which manages the browser process.
   *
   * Spawns node with the bundled chrome-devtools-mcp.mjs.
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

    const mcpArgs = ['--experimental-vision'];

    // Session mode determines how the browser is managed:
    // - "isolated": Temp profile, cleaned up after session (--isolated)
    // - "persistent": Persistent profile at ~/.gemini/cli-browser-profile/ (default)
    // - "existing": Connect to already-running Chrome (--autoConnect, requires
    //   remote debugging enabled at chrome://inspect/#remote-debugging)
    if (sessionMode === 'isolated') {
      mcpArgs.push('--isolated');
    } else if (sessionMode === 'existing') {
      mcpArgs.push('--autoConnect');
      const message =
        '🔒 Browsing with your signed-in Chrome profile — cookies and saved logins will be visible to the agent.';
      coreEvents.emitFeedback('info', message);
      coreEvents.emitConsoleLog('info', message);
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

    // Respect the user's privacy.usageStatisticsEnabled setting
    if (!this.config.getUsageStatisticsEnabled()) {
      mcpArgs.push('--no-usage-statistics', '--no-performance-crux');
    }

    if (
      browserConfig.customConfig.allowedDomains &&
      browserConfig.customConfig.allowedDomains.length > 0
    ) {
      const exclusionRules = browserConfig.customConfig.allowedDomains
        .map((domain) => {
          if (!/^(\*\.)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/.test(domain)) {
            throw new Error(`Invalid domain in allowedDomains: ${domain}`);
          }
          return `EXCLUDE ${domain}`;
        })
        .join(', ');
      mcpArgs.push(
        `--chromeArg="--host-rules=MAP * 127.0.0.1, ${exclusionRules}, EXCLUDE 127.0.0.1"`,
      );
    }

    debugLogger.log(
      `Launching bundled chrome-devtools-mcp (${sessionMode} mode) with args: ${mcpArgs.join(' ')}`,
    );

    // Create stdio transport to the bundled chrome-devtools-mcp.
    // stderr is piped (not inherited) to prevent MCP server banners and
    // warnings from corrupting the UI in alternate buffer mode.
    let bundleMcpPath = path.resolve(
      __dirname,
      'bundled/chrome-devtools-mcp.mjs',
    );
    if (!fs.existsSync(bundleMcpPath)) {
      bundleMcpPath = path.resolve(
        __dirname,
        __dirname.includes(`${path.sep}dist${path.sep}`)
          ? '../../../bundled/chrome-devtools-mcp.mjs'
          : '../../../dist/bundled/chrome-devtools-mcp.mjs',
      );
    }

    this.mcpTransport = new StdioClientTransport({
      command: 'node',
      args: [bundleMcpPath, ...mcpArgs],
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
      this.disconnected = true;
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
          this.registerInputBlockerHandler();
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
          `  2. Chrome failed to start (try setting headless: true in settings.json)`,
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

  /**
   * Check navigation restrictions based on tools and the args sent
   * along with them.
   *
   * @returns error message if failed, undefined if passed.
   */
  private checkNavigationRestrictions(
    toolName: string,
    args: Record<string, unknown>,
  ): string | undefined {
    const pageNavigationTools = ['navigate_page', 'new_page'];

    if (!pageNavigationTools.includes(toolName)) {
      return undefined;
    }

    const allowedDomains =
      this.config.getBrowserAgentConfig().customConfig.allowedDomains;
    if (!allowedDomains || allowedDomains.length === 0) {
      return undefined;
    }

    const url = args['url'];
    if (!url) {
      return undefined;
    }
    if (typeof url !== 'string') {
      return `Invalid URL: URL must be a string.`;
    }

    try {
      const parsedUrl = new URL(url);
      const urlHostname = parsedUrl.hostname;

      if (!this.isDomainAllowed(urlHostname, allowedDomains)) {
        // If none matched, then deny
        return `Tool '${toolName}' is not permitted for the requested URL/domain based on your current browser settings.`;
      }

      // Check query parameters for embedded URLs that could bypass domain
      // restrictions via proxy services (e.g. translate.google.com/translate?u=BLOCKED).
      const paramsToCheck = [
        ...parsedUrl.searchParams.values(),
        // Also check fragments which might contain query-like params
        ...new URLSearchParams(parsedUrl.hash.replace(/^#/, '')).values(),
      ];
      for (const paramValue of paramsToCheck) {
        try {
          const embeddedUrl = new URL(paramValue);
          if (
            embeddedUrl.protocol === 'http:' ||
            embeddedUrl.protocol === 'https:'
          ) {
            const embeddedHostname = embeddedUrl.hostname.replace(/\.$/, '');
            if (!this.isDomainAllowed(embeddedHostname, allowedDomains)) {
              return `Tool '${toolName}' is not permitted: an embedded URL targets a disallowed domain.`;
            }
          }
        } catch {
          // Not a valid URL, skip.
        }
      }

      return undefined;
    } catch {
      return `Invalid URL: Malformed URL string.`;
    }
  }

  /**
   * Checks whether a hostname matches any pattern in the allowed domains list.
   */
  private isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
    const normalized = hostname.replace(/\.$/, '');
    for (const domainPattern of allowedDomains) {
      if (domainPattern.startsWith('*.')) {
        const baseDomain = domainPattern.substring(2);
        if (
          normalized === baseDomain ||
          normalized.endsWith(`.${baseDomain}`)
        ) {
          return true;
        }
      } else {
        if (normalized === domainPattern) {
          return true;
        }
      }
    }
    // If none matched, then deny
    return false;
  }

  /**
   * Registers a fallback notification handler on the MCP client to
   * automatically re-inject the input blocker after any server-side
   * notification (e.g. page navigation, resource updates).
   *
   * This covers ALL navigation types (link clicks, form submissions,
   * history navigation) — not just explicit navigate_page tool calls.
   */
  private registerInputBlockerHandler(): void {
    if (!this.rawMcpClient) {
      return;
    }

    if (!this.config.shouldDisableBrowserUserInput()) {
      return;
    }

    const existingHandler = this.rawMcpClient.fallbackNotificationHandler;
    this.rawMcpClient.fallbackNotificationHandler = async (notification: {
      method: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params?: any;
    }) => {
      // Chain with any existing handler first.
      if (existingHandler) {
        await existingHandler(notification);
      }

      // Only re-inject on resource update notifications which indicate
      // page content has changed (navigation, new page, etc.)
      if (notification.method === 'notifications/resources/updated') {
        debugLogger.log('Page content changed, re-injecting input blocker...');
        void injectInputBlocker(this);
      }
    };

    debugLogger.log(
      'Registered global notification handler for input blocker re-injection',
    );
  }
}
