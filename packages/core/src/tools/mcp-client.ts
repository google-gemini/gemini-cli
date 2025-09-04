/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  Prompt,
  GetPromptResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ListPromptsResultSchema,
  GetPromptResultSchema,
  ListRootsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { parse } from 'shell-quote';
import type { Config, MCPServerConfig } from '../config/config.js';
import { AuthProviderType } from '../config/config.js';
import { GoogleCredentialProvider } from '../mcp/google-auth-provider.js';
import { DiscoveredMCPTool } from './mcp-tool.js';

import type { FunctionDeclaration } from '@google/genai';
import { mcpToTool } from '@google/genai';
import type { ToolRegistry } from './tool-registry.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import { MCPOAuthProvider } from '../mcp/oauth-provider.js';
import { OAuthUtils } from '../mcp/oauth-utils.js';
import { MCPOAuthTokenStorage } from '../mcp/oauth-token-storage.js';
import { getErrorMessage } from '../utils/errors.js';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  Unsubscribe,
  WorkspaceContext,
} from '../utils/workspaceContext.js';

export const MCP_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // default to 10 minutes

export type DiscoveredMCPPrompt = Prompt & {
  serverName: string;
  invoke: (params: Record<string, unknown>) => Promise<GetPromptResult>;
};

/**
 * Enum representing the connection status of an MCP server
 */
export enum MCPServerStatus {
  /** Server is disconnected or experiencing errors */
  DISCONNECTED = 'disconnected',
  /** Server is in the process of connecting */
  CONNECTING = 'connecting',
  /** Server is connected and ready to use */
  CONNECTED = 'connected',
}

/**
 * Enum representing the overall MCP discovery state
 */
export enum MCPDiscoveryState {
  /** Discovery has not started yet */
  NOT_STARTED = 'not_started',
  /** Discovery is currently in progress */
  IN_PROGRESS = 'in_progress',
  /** Discovery has completed (with or without errors) */
  COMPLETED = 'completed',
}

/**
 * A client for a single MCP server.
 *
 * This class is responsible for connecting to, discovering tools from, and
 * managing the state of a single MCP server.
 */
export class McpClient {
  private client: Client;
  private transport: Transport | undefined;
  private status: MCPServerStatus = MCPServerStatus.DISCONNECTED;
  private isDisconnecting = false;

  constructor(
    private readonly serverName: string,
    private readonly serverConfig: MCPServerConfig,
    private readonly toolRegistry: ToolRegistry,
    private readonly promptRegistry: PromptRegistry,
    private readonly workspaceContext: WorkspaceContext,
    private readonly debugMode: boolean,
  ) {
    this.client = new Client({
      name: `gemini-cli-mcp-client-${this.serverName}`,
      version: '0.0.1',
    });
  }

  /**
   * Connects to the MCP server.
   */
  async connect(): Promise<void> {
    this.isDisconnecting = false;
    this.updateStatus(MCPServerStatus.CONNECTING);
    try {
      this.transport = await this.createTransport();

      this.client.onerror = (error) => {
        if (this.isDisconnecting) {
          return;
        }
        console.error(`MCP ERROR (${this.serverName}):`, error.toString());
        this.updateStatus(MCPServerStatus.DISCONNECTED);
      };

      this.client.registerCapabilities({
        roots: {},
      });

      this.client.setRequestHandler(ListRootsRequestSchema, async () => {
        const roots = [];
        for (const dir of this.workspaceContext.getDirectories()) {
          roots.push({
            uri: pathToFileURL(dir).toString(),
            name: basename(dir),
          });
        }
        return {
          roots,
        };
      });

      await this.client.connect(this.transport, {
        timeout: this.serverConfig.timeout,
      });

      this.updateStatus(MCPServerStatus.CONNECTED);
    } catch (error) {
      this.updateStatus(MCPServerStatus.DISCONNECTED);
      throw error;
    }
  }

  /**
   * Discovers tools and prompts from the MCP server.
   */
  async discover(cliConfig: Config): Promise<void> {
    if (this.status !== MCPServerStatus.CONNECTED) {
      throw new Error('Client is not connected.');
    }

    const prompts = await this.discoverPrompts();
    const tools = await this.discoverTools(cliConfig);

    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }

    for (const tool of tools) {
      this.toolRegistry.registerTool(tool);
    }
  }

  /**
   * Disconnects from the MCP server.
   */
  async disconnect(): Promise<void> {
    this.isDisconnecting = true;
    if (this.transport) {
      await this.transport.close();
    }
    this.client.close();
    this.updateStatus(MCPServerStatus.DISCONNECTED);
  }

  /**
   * Returns the current status of the client.
   */
  getStatus(): MCPServerStatus {
    return this.status;
  }

  private updateStatus(status: MCPServerStatus): void {
    this.status = status;
    updateMCPServerStatus(this.serverName, status);
  }

  private async createTransport(): Promise<Transport> {
    return createTransport(this.serverName, this.serverConfig, this.debugMode);
  }

  private async discoverTools(cliConfig: Config): Promise<DiscoveredMCPTool[]> {
    return discoverTools(
      this.serverName,
      this.serverConfig,
      this.client,
      cliConfig,
    );
  }

  private async discoverPrompts(): Promise<Prompt[]> {
    return discoverPrompts(this.serverName, this.client, this.promptRegistry);
  }
}

