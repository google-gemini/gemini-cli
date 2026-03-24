/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Response structure for a test tool call.
 */
export interface TestToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * Definition of a test tool.
 */
export interface TestTool {
  name: string;
  description: string;
  /** JSON Schema for input arguments */
  inputSchema?: Record<string, unknown>;
  response: TestToolResponse;
}

/**
 * Configuration structure for the generic test MCP server template.
 */
export interface TestMcpConfig {
  name: string;
  version?: string;
  tools: TestTool[];
}

/**
 * Builder to easily configure a Test MCP Server in tests.
 */
export class TestMcpServerBuilder {
  private config: TestMcpConfig;

  constructor(name: string) {
    this.config = { name, tools: [] };
  }

  /**
   * Adds a tool to the test server configuration.
   * @param name Tool name
   * @param description Tool description
   * @param response The response to return. Can be a string for simple text responses.
   * @param inputSchema Optional JSON Schema for validation/documentation
   */
  addTool(
    name: string,
    description: string,
    response: TestToolResponse | string,
    inputSchema?: Record<string, unknown>,
  ): this {
    const responseObj =
      typeof response === 'string'
        ? { content: [{ type: 'text' as const, text: response }] }
        : response;

    this.config.tools.push({
      name,
      description,
      inputSchema,
      response: responseObj,
    });
    return this;
  }

  build(): TestMcpConfig {
    return this.config;
  }
}
