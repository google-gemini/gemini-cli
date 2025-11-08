/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from '@google/genai';
import type {
  AnyDeclarativeTool,
  ToolResult,
  ToolInvocation,
} from './tools.js';
import { Kind, BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import type { Config } from '../config/config.js';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { parse } from 'shell-quote';
import { ToolErrorType } from './tool-error.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

export const DISCOVERED_TOOL_PREFIX = 'discovered_tool_';

type ToolParams = Record<string, unknown>;

class DiscoveredToolInvocation extends BaseToolInvocation<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    private readonly originalToolName: string,
    prefixedToolName: string,
    params: ToolParams,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, prefixedToolName);
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.originalToolName]);
    child.stdin.write(JSON.stringify(this.params));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let error: Error | null = null;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;

    await new Promise<void>((resolve) => {
      const onStdout = (data: Buffer) => {
        stdout += data?.toString();
      };

      const onStderr = (data: Buffer) => {
        stderr += data?.toString();
      };

      const onError = (err: Error) => {
        error = err;
      };

      const onClose = (
        _code: number | null,
        _signal: NodeJS.Signals | null,
      ) => {
        code = _code;
        signal = _signal;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
        child.removeListener('error', onError);
        child.removeListener('close', onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('close', onClose);
    });

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
        error: {
          message: llmContent,
          type: ToolErrorType.DISCOVERED_TOOL_EXECUTION_ERROR,
        },
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

export class DiscoveredTool extends BaseDeclarativeTool<
  ToolParams,
  ToolResult
> {
  private readonly originalName: string;

  constructor(
    private readonly config: Config,
    originalName: string,
    prefixedName: string,
    description: string,
    override readonly parameterSchema: Record<string, unknown>,
    messageBus?: MessageBus,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    const fullDescription =
      description +
      `

This tool was discovered from the project by executing the command \`${discoveryCmd}\` on project root.
When called, this tool will execute the command \`${callCommand} ${originalName}\` on project root.
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
    super(
      prefixedName,
      prefixedName,
      fullDescription,
      Kind.Other,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
    this.originalName = originalName;
  }

  protected createInvocation(
    params: ToolParams,
    _messageBus?: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<ToolParams, ToolResult> {
    return new DiscoveredToolInvocation(
      this.config,
      this.originalName,
      this.name,
      params,
      _messageBus,
    );
  }
}

export class ToolRegistry {
  // The tools keyed by tool name as seen by the LLM.
  // This includes tools which are currently not active, use `getActiveTools`
  // and `isActive` to get only the active tools.
  private allKnownTools: Map<string, AnyDeclarativeTool> = new Map();
  private config: Config;
  private messageBus?: MessageBus;

  constructor(config: Config) {
    this.config = config;
  }

  setMessageBus(messageBus: MessageBus): void {
    this.messageBus = messageBus;
  }

  getMessageBus(): MessageBus | undefined {
    return this.messageBus;
  }

  /**
   * Registers a tool definition.
   *
   * Note that excluded tools are still registered to allow for enabling them
   * later in the session.
   *
   * @param tool - The tool object containing schema and execution logic.
   */
  registerTool(tool: AnyDeclarativeTool): void {
    if (this.allKnownTools.has(tool.name)) {
      if (tool instanceof DiscoveredMCPTool) {
        tool = tool.asFullyQualifiedTool();
      } else {
        // Decide on behavior: throw error, log warning, or allow overwrite
        debugLogger.warn(
          `Tool with name "${tool.name}" is already registered. Overwriting.`,
        );
      }
    }
    this.allKnownTools.set(tool.name, tool);
  }

  /**
   * Sorts tools as:
   * 1. Built in tools.
   * 2. Discovered tools.
   * 3. MCP tools ordered by server name.
   *
   * This is a stable sort in that tries preserve existing order.
   */
  sortTools(): void {
    const getPriority = (tool: AnyDeclarativeTool): number => {
      if (tool instanceof DiscoveredMCPTool) return 2;
      if (tool instanceof DiscoveredTool) return 1;
      return 0; // Built-in
    };

    this.allKnownTools = new Map(
      Array.from(this.allKnownTools.entries()).sort((a, b) => {
        const toolA = a[1];
        const toolB = b[1];
        const priorityA = getPriority(toolA);
        const priorityB = getPriority(toolB);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        if (priorityA === 2) {
          const serverA = (toolA as DiscoveredMCPTool).serverName;
          const serverB = (toolB as DiscoveredMCPTool).serverName;
          return serverA.localeCompare(serverB);
        }

        return 0;
      }),
    );
  }

  private removeDiscoveredTools(): void {
    for (const tool of this.allKnownTools.values()) {
      if (tool instanceof DiscoveredTool || tool instanceof DiscoveredMCPTool) {
        this.allKnownTools.delete(tool.name);
      }
    }
  }

  /**
   * Removes all tools from a specific MCP server.
   * @param serverName The name of the server to remove tools from.
   */
  removeMcpToolsByServer(serverName: string): void {
    for (const [name, tool] of this.allKnownTools.entries()) {
      if (tool instanceof DiscoveredMCPTool && tool.serverName === serverName) {
        this.allKnownTools.delete(name);
      }
    }
  }

  /**
   * Discovers tools from project (if available and configured).
   * Can be called multiple times to update discovered tools.
   * This will discover tools from the command line and from MCP servers.
   */
  async discoverAllTools(): Promise<void> {
    // remove any previously discovered tools
    this.removeDiscoveredTools();
    await this.discoverAndRegisterToolsFromCommand();
  }

  private async discoverAndRegisterToolsFromCommand(): Promise<void> {
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (!discoveryCmd) {
      return;
    }

    try {
      const cmdParts = parse(discoveryCmd);
      if (cmdParts.length === 0) {
        throw new Error(
          'Tool discovery command is empty or contains only whitespace.',
        );
      }
      const proc = spawn(cmdParts[0] as string, cmdParts.slice(1) as string[]);
      let stdout = '';
      const stdoutDecoder = new StringDecoder('utf8');
      let stderr = '';
      const stderrDecoder = new StringDecoder('utf8');
      let sizeLimitExceeded = false;
      const MAX_STDOUT_SIZE = 10 * 1024 * 1024; // 10MB limit
      const MAX_STDERR_SIZE = 10 * 1024 * 1024; // 10MB limit

      let stdoutByteLength = 0;
      let stderrByteLength = 0;

      proc.stdout.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stdoutByteLength + data.length > MAX_STDOUT_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stdoutByteLength += data.length;
        stdout += stdoutDecoder.write(data);
      });

      proc.stderr.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stderrByteLength + data.length > MAX_STDERR_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stderrByteLength += data.length;
        stderr += stderrDecoder.write(data);
      });

      await new Promise<void>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();

          if (sizeLimitExceeded) {
            return reject(
              new Error(
                `Tool discovery command output exceeded size limit of ${MAX_STDOUT_SIZE} bytes.`,
              ),
            );
          }

          if (code !== 0) {
            coreEvents.emitFeedback(
              'error',
              `Tool discovery command failed with code ${code}.`,
              stderr,
            );
            return reject(
              new Error(`Tool discovery command failed with exit code ${code}`),
            );
          }
          resolve();
        });
      });

      // execute discovery command and extract function declarations (w/ or w/o "tool" wrappers)
      const functions: FunctionDeclaration[] = [];
      const discoveredItems = JSON.parse(stdout.trim());

      if (!discoveredItems || !Array.isArray(discoveredItems)) {
        throw new Error(
          'Tool discovery command did not return a JSON array of tools.',
        );
      }

      for (const tool of discoveredItems) {
        if (tool && typeof tool === 'object') {
          if (Array.isArray(tool['function_declarations'])) {
            functions.push(...tool['function_declarations']);
          } else if (Array.isArray(tool['functionDeclarations'])) {
            functions.push(...tool['functionDeclarations']);
          } else if (tool['name']) {
            functions.push(tool as FunctionDeclaration);
          }
        }
      }
      // register each function as a tool
      for (const func of functions) {
        if (!func.name) {
          debugLogger.warn('Discovered a tool with no name. Skipping.');
          continue;
        }
        const parameters =
          func.parametersJsonSchema &&
          typeof func.parametersJsonSchema === 'object' &&
          !Array.isArray(func.parametersJsonSchema)
            ? func.parametersJsonSchema
            : {};
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name,
            DISCOVERED_TOOL_PREFIX + func.name,
            func.description ?? '',
            parameters as Record<string, unknown>,
            this.messageBus,
          ),
        );
      }
    } catch (e) {
      console.error(`Tool discovery command "${discoveryCmd}" failed:`, e);
      throw e;
    }
  }

  /**
   * @returns All the tools that are not excluded.
   */
  private getActiveTools(): AnyDeclarativeTool[] {
    const excludedTools = this.config.getExcludeTools() ?? new Set([]);
    const activeTools: AnyDeclarativeTool[] = [];
    for (const tool of this.allKnownTools.values()) {
      if (this.isActiveTool(tool, excludedTools)) {
        activeTools.push(tool);
      }
    }
    return activeTools;
  }

  /**
   * @param tool
   * @param excludeTools (optional, helps performance for repeated calls)
   * @returns Whether or not the `tool` is not excluded.
   */
  private isActiveTool(
    tool: AnyDeclarativeTool,
    excludeTools?: Set<string>,
  ): boolean {
    excludeTools ??= this.config.getExcludeTools() ?? new Set([]);
    const normalizedClassName = tool.constructor.name.replace(/^_+/, '');
    const possibleNames = [tool.name, normalizedClassName];
    if (tool instanceof DiscoveredMCPTool) {
      // Check both the unqualified and qualified name for MCP tools.
      if (tool.name.startsWith(tool.getFullyQualifiedPrefix())) {
        possibleNames.push(
          tool.name.substring(tool.getFullyQualifiedPrefix().length),
        );
      } else {
        possibleNames.push(`${tool.getFullyQualifiedPrefix()}${tool.name}`);
      }
    }
    return !possibleNames.some((name) => excludeTools.has(name));
  }

  /**
   * Retrieves the list of tool schemas (FunctionDeclaration array).
   * Extracts the declarations from the ToolListUnion structure.
   * Includes discovered (vs registered) tools if configured.
   * @returns An array of FunctionDeclarations.
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    this.getActiveTools().forEach((tool) => {
      declarations.push(tool.schema);
    });
    return declarations;
  }

  /**
   * Retrieves a filtered list of tool schemas based on a list of tool names.
   * @param toolNames - An array of tool names to include.
   * @returns An array of FunctionDeclarations for the specified tools.
   */
  getFunctionDeclarationsFiltered(toolNames: string[]): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    for (const name of toolNames) {
      const tool = this.allKnownTools.get(name);
      if (tool && this.isActiveTool(tool)) {
        declarations.push(tool.schema);
      }
    }
    return declarations;
  }

  /**
   * Returns an array of all registered and discovered tool names which are not
   * excluded via configuration.
   */
  getAllToolNames(): string[] {
    return this.getActiveTools().map((tool) => tool.name);
  }

  /**
   * Returns an array of all registered and discovered tool instances.
   */
  getAllTools(): AnyDeclarativeTool[] {
    return this.getActiveTools().sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  /**
   * Returns an array of tools registered from a specific MCP server.
   */
  getToolsByServer(serverName: string): AnyDeclarativeTool[] {
    const serverTools: AnyDeclarativeTool[] = [];
    for (const tool of this.getActiveTools()) {
      if ((tool as DiscoveredMCPTool)?.serverName === serverName) {
        serverTools.push(tool);
      }
    }
    return serverTools.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get the definition of a specific tool.
   */
  getTool(name: string): AnyDeclarativeTool | undefined {
    const tool = this.allKnownTools.get(name);
    if (tool && this.isActiveTool(tool)) {
      return tool;
    }
    return;
  }
}