/**
 * Map to track the status of each MCP server within the core package
 */
const serverStatuses: Map<string, MCPServerStatus> = new Map();

/**
 * Track the overall MCP discovery state
 */
let mcpDiscoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;

/**
 * Map to track which MCP servers have been discovered to require OAuth
 */
export const mcpServerRequiresOAuth: Map<string, boolean> = new Map();

/**
 * Event listeners for MCP server status changes
 */
type StatusChangeListener = (
  serverName: string,
  status: MCPServerStatus,
) => void;
const statusChangeListeners: StatusChangeListener[] = [];

/**
 * Add a listener for MCP server status changes
 */
export function addMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  statusChangeListeners.push(listener);
}

/**
 * Remove a listener for MCP server status changes
 */
export function removeMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  const index = statusChangeListeners.indexOf(listener);
  if (index !== -1) {
    statusChangeListeners.splice(index, 1);
  }
}

/**
 * Update the status of an MCP server
 */
export function updateMCPServerStatus(
  serverName: string,
  status: MCPServerStatus,
): void {
  serverStatuses.set(serverName, status);
  // Notify all listeners
  for (const listener of statusChangeListeners) {
    listener(serverName, status);
  }
}

/**
 * Get the current status of an MCP server
 */
export function getMCPServerStatus(serverName: string): MCPServerStatus {
  return serverStatuses.get(serverName) || MCPServerStatus.DISCONNECTED;
}

/**
 * Get all MCP server statuses
 */
export function getAllMCPServerStatuses(): Map<string, MCPServerStatus> {
  return new Map(serverStatuses);
}

/**
 * Get the current MCP discovery state
 */
export function getMCPDiscoveryState(): MCPDiscoveryState {
  return mcpDiscoveryState;
}

/**
 * Extract WWW-Authenticate header from error message string.
 * This is a more robust approach than regex matching.
 *
 * @param errorString The error message string
 * @returns The www-authenticate header value if found, null otherwise
 */
