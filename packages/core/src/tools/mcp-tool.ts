/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolMcpConfirmationDetails,
  type ToolResult,
  type PolicyUpdateOptions,
  type ExecuteOptions,
} from './tools.js';
import type { CallableTool, FunctionCall, Part } from '@google/genai';
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { McpContext } from './mcp-client.js';

/**
 * The separator used to qualify MCP tool names with their server prefix.
 * e.g. "mcp_server_name_tool_name"
 */
export const MCP_QUALIFIED_NAME_SEPARATOR = '_';

/**
 * The strict prefix that all MCP tools must start with.
 */
export const MCP_TOOL_PREFIX = 'mcp_';

/**
 * Returns true if `name` matches the MCP qualified name format: "mcp_server_tool",
 * i.e. starts with the "mcp_" prefix.
 */
export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX);
}

/**
 * Extracts the server name and tool name from a fully qualified MCP tool name.
 * Expected format: `mcp_{server_name}_{tool_name}`
 * @param name The fully qualified tool name.
 * @returns An object containing the extracted `serverName` and `toolName`, or
 *          `undefined` properties if the name doesn't match the expected format.
 */
export function parseMcpToolName(name: string): {
  serverName?: string;
  toolName?: string;
} {
  if (!isMcpToolName(name)) {
    return {};
  }
  // Remove the prefix
  const withoutPrefix = name.slice(MCP_TOOL_PREFIX.length);
  // The first segment is the server name, the rest is the tool name
  // Must be strictly `server_tool` where neither are empty
  const match = withoutPrefix.match(/^([^_]+)_(.+)$/);
  if (match) {
    return {
      serverName: match[1],
      toolName: match[2],
    };
  }
  return {};
}

/**
 * Assembles a fully qualified MCP tool name (or wildcard pattern) from its server and tool components.
 *
 * @param serverName The backend MCP server name (can be '*' for global wildcards).
 * @param toolName The name of the tool (can be undefined or '*' for tool-level wildcards).
 * @returns The fully qualified name (e.g., `mcp_server_tool`, `mcp_*`, `mcp_server_*`).
 */
export function formatMcpToolName(
  serverName: string,
  toolName?: string,
): string {
  if (serverName === '*' && (toolName === undefined || toolName === '*')) {
    return `${MCP_TOOL_PREFIX}*`;
  } else if (serverName === '*') {
    return `${MCP_TOOL_PREFIX}*_${toolName}`;
  } else if (toolName === undefined || toolName === '*') {
    return `${MCP_TOOL_PREFIX}${serverName}_*`;
  } else {
    return `${MCP_TOOL_PREFIX}${serverName}_${toolName}`;
  }
}

/**
 * Interface representing metadata annotations specific to an MCP tool.
 * Ensures strongly-typed access to server-level properties.
 */
export interface McpToolAnnotation extends Record<string, unknown> {
  _serverName: string;
}

/**
 * Type guard to check if tool annotations implement McpToolAnnotation.
 */
export function isMcpToolAnnotation(
  annotation: unknown,
): annotation is McpToolAnnotation {
  if (typeof annotation !== 'object' || annotation === null) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const record = annotation as Record<string, unknown>;
  const serverName = record['_serverName'];
  return typeof serverName === 'string';
}

type ToolParams = Record<string, unknown>;

// Discriminated union for MCP Content Blocks to ensure type safety.
type McpTextBlock = {
  type: 'text';
  text: string;
};

type McpMediaBlock = {
  type: 'image' | 'audio';
  mimeType: string;
  data: string;
};

type McpResourceBlock = {
  type: 'resource';
  resource: {
    text?: string;
    blob?: string;
    mimeType?: string;
  };
};

type McpResourceLinkBlock = {
  type: 'resource_link';
  uri: string;
  title?: string;
  name?: string;
};

type McpContentBlock =
  | McpTextBlock
  | McpMediaBlock
  | McpResourceBlock
  | McpResourceLinkBlock;

