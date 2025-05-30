/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolMcpConfirmationDetails,
} from './tools.js';

type ToolParams = Record<string, unknown>;

export const MCP_TOOL_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // default to 10 minutes

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  private static readonly whitelist: Set<string> = new Set();

  constructor(
    private readonly mcpClient: Client,
    private readonly serverName: string, // Added for server identification
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
    readonly serverToolName: string,
    readonly timeout?: number,
    readonly trust?: boolean,
  ) {
    description += `

This MCP tool was discovered from a local MCP server using JSON RPC 2.0 over stdio transport protocol.
When called, this tool will invoke the \`tools/call\` method for tool name \`${name}\`.
MCP servers can be configured in project or user settings.
Returns the MCP server response as a json string.
`;
    super(
      name,
      name,
      description,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  async shouldConfirmExecute(
    _params: ToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverWhitelistKey = this.serverName;
    const toolWhitelistKey = `${this.serverName}.${this.serverToolName}`;

    if (this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPTool.whitelist.has(serverWhitelistKey) ||
      DiscoveredMCPTool.whitelist.has(toolWhitelistKey)
    ) {
      return false; // server and/or tool already whitelisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName,
      toolDisplayName: this.name,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPTool.whitelist.add(serverWhitelistKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPTool.whitelist.add(toolWhitelistKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const result = await this.mcpClient.callTool(
      {
        name: this.serverToolName,
        arguments: params,
      },
      undefined, // skip resultSchema to specify options (RequestOptions)
      {
        timeout: this.timeout ?? MCP_TOOL_DEFAULT_TIMEOUT_MSEC,
      },
    );
    return {
      llmContent: JSON.stringify(result, null, 2),
      returnDisplay: JSON.stringify(result, null, 2),
    };
  }
}