function extractWWWAuthenticateHeader(errorString: string): string | null {
  // Try multiple patterns to extract the header
  const patterns = [
    /www-authenticate:\s*([^\n\r]+)/i,
    /WWW-Authenticate:\s*([^\n\r]+)/i,
    /"www-authenticate":\s*"([^"]+)"/i,
    /'www-authenticate':\s*'([^']+)'/i,
  ];

  for (const pattern of patterns) {
    const match = errorString.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Handle automatic OAuth discovery and authentication for a server.
 *
 * @param mcpServerName The name of the MCP server
 * @param mcpServerConfig The MCP server configuration
 * @param wwwAuthenticate The www-authenticate header value
 * @returns True if OAuth was successfully configured and authenticated, false otherwise
 */
async function handleAutomaticOAuth(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  wwwAuthenticate: string,
): Promise<boolean> {
  try {
    console.log(`🔐 '${mcpServerName}' requires OAuth authentication`);

    // Always try to parse the resource metadata URI from the www-authenticate header
    let oauthConfig;
    const resourceMetadataUri =
      OAuthUtils.parseWWWAuthenticateHeader(wwwAuthenticate);
    if (resourceMetadataUri) {
      oauthConfig = await OAuthUtils.discoverOAuthConfig(resourceMetadataUri);
    } else if (hasNetworkTransport(mcpServerConfig)) {
      // Fallback: try to discover OAuth config from the base URL
      const serverUrl = new URL(
        mcpServerConfig.httpUrl || mcpServerConfig.url!,
      );
      const baseUrl = `${serverUrl.protocol}//${serverUrl.host}`;
      oauthConfig = await OAuthUtils.discoverOAuthConfig(baseUrl);
    }

    if (!oauthConfig) {
      console.error(
        `❌ Could not configure OAuth for '${mcpServerName}' - please authenticate manually with /mcp auth ${mcpServerName}`,
      );
      return false;
    }

    // OAuth configuration discovered - proceed with authentication

    // Create OAuth configuration for authentication
    const oauthAuthConfig = {
      enabled: true,
      authorizationUrl: oauthConfig.authorizationUrl,
      tokenUrl: oauthConfig.tokenUrl,
      scopes: oauthConfig.scopes || [],
    };

    // Perform OAuth authentication
    // Pass the server URL for proper discovery
    const serverUrl = mcpServerConfig.httpUrl || mcpServerConfig.url;
    console.log(
      `Starting OAuth authentication for server '${mcpServerName}'...`,
    );
    const authProvider = new MCPOAuthProvider(new MCPOAuthTokenStorage());
    await authProvider.authenticate(mcpServerName, oauthAuthConfig, serverUrl);

    console.log(
      `OAuth authentication successful for server '${mcpServerName}'`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to handle automatic OAuth for server '${mcpServerName}': ${getErrorMessage(error)}`,
    );
    return false;
  }
}

/**
 * Create a transport with OAuth token for the given server configuration.
 *
 * @param mcpServerName The name of the MCP server
 * @param mcpServerConfig The MCP server configuration
 * @param accessToken The OAuth access token
 * @returns The transport with OAuth token, or null if creation fails
 */
async function createTransportWithOAuth(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  accessToken: string,
): Promise<StreamableHTTPClientTransport | SSEClientTransport | null> {
  try {
    if (mcpServerConfig.httpUrl) {
      // Create HTTP transport with OAuth token
      const oauthTransportOptions: StreamableHTTPClientTransportOptions = {
        requestInit: {
          headers: {
            ...mcpServerConfig.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      };

      return new StreamableHTTPClientTransport(
        new URL(mcpServerConfig.httpUrl),
        oauthTransportOptions,
      );
    } else if (mcpServerConfig.url) {
      // Create SSE transport with OAuth token in Authorization header
      return new SSEClientTransport(new URL(mcpServerConfig.url), {
        requestInit: {
          headers: {
            ...mcpServerConfig.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      });
    }

    return null;
  } catch (error) {
    console.error(
      `Failed to create OAuth transport for server '${mcpServerName}': ${getErrorMessage(error)}`,
    );
    return null;
  }
}

/**
 * Discovers tools from all configured MCP servers and registers them with the tool registry.
 * It orchestrates the connection and discovery process for each server defined in the
 * configuration, as well as any server specified via a command-line argument.
 *
 * @param mcpServers A record of named MCP server configurations.
 * @param mcpServerCommand An optional command string for a dynamically specified MCP server.
 * @param toolRegistry The central registry where discovered tools will be registered.
 * @returns A promise that resolves when the discovery process has been attempted for all servers.
 */
export async function discoverMcpTools(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
  toolRegistry: ToolRegistry,
  promptRegistry: PromptRegistry,
  debugMode: boolean,
  workspaceContext: WorkspaceContext,
  cliConfig: Config,
): Promise<void> {
  mcpDiscoveryState = MCPDiscoveryState.IN_PROGRESS;
  try {
    mcpServers = populateMcpServerCommand(mcpServers, mcpServerCommand);

    const discoveryPromises = Object.entries(mcpServers).map(
      ([mcpServerName, mcpServerConfig]) =>
        connectAndDiscover(
          mcpServerName,
          mcpServerConfig,
          toolRegistry,
          promptRegistry,
          debugMode,
          workspaceContext,
          cliConfig,
        ),
    );
    await Promise.all(discoveryPromises);
  } finally {
    mcpDiscoveryState = MCPDiscoveryState.COMPLETED;
  }
}

/** Visible for Testing */
export function populateMcpServerCommand(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
): Record<string, MCPServerConfig> {
  if (mcpServerCommand) {
    const cmd = mcpServerCommand;
    const args = parse(cmd, process.env) as string[];
    if (args.some((arg) => typeof arg !== 'string')) {
      throw new Error('failed to parse mcpServerCommand: ' + cmd);
    }
    // use generic server name 'mcp'
    mcpServers['mcp'] = {
      command: args[0],
      args: args.slice(1),
    };
  }
  return mcpServers;
}

/**
 * Connects to an MCP server and discovers available tools, registering them with the tool registry.
 * This function handles the complete lifecycle of connecting to a server, discovering tools,
 * and cleaning up resources if no tools are found.
 *
 * @param mcpServerName The name identifier for this MCP server
 * @param mcpServerConfig Configuration object containing connection details
 * @param toolRegistry The registry to register discovered tools with
 * @returns Promise that resolves when discovery is complete
 */
export async function connectAndDiscover(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  toolRegistry: ToolRegistry,
  promptRegistry: PromptRegistry,
  debugMode: boolean,
  workspaceContext: WorkspaceContext,
  cliConfig: Config,
): Promise<void> {
  updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTING);

  let mcpClient: Client | undefined;
  try {
    mcpClient = await connectToMcpServer(
      mcpServerName,
      mcpServerConfig,
      debugMode,
      workspaceContext,
    );

    mcpClient.onerror = (error) => {
      console.error(`MCP ERROR (${mcpServerName}):`, error.toString());
      updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
    };

    // Attempt to discover both prompts and tools
    const prompts = await discoverPrompts(
      mcpServerName,
      mcpClient,
      promptRegistry,
    );
    const tools = await discoverTools(
      mcpServerName,
      mcpServerConfig,
      mcpClient,
      cliConfig,
    );

    // If we have neither prompts nor tools, it's a failed discovery
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }

    // If we found anything, the server is connected
    updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTED);

    // Register any discovered tools
    for (const tool of tools) {
      toolRegistry.registerTool(tool);
    }
  } catch (error) {
    if (mcpClient) {
      mcpClient.close();
    }
    console.error(
      `Error connecting to MCP server '${mcpServerName}': ${getErrorMessage(
        error,
      )}`,
    );
    updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
  }
}

/**
 * Recursively validates that a JSON schema and all its nested properties and
 * items have a `type` defined.
 *
 * @param schema The JSON schema to validate.
 * @returns `true` if the schema is valid, `false` otherwise.
 *
 * @visiblefortesting
 */
export function hasValidTypes(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) {
    // Not a schema object we can validate, or not a schema at all.
    // Treat as valid as it has no properties to be invalid.
    return true;
  }

  const s = schema as Record<string, unknown>;

  if (!s['type']) {
    // These keywords contain an array of schemas that should be validated.
    //
    // If no top level type was given, then they must each have a type.
    let hasSubSchema = false;
    const schemaArrayKeywords = ['anyOf', 'allOf', 'oneOf'];
    for (const keyword of schemaArrayKeywords) {
      const subSchemas = s[keyword];
      if (Array.isArray(subSchemas)) {
        hasSubSchema = true;
        for (const subSchema of subSchemas) {
          if (!hasValidTypes(subSchema)) {
            return false;
          }
        }
      }
    }

    // If the node itself is missing a type and had no subschemas, then it isn't valid.
    if (!hasSubSchema) return false;
  }

  if (s['type'] === 'object' && s['properties']) {
    if (typeof s['properties'] === 'object' && s['properties'] !== null) {
      for (const prop of Object.values(s['properties'])) {
        if (!hasValidTypes(prop)) {
          return false;
        }
      }
    }
  }

  if (s['type'] === 'array' && s['items']) {
    if (!hasValidTypes(s['items'])) {
      return false;
    }
  }

  return true;
}

/**
 * Discovers and sanitizes tools from a connected MCP client.
 * It retrieves function declarations from the client, filters out disabled tools,
 * generates valid names for them, and wraps them in `DiscoveredMCPTool` instances.
 *
 * @param mcpServerName The name of the MCP server.
 * @param mcpServerConfig The configuration for the MCP server.
 * @param mcpClient The active MCP client instance.
 * @returns A promise that resolves to an array of discovered and enabled tools.
 * @throws An error if no enabled tools are found or if the server provides invalid function declarations.
 */
export async function discoverTools(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  mcpClient: Client,
  cliConfig: Config,
): Promise<DiscoveredMCPTool[]> {
  try {
    const mcpCallableTool = mcpToTool(mcpClient, {
      timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
    });
    const tool = await mcpCallableTool.tool();

    if (!Array.isArray(tool.functionDeclarations)) {
      // This is a valid case for a prompt-only server
      return [];
    }

    const discoveredTools: DiscoveredMCPTool[] = [];
    for (const funcDecl of tool.functionDeclarations) {
      try {
        if (!isEnabled(funcDecl, mcpServerName, mcpServerConfig)) {
          continue;
        }

        if (!hasValidTypes(funcDecl.parametersJsonSchema)) {
          console.warn(
            `Skipping tool '${funcDecl.name}' from MCP server '${mcpServerName}' ` +
              `because it has missing types in its parameter schema. Please file an ` +
              `issue with the owner of the MCP server.`,
          );
          continue;
        }

        discoveredTools.push(
          new DiscoveredMCPTool(
            mcpCallableTool,
            mcpServerName,
            funcDecl.name!,
            funcDecl.description ?? '',
            funcDecl.parametersJsonSchema ?? { type: 'object', properties: {} },
            mcpServerConfig.trust,
            undefined,
            cliConfig,
          ),
        );
      } catch (error) {
        console.error(
          `Error discovering tool: '${
            funcDecl.name
          }' from MCP server '${mcpServerName}': ${(error as Error).message}`,
        );
      }
    }
    return discoveredTools;
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message?.includes('Method not found')
    ) {
      console.error(
        `Error discovering tools from ${mcpServerName}: ${getErrorMessage(
          error,
        )}`,
      );
    }
    return [];
  }
}