export class DiscoveredMCPToolInvocation extends BaseToolInvocation<
  ToolParams,
  ToolResult
> {
  private static readonly allowlist: Set<string> = new Set();

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    readonly displayName: string,
    messageBus: MessageBus,
    readonly trust?: boolean,
    params: ToolParams = {},
    private readonly cliConfig?: McpContext,
    private readonly toolDescription?: string,
    private readonly toolParameterSchema?: unknown,
    toolAnnotationsData?: Record<string, unknown>,
  ) {
    // Use composite format for policy checks: serverName__toolName
    // This enables server wildcards (e.g., "google-workspace__*")
    // while still allowing specific tool rules.
    // We use the same sanitized names as the registry to ensure policy matches.

    super(
      params,
      messageBus,
      generateValidName(
        `${serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${serverToolName}`,
      ),
      displayName,
      generateValidName(serverName),
      toolAnnotationsData,
    );
  }

  override getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    return {
      mcpName: this.serverName,
      toolName: this.serverToolName,
    };
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.cliConfig?.isTrustedFolder() && this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPToolInvocation.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPToolInvocation.allowlist.has(toolAllowListKey)
    ) {
      return false; // server and/or tool already allowlisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName, // Display original tool name in confirmation
      toolDisplayName: this.displayName, // Display global registry name exposed to model and user
      toolArgs: this.params,
      toolDescription: this.toolDescription,
      toolParameterSchema: this.toolParameterSchema,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPToolInvocation.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPToolInvocation.allowlist.add(toolAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave) {
          DiscoveredMCPToolInvocation.allowlist.add(toolAllowListKey);
          // Persistent policy updates are now handled centrally by the scheduler
        }
      },
    };
    return confirmationDetails;
  }

  // Determine if the response contains tool errors
  // This is needed because CallToolResults should return errors inside the response.
  // ref: https://modelcontextprotocol.io/specification/2025-06-18/schema#calltoolresult
  isMCPToolError(rawResponseParts: Part[]): boolean {
    const functionResponse = rawResponseParts?.[0]?.functionResponse;
    const response = functionResponse?.response;

    interface McpError {
      isError?: boolean | string;
    }

    if (response) {
      // Check for top-level isError (MCP Spec compliant)
      const isErrorTop = (response as { isError?: boolean | string }).isError;
      if (isErrorTop === true || isErrorTop === 'true') {
        return true;
      }

      // Legacy check for nested error object (keep for backward compatibility if any tools rely on it)
      const error = (response as { error?: McpError })?.error;
      const isError = error?.isError;

      if (error && (isError === true || isError === 'true')) {
        return true;
      }
    }
    return false;
  }

  async execute({ abortSignal: signal }: ExecuteOptions): Promise<ToolResult> {
    this.cliConfig?.setUserInteractedWithMcp?.();
    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: this.params,
      },
    ];

    // Race MCP tool call with abort signal to respect cancellation
    const rawResponseParts = await new Promise<Part[]>((resolve, reject) => {
      if (signal.aborted) {
        const error = new Error('Tool call aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      const onAbort = () => {
        cleanup();
        const error = new Error('Tool call aborted');
        error.name = 'AbortError';
        reject(error);
      };
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
      };
      signal.addEventListener('abort', onAbort, { once: true });

      this.mcpTool
        .callTool(functionCalls)
        .then((res) => {
          cleanup();
          resolve(res);
        })
        .catch((err) => {
          cleanup();
          reject(err);
        });
    });

    // Ensure the response is not an error
    if (this.isMCPToolError(rawResponseParts)) {
      const errorMessage = `MCP tool '${
        this.serverToolName
      }' reported tool error for function call: ${safeJsonStringify(
        functionCalls[0],
      )} with response: ${safeJsonStringify(rawResponseParts)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: `Error: MCP tool '${this.serverToolName}' reported an error.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }

    const transformedParts = transformMcpContentToParts(rawResponseParts);

    return {
      llmContent: transformedParts,
      returnDisplay: getStringifiedResultForDisplay(rawResponseParts),
    };
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  override getDisplayTitle(): string {
    // If it's a known terminal execute tool provided by JetBrains or similar,
    // and a command argument is present, return just the command.
    const command = this.params['command'];
    if (typeof command === 'string') {
      return command;
    }

    // Otherwise fallback to the display name or server tool name
    return this.displayName || this.serverToolName;
  }

  override getExplanation(): string {
    const MAX_EXPLANATION_LENGTH = 500;
    const stringified = safeJsonStringify(this.params);
    if (stringified.length > MAX_EXPLANATION_LENGTH) {
      const keys = Object.keys(this.params);
      const displayedKeys = keys.slice(0, 5);
      const keysDesc =
        displayedKeys.length > 0
          ? ` with parameters: ${displayedKeys.join(', ')}${
              keys.length > 5 ? ', ...' : ''
            }`
          : '';
      return `[Payload omitted due to length${keysDesc}]`;
    }
    return stringified;
  }
}

