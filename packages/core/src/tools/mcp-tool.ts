/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolMcpConfirmationDetails,
  Icon,
} from './tools.js';
import {
  CallableTool,
  Part,
  FunctionCall,
  FunctionDeclaration,
  Type,
} from '@google/genai';

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

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  private static readonly allowlist: Set<string> = new Set();

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    description: string,
    readonly parameterSchemaJson: unknown,
    readonly timeout?: number,
    readonly trust?: boolean,
    nameOverride?: string,
  ) {
    super(
      nameOverride ?? generateValidName(serverToolName),
      `${serverToolName} (${serverName} MCP Server)`,
      description,
      Icon.Hammer,
      { type: Type.OBJECT }, // this is a dummy Schema for MCP, will be not be used to construct the FunctionDeclaration
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  asFullyQualifiedTool(): DiscoveredMCPTool {
    return new DiscoveredMCPTool(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      this.description,
      this.parameterSchemaJson,
      this.timeout,
      this.trust,
      `${this.serverName}__${this.serverToolName}`,
    );
  }

  /**
   * Overrides the base schema to use parametersJsonSchema when building
   * FunctionDeclaration
   */
  override get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parametersJsonSchema: this.parameterSchemaJson,
    };
  }

  async shouldConfirmExecute(
    _params: ToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPTool.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPTool.allowlist.has(toolAllowListKey)
    ) {
      return false; // server and/or tool already allowlisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName, // Display original tool name in confirmation
      toolDisplayName: this.name, // Display global registry name exposed to model and user
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPTool.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPTool.allowlist.add(toolAllowListKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: params,
      },
    ];

    const rawResponseParts = await this.mcpTool.callTool(functionCalls);
    const transformedParts = transformMcpContentToParts(rawResponseParts);

    return {
      llmContent: transformedParts,
      returnDisplay: getStringifiedResultForDisplay(rawResponseParts),
    };
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
  const mcpContent = funcResponse?.response?.content as McpContentBlock[];
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
  const mcpContent = rawResponse?.[0]?.functionResponse?.response
    ?.content as McpContentBlock[];

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

/** Visible for testing */
export function generateValidName(name: string) {
  // Replace invalid characters (based on 400 error message from Gemini API) with underscores
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // If longer than 63 characters, replace middle with '___'
  // (Gemini API says max length 64, but actual limit seems to be 63)
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}