/**
 * Discovers and logs prompts from a connected MCP client.
 * It retrieves prompt declarations from the client and logs their names.
 *
 * @param mcpServerName The name of the MCP server.
 * @param mcpClient The active MCP client instance.
 */
export async function discoverPrompts(
  mcpServerName: string,
  mcpClient: Client,
  promptRegistry: PromptRegistry,
): Promise<Prompt[]> {
  try {
    // Only request prompts if the server supports them.
    if (mcpClient.getServerCapabilities()?.prompts == null) return [];

    const response = await mcpClient.request(
      { method: 'prompts/list', params: {} },
      ListPromptsResultSchema,
    );

    for (const prompt of response.prompts) {
      promptRegistry.registerPrompt({
        ...prompt,
        serverName: mcpServerName,
        invoke: (params: Record<string, unknown>) =>
          invokeMcpPrompt(mcpServerName, mcpClient, prompt.name, params),
      });
    }
    return response.prompts;
  } catch (error) {
    // It's okay if this fails, not all servers will have prompts.
    // Don't log an error if the method is not found, which is a common case.
    if (
      error instanceof Error &&
      !error.message?.includes('Method not found')
    ) {
      console.error(
        `Error discovering prompts from ${mcpServerName}: ${getErrorMessage(
          error,
        )}`,
      );
    }
    return [];
  }
}