export class DiscoveredMCPTool extends BaseDeclarativeTool<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    description: string,
    override readonly parameterSchema: unknown,
    messageBus: MessageBus,
    readonly trust?: boolean,
    isReadOnly?: boolean,
    nameOverride?: string,
    private readonly cliConfig?: McpContext,
    override readonly extensionName?: string,
    override readonly extensionId?: string,
    private readonly _toolAnnotations?: Record<string, unknown>,
  ) {
    super(
      nameOverride ??
        generateValidName(
          `${serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${serverToolName}`,
        ),
      `${serverToolName} (${serverName} MCP Server)`,
      description,
      Kind.Other,
      parameterSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput,
      extensionName,
      extensionId,
    );
    this._isReadOnly = isReadOnly;
  }

  private readonly _isReadOnly?: boolean;

  override get isReadOnly(): boolean {
    if (this._isReadOnly !== undefined) {
      return this._isReadOnly;
    }
    return super.isReadOnly;
  }

  override get toolAnnotations(): Record<string, unknown> | undefined {
    return this._toolAnnotations;
  }

  getFullyQualifiedPrefix(): string {
    return generateValidName(
      `${this.serverName}${MCP_QUALIFIED_NAME_SEPARATOR}`,
    );
  }

  getFullyQualifiedName(): string {
    return generateValidName(
      `${this.serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${this.serverToolName}`,
    );
  }
  protected createInvocation(
    params: ToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<ToolParams, ToolResult> {
    return new DiscoveredMCPToolInvocation(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      _displayName ?? this.displayName,
      messageBus,
      this.trust,
      params,
      this.cliConfig,
      this.description,
      this.parameterSchema,
      this._toolAnnotations,
    );
  }
}

function transformTextBlock(block: McpTextBlock): Part {
  return { text: block.text };
}

function transformImageAudioBlock(
  block: McpMediaBlock,
  toolName: string,
): Part[] {
  return [
    {
      text: `[Tool '${toolName}' provided the following ${
        block.type
      } data with mime-type: ${block.mimeType}]`,
    },
    {
      inlineData: {
        mimeType: block.mimeType,
        data: block.data,
      },
    },
  ];
}

function transformResourceBlock(
  block: McpResourceBlock,
  toolName: string,
): Part | Part[] | null {
  const resource = block.resource;
  if (resource?.text) {
    return { text: resource.text };
  }
  if (resource?.blob) {
    const mimeType = resource.mimeType || 'application/octet-stream';
    return [
      {
        text: `[Tool '${toolName}' provided the following embedded resource with mime-type: ${mimeType}]`,
      },
      {
        inlineData: {
          mimeType,
          data: resource.blob,
        },
      },
    ];
  }
  return null;
}

function transformResourceLinkBlock(block: McpResourceLinkBlock): Part {
  return {
    text: `Resource Link: ${block.title || block.name} at ${block.uri}`,
  };
}

