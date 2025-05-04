/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { Tool, ToolResult, BaseTool } from './tools.js';
import { Config } from '../config/config.js';
import { spawn, execSync } from 'node:child_process';

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
Tool discovery and call commands can be configured in project settings.

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
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (!discoveryCmd) return;
    // remove any previously discovered tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool) {
        this.tools.delete(tool.name);
      }
    }
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