/**
 * Invokes a prompt on a connected MCP client.
 *
 * @param mcpServerName The name of the MCP server.
 * @param mcpClient The active MCP client instance.
 * @param promptName The name of the prompt to invoke.
 * @param promptParams The parameters to pass to the prompt.
 * @returns A promise that resolves to the result of the prompt invocation.
 */
export async function invokeMcpPrompt(
  mcpServerName: string,
  mcpClient: Client,
  promptName: string,
  promptParams: Record<string, unknown>,
): Promise<GetPromptResult> {
  try {
    const response = await mcpClient.request(
      {
        method: 'prompts/get',
        params: {
          name: promptName,
          arguments: promptParams,
        },
      },
      GetPromptResultSchema,
    );

    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message?.includes('Method not found')
    ) {
      console.error(
        `Error invoking prompt '${promptName}' from ${mcpServerName} ${promptParams}: ${getErrorMessage(
          error,
        )}`,
      );
    }
    throw error;
  }
}

/**
 * @visiblefortesting
 * Checks if the MCP server configuration has a network transport URL (SSE or HTTP).
 * @param config The MCP server configuration.
 * @returns True if a `url` or `httpUrl` is present, false otherwise.
 */
export function hasNetworkTransport(config: MCPServerConfig): boolean {
  return !!(config.url || config.httpUrl);
}

/**
 * Creates and connects an MCP client to a server based on the provided configuration.
 * It determines the appropriate transport (Stdio, SSE, or Streamable HTTP) and
 * establishes a connection. It also applies a patch to handle request timeouts.
 *
 * @param mcpServerName The name of the MCP server, used for logging and identification.
 * @param mcpServerConfig The configuration specifying how to connect to the server.
 * @returns A promise that resolves to a connected MCP `Client` instance.
 * @throws An error if the connection fails or the configuration is invalid.
 */
