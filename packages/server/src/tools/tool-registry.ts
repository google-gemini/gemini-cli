/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { Tool, ToolResult, BaseTool } from './tools.js';
import { Config } from '../config/config.js';
import { parse } from 'shell-quote';
import { spawn, execSync } from 'node:child_process';
// TODO: remove this dependency once MCP support is built into genai SDK
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
type ToolParams = Record<string, unknown>;

export class DiscoveredTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    description += `

This tool was discovered from the project by executing the command \`${discoveryCmd}\` on project root.
When called, this tool will execute the command \`${callCommand} ${name}\` on project root.
Tool discovery and call commands can be configured in project or user settings.

When called, the tool call command is executed as a subprocess.
On success, tool output is returned as a json string.
Otherwise, the following information is returned:

Stdout: Output on stdout stream. Can be \`(empty)\` or partial.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
`;
    super(name, name, description, parameterSchema);
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.name]);
    child.stdin.write(JSON.stringify(params));
    child.stdin.end();
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    let error: Error | null = null;
    child.on('error', (err: Error) => {
      error = err;
    });
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;
    child.on(
      'close',
      (_code: number | null, _signal: NodeJS.Signals | null) => {
        code = _code;
        signal = _signal;
      },
    );
    await new Promise((resolve) => child.on('close', resolve));

    // if there is any error, non-zero exit code, signal, or stderr, return error details instead of stdout
    if (error || code !== 0 || signal || stderr) {
      const llmContent = [
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
      ].join('\n');
      return {
        llmContent,
        returnDisplay: llmContent,
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly mcpClient: Client,
    private readonly config: Config,
    readonly name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
    readonly serverToolName: string,
  ) {
    description += `

This MCP tool was discovered from a local MCP server using JSON RPC 2.0 over stdio transport protocol.
When called, this tool will invoke the \`tools/call\` method for tool name \`${name}\`.
MCP servers can be configured in project or user settings.
Returns the MCP server response as a json string.
`;
    super(name, name, description, parameterSchema);
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const result = await this.mcpClient.callTool({
      name: this.serverToolName,
      arguments: params,
    });
    return {
      llmContent: JSON.stringify(result, null, 2),
      returnDisplay: JSON.stringify(result, null, 2),
    };
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(private readonly config: Config) {}

  /**
   * Registers a tool definition.
   * @param tool - The tool object containing schema and execution logic.
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      // Decide on behavior: throw error, log warning, or allow overwrite
      console.warn(
        `Tool with name "${tool.name}" is already registered. Overwriting.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Discovers tools from project, if a discovery command is configured.
   * Can be called multiple times to update discovered tools.
   */
  discoverTools(): void {
    // remove any previously discovered tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool) {
        this.tools.delete(tool.name);
      }
    }
    // discover tools using discovery command, if configured
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (discoveryCmd) {
      // execute discovery command and extract function declarations
      const functions: FunctionDeclaration[] = [];
      for (const tool of JSON.parse(execSync(discoveryCmd).toString().trim())) {
        functions.push(...tool['function_declarations']);
      }
      // register each function as a tool
      for (const func of functions) {
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name!,
            func.description!,
            func.parameters! as Record<string, unknown>,
          ),
        );
      }
    }
    // discover tools using MCP servers, if configured
    // convert mcpServerCommand (if any) to StdioServerParameters
    const mcpServers = this.config.getMcpServers() || {};

    if (this.config.getMcpServerCommand()) {
      const cmd = this.config.getMcpServerCommand()!;
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
    for (const [mcpServerName, mcpServer] of Object.entries(mcpServers)) {
      (async () => {
        const mcpClient = new Client({
          name: 'mcp-client',
          version: '0.0.1',
        });
        const transport = new StdioClientTransport({
          ...mcpServer,
          env: {
            ...process.env,
            ...(mcpServer.env || {}),
          } as Record<string, string>,
          stderr: 'pipe',
        });
        try {
          await mcpClient.connect(transport);
        } catch (error) {
          console.error(
            `failed to start or connect to MCP server '${mcpServerName}' ` +
              `${JSON.stringify(mcpServer)}; \n${error}`,
          );
          // Do not re-throw, let other MCP servers be discovered.
          return; // Exit this async IIFE if connection failed
        }
        mcpClient.onerror = (error) => {
          console.error('MCP ERROR', error.toString());
        };
        if (!transport.stderr) {
          throw new Error('transport missing stderr stream');
        }
        transport.stderr.on('data', (data) => {
          // filter out INFO messages logged for each request received
          if (!data.toString().includes('] INFO')) {
            console.debug('MCP STDERR', data.toString());
          }
        });
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

          this.registerTool(
            new DiscoveredMCPTool(
              mcpClient,
              this.config,
              Object.keys(mcpServers).length > 1
                ? mcpServerName + '__' + tool.name
                : tool.name,
              tool.description ?? '',
              tool.inputSchema,
              tool.name,
            ),
          );
        }
      })();
    }
  }

  /**
   * Retrieves the list of tool schemas (FunctionDeclaration array).
   * Extracts the declarations from the ToolListUnion structure.
   * Includes discovered (vs registered) tools if configured.
   * @returns An array of FunctionDeclarations.
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    this.tools.forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * Returns an array of all registered and discovered tool instances.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get the definition of a specific tool.
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}
