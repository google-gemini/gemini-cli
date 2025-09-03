/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsonSchemaObjectToZodRawShape } from 'zod-from-json-schema';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TextContent } from '@modelcontextprotocol/sdk/types.js';

/**
 * Manages the registration and invocation of VS Code Language Model tools.
 */
export class LanguageModelTools {
  private log: (message: string) => void;

  constructor(log: (message: string) => void) {
    this.log = log;
  }

  /**
   * Fetches the available tools from VsCode and registers them with the MCP server.
   * @param server The MCP server instance.
   */
  async registerTools(server: McpServer) {
    this.log('Registering LM tools...');
    try {
      for (const tool of await vscode.lm.tools) {
        this.log(`Registering tool: ${tool.name}`);
        server.registerTool(
          tool.name,
          {
            description: tool.description ?? 'No description',
            inputSchema: tool.inputSchema
              ? // We can't cast directly to the Schema type or reference it
                // because it is private, `any` is the only option here.
                (jsonSchemaObjectToZodRawShape(tool.inputSchema as any) as any)
              : undefined,
          },
          async (input: object) => {
            const result = await vscode.lm.invokeTool(tool.name, {
              toolInvocationToken: undefined,
              input,
            });
            return {
              // Convert the language model content parts to text content parts.
              content: result.content.map(
                (part): TextContent => ({
                  type: 'text',
                  text: JSON.stringify(part),
                }),
              ),
            };
          },
        );
      }
      this.log('Finished registering LM tools.');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.log(`Error registering LM tools: ${errorMessage}`);
      vscode.window.showErrorMessage(
        `Error registering LM tools: ${errorMessage}`,
      );
    }
  }
}
