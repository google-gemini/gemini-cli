/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { VirtualToolDefinition } from './virtual-tool-types.js';
import { getErrorMessage } from '../utils/errors.js';

export interface VirtualShellToolParams {
  [key: string]: unknown;
}

export class VirtualShellTool extends BaseTool<VirtualShellToolParams, ToolResult> {
  private script: string;
  private whitelist: Set<string> = new Set();

  constructor(definition: VirtualToolDefinition, private readonly config: Config) {
    // Initialize the BaseTool with the schema from the manifest.
    super(
      definition.schema.name || definition.name,
      definition.schema.name || definition.name,
      definition.schema.description || `A virtual tool defined in GEMINI.md.`,
      (definition.schema.parameters as Record<string, unknown>) || {},
      false, // output is not markdown
      true, // output can be updated
    );

    this.script = definition.script;
  }

  validateToolParams(params: VirtualShellToolParams): string | null {
    // Basic validation - ensure required parameters are present
    if (this.parameterSchema && typeof this.parameterSchema === 'object') {
      const schema = this.parameterSchema as { required?: string[] };
      if (schema.required) {
        for (const requiredParam of schema.required) {
          if (!(requiredParam in params)) {
            return `Missing required parameter: ${requiredParam}`;
          }
        }
      }
    }
    return null;
  }

  getDescription(params: VirtualShellToolParams): string {
    return `Execute virtual tool: ${this.name}`;
  }

  /**
   * User-defined tools are considered sensitive and should always require confirmation.
   */
  async shouldConfirmExecute(
    params: VirtualShellToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }
    
    // Check if this tool is already whitelisted
    if (this.whitelist.has(this.name)) {
      return false; // already approved and whitelisted
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Virtual Tool Execution',
      command: this.script,
      rootCommand: this.name,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(this.name);
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Executes the manifest-defined script within a secure shell environment.
   */
  async execute(
    params: VirtualShellToolParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [
          `Virtual tool '${this.name}' rejected`,
          `Reason: ${validationError}`,
        ].join('\n'),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: `Virtual tool '${this.name}' was cancelled by user before it could start.`,
        returnDisplay: 'Tool cancelled by user.',
      };
    }

    const argsJson = JSON.stringify(params);
    const isWindows = os.platform() === 'win32';

    // Create environment with GEMINI_TOOL_ARGS
    const env = {
      ...process.env,
      GEMINI_TOOL_ARGS: argsJson,
    };

    // Spawn the script with proper environment
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', this.script], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: this.config.getTargetDir(),
          env,
        })
      : spawn('bash', ['-c', this.script], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true, // ensure subprocess starts its own process group
          cwd: this.config.getTargetDir(),
          env,
        });

    let exited = false;
    let stdout = '';
    let output = '';
    let lastUpdateTime = Date.now();
    const OUTPUT_UPDATE_INTERVAL_MS = 1000;

    const appendOutput = (str: string) => {
      output += str;
      if (
        updateOutput &&
        Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS
      ) {
        updateOutput(output);
        lastUpdateTime = Date.now();
      }
    };

    shell.stdout.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stdout += str;
        appendOutput(str);
      }
    });

    let stderr = '';
    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stderr += str;
        appendOutput(str);
      }
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const exitHandler = (
      _code: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      exited = true;
      code = _code;
      processSignal = signal;
    };

    shell.on('exit', exitHandler);
    shell.on('close', exitHandler);

    // Handle abort signal
    const abortHandler = () => {
      if (!exited && shell.pid) {
        try {
          if (isWindows) {
            shell.kill('SIGTERM');
          } else {
            // Kill the entire process group
            process.kill(-shell.pid, 'SIGTERM');
          }
        } catch (e) {
          // Process might already be dead
        }
      }
    };

    abortSignal.addEventListener('abort', abortHandler);

    return new Promise<ToolResult>((resolve) => {
      shell.on('close', () => {
        abortSignal.removeEventListener('abort', abortHandler);
        
        // Final output update
        if (updateOutput && output) {
          updateOutput(output);
        }

        // Format result similar to ShellTool
        const llmContent = [
          `Tool: ${this.name}`,
          `Script: ${this.script}`,
          `Directory: ${path.relative(this.config.getTargetDir(), this.config.getTargetDir()) || '(root)'}`,
          `Stdout: ${stdout || '(empty)'}`,
          `Stderr: ${stderr || '(empty)'}`,
          `Error: ${error ? getErrorMessage(error) : '(none)'}`,
          `Exit Code: ${code !== null ? code : '(none)'}`,
          `Signal: ${processSignal || '(none)'}`,
        ].join('\n');

        const returnDisplay = `Virtual tool '${this.name}' executed.\n${output}`;

        resolve({
          llmContent,
          returnDisplay,
        });
      });
    });
  }
}