export async function connectToMcpServer(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  debugMode: boolean,
  workspaceContext: WorkspaceContext,
): Promise<Client> {
  const mcpClient = new Client({
    name: 'gemini-cli-mcp-client',
    version: '0.0.1',
  });

  mcpClient.registerCapabilities({
    roots: {
      listChanged: true,
    },
  });

  mcpClient.setRequestHandler(ListRootsRequestSchema, async () => {
    const roots = [];
    for (const dir of workspaceContext.getDirectories()) {
      roots.push({
        uri: pathToFileURL(dir).toString(),
        name: basename(dir),
      });
    }
    return {
      roots,
    };
  });

  let unlistenDirectories: Unsubscribe | undefined =
    workspaceContext.onDirectoriesChanged(async () => {
      try {
        await mcpClient.notification({
          method: 'notifications/roots/list_changed',
        });
      } catch (_) {
        // If this fails, its almost certainly because the connection was closed
        // and we should just stop listening for future directory changes.
        unlistenDirectories?.();
        unlistenDirectories = undefined;
      }
    });

  // Attempt to pro-actively unsubscribe if the mcp client closes. This API is
  // very brittle though so we don't have any guarantees, hence the try/catch
  // above as well.
  //
  // Be a good steward and don't just bash over onclose.
  const oldOnClose = mcpClient.onclose;
  mcpClient.onclose = () => {
    oldOnClose?.();
    unlistenDirectories?.();
    unlistenDirectories = undefined;
  };

  try {
    const transport = await createTransport(
      mcpServerName,
      mcpServerConfig,
      debugMode,
    );
    try {
      await mcpClient.connect(transport, {
        timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
      });
      return mcpClient;
    } catch (error) {
      await transport.close();
      throw error;
    }
  } catch (error) {
    // Check if this is a 401 error that might indicate OAuth is required
    const errorString = String(error);
    if (errorString.includes('401') && hasNetworkTransport(mcpServerConfig)) {
      mcpServerRequiresOAuth.set(mcpServerName, true);
      // Only trigger automatic OAuth discovery for HTTP servers or when OAuth is explicitly configured
      // For SSE servers, we should not trigger new OAuth flows automatically
      const shouldTriggerOAuth =
        mcpServerConfig.httpUrl || mcpServerConfig.oauth?.enabled;

      if (!shouldTriggerOAuth) {
        // For SSE servers without explicit OAuth config, if a token was found but rejected, report it accurately.
        const tokenStorage = new MCPOAuthTokenStorage();
        const credentials = await tokenStorage.getToken(mcpServerName);
        if (credentials) {
          const authProvider = new MCPOAuthProvider(tokenStorage);
          const hasStoredTokens = await authProvider.getValidToken(
            mcpServerName,
            {
              // Pass client ID if available
              clientId: credentials.clientId,
            },
          );
          if (hasStoredTokens) {
            console.log(
              `Stored OAuth token for SSE server '${mcpServerName}' was rejected. ` +
                `Please re-authenticate using: /mcp auth ${mcpServerName}`,
            );
          } else {
            console.log(
              `401 error received for SSE server '${mcpServerName}' without OAuth configuration. ` +
                `Please authenticate using: /mcp auth ${mcpServerName}`,
            );
          }
        }
        throw new Error(
          `401 error received for SSE server '${mcpServerName}' without OAuth configuration. ` +
            `Please authenticate using: /mcp auth ${mcpServerName}`,
        );
      }

      // Try to extract www-authenticate header from the error
      let wwwAuthenticate = extractWWWAuthenticateHeader(errorString);

      // If we didn't get the header from the error string, try to get it from the server
      if (!wwwAuthenticate && hasNetworkTransport(mcpServerConfig)) {
        console.log(
          `No www-authenticate header in error, trying to fetch it from server...`,
        );
        try {
          const urlToFetch = mcpServerConfig.httpUrl || mcpServerConfig.url!;
          const response = await fetch(urlToFetch, {
            method: 'HEAD',
            headers: {
              Accept: mcpServerConfig.httpUrl
                ? 'application/json'
                : 'text/event-stream',
            },
            signal: AbortSignal.timeout(5000),
          });

          if (response.status === 401) {
            wwwAuthenticate = response.headers.get('www-authenticate');
            if (wwwAuthenticate) {
              console.log(
                `Found www-authenticate header from server: ${wwwAuthenticate}`,
              );
            }
          }
        } catch (fetchError) {
          console.debug(
            `Failed to fetch www-authenticate header: ${getErrorMessage(
              fetchError,
            )}`,
          );
        }
      }

      if (wwwAuthenticate) {
        console.log(
          `Received 401 with www-authenticate header: ${wwwAuthenticate}`,
        );

        // Try automatic OAuth discovery and authentication
        const oauthSuccess = await handleAutomaticOAuth(
          mcpServerName,
          mcpServerConfig,
          wwwAuthenticate,
        );
        if (oauthSuccess) {
          // Retry connection with OAuth token
          console.log(
            `Retrying connection to '${mcpServerName}' with OAuth token...`,
          );

          // Get the valid token - we need to create a proper OAuth config
          // The token should already be available from the authentication process
          const tokenStorage = new MCPOAuthTokenStorage();
          const credentials = await tokenStorage.getToken(mcpServerName);
          if (credentials) {
            const authProvider = new MCPOAuthProvider(tokenStorage);
            const accessToken = await authProvider.getValidToken(
              mcpServerName,
              {
                // Pass client ID if available
                clientId: credentials.clientId,
              },
            );

            if (accessToken) {
              // Create transport with OAuth token
              const oauthTransport = await createTransportWithOAuth(
                mcpServerName,
                mcpServerConfig,
                accessToken,
              );
              if (oauthTransport) {
                try {
                  await mcpClient.connect(oauthTransport, {
                    timeout:
                      mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
                  });
                  // Connection successful with OAuth
                  return mcpClient;
                } catch (retryError) {
                  console.error(
                    `Failed to connect with OAuth token: ${getErrorMessage(
                      retryError,
                    )}`,
                  );
                  throw retryError;
                }
              } else {
                console.error(
                  `Failed to create OAuth transport for server '${mcpServerName}'`,
                );
                throw new Error(
                  `Failed to create OAuth transport for server '${mcpServerName}'`,
                );
              }
            } else {
              console.error(
                `Failed to get OAuth token for server '${mcpServerName}'`,
              );
              throw new Error(
                `Failed to get OAuth token for server '${mcpServerName}'`,
              );
            }
          } else {
            console.error(
              `Failed to get credentials for server '${mcpServerName}' after successful OAuth authentication`,
            );
            throw new Error(
              `Failed to get credentials for server '${mcpServerName}' after successful OAuth authentication`,
            );
          }
        } else {
          console.error(
            `Failed to handle automatic OAuth for server '${mcpServerName}'`,
          );
          throw new Error(
            `Failed to handle automatic OAuth for server '${mcpServerName}'`,
          );
        }
      } else {
        // No www-authenticate header found, but we got a 401
        // Only try OAuth discovery for HTTP servers or when OAuth is explicitly configured
        // For SSE servers, we should not trigger new OAuth flows automatically
        const shouldTryDiscovery =
          mcpServerConfig.httpUrl || mcpServerConfig.oauth?.enabled;

        if (!shouldTryDiscovery) {
          const tokenStorage = new MCPOAuthTokenStorage();
          const credentials = await tokenStorage.getToken(mcpServerName);
          if (credentials) {
            const authProvider = new MCPOAuthProvider(tokenStorage);
            const hasStoredTokens = await authProvider.getValidToken(
              mcpServerName,
              {
                // Pass client ID if available
                clientId: credentials.clientId,
              },
            );
            if (hasStoredTokens) {
              console.log(
                `Stored OAuth token for SSE server '${mcpServerName}' was rejected. ` +
                  `Please re-authenticate using: /mcp auth ${mcpServerName}`,
              );
            } else {
              console.log(
                `401 error received for SSE server '${mcpServerName}' without OAuth configuration. ` +
                  `Please authenticate using: /mcp auth ${mcpServerName}`,
              );
            }
          }
          throw new Error(
            `401 error received for SSE server '${mcpServerName}' without OAuth configuration. ` +
              `Please authenticate using: /mcp auth ${mcpServerName}`,
          );
        }

        // For SSE/HTTP servers, try to discover OAuth configuration from the base URL
        console.log(`🔍 Attempting OAuth discovery for '${mcpServerName}'...`);

        if (hasNetworkTransport(mcpServerConfig)) {
          const serverUrl = new URL(
            mcpServerConfig.httpUrl || mcpServerConfig.url!,
          );
          const baseUrl = `${serverUrl.protocol}//${serverUrl.host}`;

          try {
            // Try to discover OAuth configuration from the base URL
            const oauthConfig = await OAuthUtils.discoverOAuthConfig(baseUrl);
            if (oauthConfig) {
              console.log(
                `Discovered OAuth configuration from base URL for server '${mcpServerName}'`,
              );

              // Create OAuth configuration for authentication
              const oauthAuthConfig = {
                enabled: true,
                authorizationUrl: oauthConfig.authorizationUrl,
                tokenUrl: oauthConfig.tokenUrl,
                scopes: oauthConfig.scopes || [],
              };

              // Perform OAuth authentication
              // Pass the server URL for proper discovery
              const authServerUrl =
                mcpServerConfig.httpUrl || mcpServerConfig.url;
              console.log(
                `Starting OAuth authentication for server '${mcpServerName}'...`,
              );
              const authProvider = new MCPOAuthProvider(
                new MCPOAuthTokenStorage(),
              );
              await authProvider.authenticate(
                mcpServerName,
                oauthAuthConfig,
                authServerUrl,
              );

              // Retry connection with OAuth token
              const tokenStorage = new MCPOAuthTokenStorage();
              const credentials = await tokenStorage.getToken(mcpServerName);
              if (credentials) {
                const authProvider = new MCPOAuthProvider(tokenStorage);
                const accessToken = await authProvider.getValidToken(
                  mcpServerName,
                  {
                    // Pass client ID if available
                    clientId: credentials.clientId,
                  },
                );
                if (accessToken) {
                  // Create transport with OAuth token
                  const oauthTransport = await createTransportWithOAuth(
                    mcpServerName,
                    mcpServerConfig,
                    accessToken,
                  );
                  if (oauthTransport) {
                    try {
                      await mcpClient.connect(oauthTransport, {
                        timeout:
                          mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
                      });
                      // Connection successful with OAuth
                      return mcpClient;
                    } catch (retryError) {
                      console.error(
                        `Failed to connect with OAuth token: ${getErrorMessage(
                          retryError,
                        )}`,
                      );
                      throw retryError;
                    }
                  } else {
                    console.error(
                      `Failed to create OAuth transport for server '${mcpServerName}'`,
                    );
                    throw new Error(
                      `Failed to create OAuth transport for server '${mcpServerName}'`,
                    );
                  }
                } else {
                  console.error(
                    `Failed to get OAuth token for server '${mcpServerName}'`,
                  );
                  throw new Error(
                    `Failed to get OAuth token for server '${mcpServerName}'`,
                  );
                }
              } else {
                console.error(
                  `Failed to get stored credentials for server '${mcpServerName}'`,
                );
                throw new Error(
                  `Failed to get stored credentials for server '${mcpServerName}'`,
                );
              }
            } else {
              console.error(
                `❌ Could not configure OAuth for '${mcpServerName}' - please authenticate manually with /mcp auth ${mcpServerName}`,
              );
              throw new Error(
                `OAuth configuration failed for '${mcpServerName}'. Please authenticate manually with /mcp auth ${mcpServerName}`,
              );
            }
          } catch (discoveryError) {
            console.error(
              `❌ OAuth discovery failed for '${mcpServerName}' - please authenticate manually with /mcp auth ${mcpServerName}`,
            );
            throw discoveryError;
          }
        } else {
          console.error(
            `❌ '${mcpServerName}' requires authentication but no OAuth configuration found`,
          );
          throw new Error(
            `MCP server '${mcpServerName}' requires authentication. Please configure OAuth or check server settings.`,
          );
        }
      }
    } else {
      // Handle other connection errors
      // Create a concise error message
      const errorMessage = (error as Error).message || String(error);
      const isNetworkError =
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED');

      let conciseError: string;
      if (isNetworkError) {
        conciseError = `Cannot connect to '${mcpServerName}' - server may be down or URL incorrect`;
      } else {
        conciseError = `Connection failed for '${mcpServerName}': ${errorMessage}`;
      }

      if (process.env['SANDBOX']) {
        conciseError += ` (check sandbox availability)`;
      }

      throw new Error(conciseError);
    }
  }
}

