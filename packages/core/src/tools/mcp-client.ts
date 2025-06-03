/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { parse } from 'shell-quote';
import { MCPServerConfig } from '../config/config.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { CallableTool, FunctionDeclaration, mcpToTool } from '@google/genai';
import { ToolRegistry } from './tool-registry.js';

export async function discoverMcpTools(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
  toolRegistry: ToolRegistry,
): Promise<void> {
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

  const discoveryPromises = Object.entries(mcpServers).map(
    ([mcpServerName, mcpServerConfig]) =>
      connectAndDiscover(mcpServerName, mcpServerConfig, toolRegistry),
  );
  await Promise.all(discoveryPromises);
}

async function connectAndDiscover(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  toolRegistry: ToolRegistry,
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
    return;
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
    return;
  }

  mcpClient.onerror = (error) => {
    console.error(`MCP ERROR (${mcpServerName}):`, error.toString());
  };

  if (transport instanceof StdioClientTransport && transport.stderr) {
    transport.stderr.on('data', (data) => {
      const stderrStr = data.toString();
      // Filter out verbose INFO logs from some MCP servers
      if (!stderrStr.includes('] INFO')) {
        console.debug(`MCP STDERR (${mcpServerName}):`, stderrStr);
      }
    });
  }

  try {
    const mcpCallableTool: CallableTool = mcpToTool(mcpClient);
    const discoveredToolFunctions = await mcpCallableTool.tool();

    if (
      !discoveredToolFunctions ||
      !Array.isArray(discoveredToolFunctions.functionDeclarations)
    ) {
      console.error(
        `MCP server '${mcpServerName}' did not return valid tool function declarations. Skipping.`,
      );
      if (transport instanceof StdioClientTransport) {
        await transport.close();
      } else if (transport instanceof SSEClientTransport) {
        await transport.close();
      }
      return;
    }

    for (const funcDecl of discoveredToolFunctions.functionDeclarations) {
      if (!funcDecl.name) {
        console.warn(
          `Discovered a function declaration without a name from MCP server '${mcpServerName}'. Skipping.`,
        );
        continue;
      }

      let toolNameForModel = funcDecl.name;

      // Replace invalid characters (based on 400 error message from Gemini API) with underscores
      toolNameForModel = toolNameForModel.replace(/[^a-zA-Z0-9_.-]/g, '_');

      const existingTool = toolRegistry.getTool(toolNameForModel);
      if (existingTool) {
        toolNameForModel = mcpServerName + '__' + toolNameForModel;
      }

      // If longer than 63 characters, replace middle with '___'
      // (Gemini API says max length 64, but actual limit seems to be 63)
      if (toolNameForModel.length > 63) {
        toolNameForModel =
          toolNameForModel.slice(0, 28) + '___' + toolNameForModel.slice(-32);
      }

      // Ensure parameters is a valid JSON schema object, default to empty if not.
      const parameterSchema: Record<string, unknown> =
        funcDecl.parameters && typeof funcDecl.parameters === 'object'
          ? { ...(funcDecl.parameters as FunctionDeclaration) }
          : { type: 'object', properties: {} };

      toolRegistry.registerTool(
        new DiscoveredMCPTool(
          mcpCallableTool,
          mcpServerName,
          toolNameForModel,
          funcDecl.description ?? '',
          parameterSchema,
          funcDecl.name,
          mcpServerConfig.timeout,
          mcpServerConfig.trust,
        ),
      );
    }
  } catch (error) {
    console.error(
      `Failed to list or register tools for MCP server '${mcpServerName}': ${error}`,
    );
    // Ensure transport is cleaned up on error too
    if (
      transport instanceof StdioClientTransport ||
      transport instanceof SSEClientTransport
    ) {
      await transport.close();
    }
  }

  // If no tools were registered from this MCP server, the following 'if' block
  // will close the connection. This is done to conserve resources and prevent
  // an orphaned connection to a server that isn't providing any usable
  // functionality. Connections to servers that did provide tools are kept
  // open, as those tools will require the connection to function.
  if (toolRegistry.getToolsByServer(mcpServerName).length === 0) {
    console.log(
      `No tools registered from MCP server '${mcpServerName}'. Closing connection.`,
    );
    if (
      transport instanceof StdioClientTransport ||
      transport instanceof SSEClientTransport
    ) {
      await transport.close();
    }
  }
}
