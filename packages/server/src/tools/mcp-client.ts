/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { parse } from 'shell-quote';
import { Config, MCPServerConfig } from '../config/config.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ToolRegistry } from './tool-registry.js';

export async function discoverMcpTools(
  config: Config,
  toolRegistry: ToolRegistry,
): Promise<void> {
  const mcpServers = config.getMcpServers() || {};

  if (config.getMcpServerCommand()) {
    const cmd = config.getMcpServerCommand()!;
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

  const discoveryPromises = Object.entries(mcpServers).map(
    ([mcpServerName, mcpServerConfig]) =>
      connectAndDiscover(
        mcpServerName,
        mcpServerConfig,
        toolRegistry,
        mcpServers,
      ),
  );
  await Promise.all(discoveryPromises);
}

async function connectAndDiscover(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  toolRegistry: ToolRegistry,
  mcpServers: Record<string, MCPServerConfig>,
): Promise<void> {
  let transport;
  if (mcpServerConfig.url) {
    transport = new SSEClientTransport(new URL(mcpServerConfig.url));
  } else if (mcpServerConfig.command) {
    transport = new StdioClientTransport({
      command: mcpServerConfig.command,
      args: mcpServerConfig.args || [],
      env: {
        ...process.env,
        ...(mcpServerConfig.env || {}),
      } as Record<string, string>,
      cwd: mcpServerConfig.cwd,
      stderr: 'pipe',
    });
  } else {
    console.error(
      `MCP server '${mcpServerName}' has invalid configuration: missing both url (for SSE) and command (for stdio). Skipping.`,
    );
    return; // Return a resolved promise as this path doesn't throw.
  }

  const mcpClient = new Client({
    name: 'gemini-cli-mcp-client',
    version: '0.0.1',
  });

  try {
    await mcpClient.connect(transport);
  } catch (error) {
    console.error(
      `failed to start or connect to MCP server '${mcpServerName}' ` +
        `${JSON.stringify(mcpServerConfig)}; \n${error}`,
    );
    return; // Return a resolved promise, let other MCP servers be discovered.
  }

  mcpClient.onerror = (error) => {
    console.error('MCP ERROR', error.toString());
  };

  if (transport instanceof StdioClientTransport && transport.stderr) {
    transport.stderr.on('data', (data) => {
      if (!data.toString().includes('] INFO')) {
        console.debug('MCP STDERR', data.toString());
      }
    });
  }

  try {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      // Recursively remove additionalProperties and $schema from the inputSchema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This function recursively navigates a deeply nested and potentially heterogeneous JSON schema object. Using 'any' is a pragmatic choice here to avoid overly complex type definitions for all possible schema variations.
      const removeSchemaProps = (obj: any) => {
        if (typeof obj !== 'object' || obj === null) {
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(removeSchemaProps);
        } else {
          delete obj.additionalProperties;
          delete obj.$schema;
          Object.values(obj).forEach(removeSchemaProps);
        }
      };
      removeSchemaProps(tool.inputSchema);

      // if there are multiple MCP servers, prefix tool name with mcpServerName to avoid collisions
      let toolNameForModel = tool.name;
      if (Object.keys(mcpServers).length > 1) {
        toolNameForModel = mcpServerName + '__' + toolNameForModel;
      }

      // replace invalid characters (based on 400 error message) with underscores
      toolNameForModel = toolNameForModel.replace(/[^a-zA-Z0-9_.-]/g, '_');

      // if longer than 63 characters, replace middle with '___'
      // note 400 error message says max length is 64, but actual limit seems to be 63
      if (toolNameForModel.length > 63) {
        toolNameForModel =
          toolNameForModel.slice(0, 28) + '___' + toolNameForModel.slice(-32);
      }
      toolRegistry.registerTool(
        new DiscoveredMCPTool(
          mcpClient,
          toolNameForModel,
          tool.description ?? '',
          tool.inputSchema,
          tool.name,
          mcpServerConfig.timeout,
        ),
      );
    }
  } catch (error) {
    console.error(
      `Failed to list or register tools for MCP server '${mcpServerName}': ${error}`,
    );
    // Do not re-throw, allow other servers to proceed.
  }
}