/** Visible for Testing */
export async function createTransport(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  debugMode: boolean,
): Promise<Transport> {
  if (
    mcpServerConfig.authProviderType === AuthProviderType.GOOGLE_CREDENTIALS
  ) {
    const provider = new GoogleCredentialProvider(mcpServerConfig);
    const transportOptions:
      | StreamableHTTPClientTransportOptions
      | SSEClientTransportOptions = {
      authProvider: provider,
    };
    if (mcpServerConfig.httpUrl) {
      return new StreamableHTTPClientTransport(
        new URL(mcpServerConfig.httpUrl),
        transportOptions,
      );
    } else if (mcpServerConfig.url) {
      return new SSEClientTransport(
        new URL(mcpServerConfig.url),
        transportOptions,
      );
    }
    throw new Error('No URL configured for Google Credentials MCP server');
  }

  // Check if we have OAuth configuration or stored tokens
  let accessToken: string | null = null;
  let hasOAuthConfig = mcpServerConfig.oauth?.enabled;

  if (hasOAuthConfig && mcpServerConfig.oauth) {
    const tokenStorage = new MCPOAuthTokenStorage();
    const authProvider = new MCPOAuthProvider(tokenStorage);
    accessToken = await authProvider.getValidToken(
      mcpServerName,
      mcpServerConfig.oauth,
    );

    if (!accessToken) {
      console.error(
        `MCP server '${mcpServerName}' requires OAuth authentication. ` +
          `Please authenticate using the /mcp auth command.`,
      );
      throw new Error(
        `MCP server '${mcpServerName}' requires OAuth authentication. ` +
          `Please authenticate using the /mcp auth command.`,
      );
    }
  } else {
    // Check if we have stored OAuth tokens for this server (from previous authentication)
    const tokenStorage = new MCPOAuthTokenStorage();
    const credentials = await tokenStorage.getToken(mcpServerName);
    if (credentials) {
      const authProvider = new MCPOAuthProvider(tokenStorage);
      accessToken = await authProvider.getValidToken(mcpServerName, {
        // Pass client ID if available
        clientId: credentials.clientId,
      });

      if (accessToken) {
        hasOAuthConfig = true;
        console.log(`Found stored OAuth token for server '${mcpServerName}'`);
      }
    }
  }

  if (mcpServerConfig.httpUrl) {
    const transportOptions: StreamableHTTPClientTransportOptions = {};

    // Set up headers with OAuth token if available
    if (hasOAuthConfig && accessToken) {
      transportOptions.requestInit = {
        headers: {
          ...mcpServerConfig.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      };
    } else if (mcpServerConfig.headers) {
      transportOptions.requestInit = {
        headers: mcpServerConfig.headers,
      };
    }

    return new StreamableHTTPClientTransport(
      new URL(mcpServerConfig.httpUrl),
      transportOptions,
    );
  }

  if (mcpServerConfig.url) {
    const transportOptions: SSEClientTransportOptions = {};

    // Set up headers with OAuth token if available
    if (hasOAuthConfig && accessToken) {
      transportOptions.requestInit = {
        headers: {
          ...mcpServerConfig.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      };
    } else if (mcpServerConfig.headers) {
      transportOptions.requestInit = {
        headers: mcpServerConfig.headers,
      };
    }

    return new SSEClientTransport(
      new URL(mcpServerConfig.url),
      transportOptions,
    );
  }

  if (mcpServerConfig.command) {
    const transport = new StdioClientTransport({
      command: mcpServerConfig.command,
      args: mcpServerConfig.args || [],
      env: {
        ...process.env,
        ...(mcpServerConfig.env || {}),
      } as Record<string, string>,
      cwd: mcpServerConfig.cwd,
      stderr: 'pipe',
    });
    if (debugMode) {
      transport.stderr!.on('data', (data) => {
        const stderrStr = data.toString().trim();
        console.debug(`[DEBUG] [MCP STDERR (${mcpServerName})]: `, stderrStr);
      });
    }
    return transport;
  }

  throw new Error(
    `Invalid configuration: missing httpUrl (for Streamable HTTP), url (for SSE), and command (for stdio).`,
  );
}

/** Visible for testing */
export function isEnabled(
  funcDecl: FunctionDeclaration,
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
): boolean {
  if (!funcDecl.name) {
    console.warn(
      `Discovered a function declaration without a name from MCP server '${mcpServerName}'. Skipping.`,
    );
    return false;
  }
  const { includeTools, excludeTools } = mcpServerConfig;

  // excludeTools takes precedence over includeTools
  if (excludeTools && excludeTools.includes(funcDecl.name)) {
    return false;
  }

  return (
    !includeTools ||
    includeTools.some(
      (tool) => tool === funcDecl.name || tool.startsWith(`${funcDecl.name}(`),
    )
  );
}