/**
 * Transforms the raw MCP content blocks from the SDK response into a
 * standard GenAI Part array.
 * @param sdkResponse The raw Part[] array from `mcpTool.callTool()`.
 * @returns A clean Part[] array ready for the scheduler.
 */
function transformMcpContentToParts(sdkResponse: Part[]): Part[] {
  const funcResponse = sdkResponse?.[0]?.functionResponse;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const mcpContent = funcResponse?.response?.['content'] as McpContentBlock[];
  const toolName = funcResponse?.name || 'unknown tool';

  if (!Array.isArray(mcpContent)) {
    return [{ text: '[Error: Could not parse tool response]' }];
  }

  const transformed = mcpContent.flatMap(
    (block: McpContentBlock): Part | Part[] | null => {
      switch (block.type) {
        case 'text':
          return transformTextBlock(block);
        case 'image':
        case 'audio':
          return transformImageAudioBlock(block, toolName);
        case 'resource':
          return transformResourceBlock(block, toolName);
        case 'resource_link':
          return transformResourceLinkBlock(block);
        default:
          return null;
      }
    },
  );

  return transformed.filter((part): part is Part => part !== null);
}

/**
 * Processes the raw response from the MCP tool to generate a clean,
 * human-readable string for display in the CLI. It summarizes non-text
 * content and presents text directly.
 *
 * @param rawResponse The raw Part[] array from the GenAI SDK.
 * @returns A formatted string representing the tool's output.
 */
function getStringifiedResultForDisplay(rawResponse: Part[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const mcpContent = rawResponse?.[0]?.functionResponse?.response?.[
    'content'
  ] as McpContentBlock[];

  if (!Array.isArray(mcpContent)) {
    return '```json\n' + JSON.stringify(rawResponse, null, 2) + '\n```';
  }

  const displayParts = mcpContent.map((block: McpContentBlock): string => {
    switch (block.type) {
      case 'text':
        return block.text;
      case 'image':
        return `[Image: ${block.mimeType}]`;
      case 'audio':
        return `[Audio: ${block.mimeType}]`;
      case 'resource_link':
        return `[Link to ${block.title || block.name}: ${block.uri}]`;
      case 'resource':
        if (block.resource?.text) {
          return block.resource.text;
        }
        return `[Embedded Resource: ${
          block.resource?.mimeType || 'unknown type'
        }]`;
      default:
        return `[Unknown content type: ${(block as { type: string }).type}]`;
    }
  });

  return displayParts.join('\n');
}

/**
 * Maximum length for a function name in the Gemini API.
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/function-calling#functiondeclaration
 */
const MAX_FUNCTION_NAME_LENGTH = 64;

/** Visible for testing */
export function generateValidName(name: string) {
  // Enforce the mcp_ prefix for all generated MCP tool names
  let validToolname = name.startsWith('mcp_') ? name : `mcp_${name}`;

  // Replace invalid characters with underscores to conform to Gemini API:
  // ^[a-zA-Z_][a-zA-Z0-9_\-.:]{0,63}$
  validToolname = validToolname.replace(/[^a-zA-Z0-9_\-.:]/g, '_');

  // Ensure it starts with a letter or underscore
  if (/^[^a-zA-Z_]/.test(validToolname)) {
    validToolname = `_${validToolname}`;
  }

  // If longer than the API limit, replace middle with '...'
  // Note: We use 63 instead of 64 to be safe, as some environments have off-by-one behaviors.
  const safeLimit = MAX_FUNCTION_NAME_LENGTH - 1;
  if (validToolname.length > safeLimit) {
    debugLogger.warn(
      `Truncating MCP tool name "${validToolname}" to fit within the 64 character limit. This tool may require user approval.`,
    );
    validToolname =
      validToolname.slice(0, 30) + '...' + validToolname.slice(-30);
  }

  return validToolname;
}
