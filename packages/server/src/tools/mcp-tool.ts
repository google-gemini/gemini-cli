/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { BaseTool, ToolResult } from './tools.js';

type ToolParams = Record<string, unknown>;

export const MCP_TOOL_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // default to 10 minutes

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly mcpClient: Client,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
    readonly serverToolName: string,
    readonly timeout?: number,
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
