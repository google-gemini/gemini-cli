/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import toolParameterSchema from './shell.json' with { type: 'json' };
import { SchemaValidator } from '../utils/schemaValidator.js';
export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}
import { spawn } from 'child_process';

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  // name should match TerminalTool.Name used in prompts.ts for now
  static Name: string = 'execute_bash_command';
  private readonly config: Config;
  private whitelist: Set<string> = new Set();

  constructor(config: Config) {
    const toolDisplayName = 'Shell';
    const descriptionUrl = new URL('shell.md', import.meta.url);
    const toolDescription = fs.readFileSync(descriptionUrl, 'utf-8');
    super(
      ShellTool.Name,
      toolDisplayName,
      toolDescription,
      toolParameterSchema,
    );
    this.config = config;
  }

  getDescription(params: ShellToolParams): string {
    let description = `${params.command}`;
    // append optional [./directory], prepending ./ if missing (assuming relative per validation)
    if (params.directory) {
      description += ` [${params.directory.startsWith('./') ? '' : './'}${params.directory}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    // tool description/schema should specify a single line w/o line breaks
    if (params.description) {
      description += ` (${params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  getCommandRoot(command: string): string | undefined {
    return command
      .trim() // remove leading and trailing whitespace
      .replace(/[{}()]/g, '') // remove all grouping operators
      .split(/[\s;&|]+/)[0] // split on any whitespace or separator or chaining operators and take first part
      ?.split(/[/\\]/) // split on any path separators (or return undefined if previous line was undefined)
      .pop(); // take last part and return command root (or undefined if previous line was empty)
  }

  validateToolParams(params: ShellToolParams): string | null {
    if (
      !SchemaValidator.validate(
        this.parameterSchema as Record<string, unknown>,
        params,
      )
    ) {
      return `Parameters failed schema validation.`;
    }
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }
    if (params.command.match(/[^\S ]/)) {
      return 'Command cannot contain any whitespace other than plain spaces.';
    }
    if (!this.getCommandRoot(params.command)) {
      return 'Could not identify command root to obtain permission from user.';
    }
    if (params.directory) {
      if (path.isAbsolute(params.directory)) {
        return 'Directory cannot be absolute. Must be relative to the project root directory.';
      }
      const directory = path.resolve(
        this.config.getTargetDir(),
        params.directory,
      );
      if (!fs.existsSync(directory)) {
        return 'Directory must exist.';
      }
    }
    return null;
  }

  async shouldConfirmExecute(
    params: ShellToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }
    const rootCommand = this.getCommandRoot(params.command)!; // must be non-empty string post-validation
    if (this.whitelist.has(rootCommand)) {
      return false; // already approved and whitelisted
    }
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      title: 'Confirm Shell Command',
      command: params.command,
      rootCommand,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(rootCommand);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: ShellToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [
          `Command rejected: ${params.command}`,
          `Reason: ${validationError}`,
        ].join('\n'),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // wrap command to append subprocess pids (via pgrep) to stderr
    let command = params.command.trim();
    if (!command.endsWith('&')) command += ';';
    command = `{ ${command} }; { echo __PGREP__; pgrep -g 0; echo __DONE__; } >&2`;

    // spawn command in specified directory (or project root if not specified)
    const shell = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // ensure subprocess starts its own process group (esp. in Linux)
      cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
    });

    let stdout = '';
    let output = '';
    shell.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      output += data.toString();
    });

    let stderr = '';
    let pgrepStarted = false;
    const backgroundPIDs: number[] = [];
    shell.stderr.on('data', (data: Buffer) => {
      if (data.toString().trim() === '__PGREP__') {
        pgrepStarted = true;
      } else if (data.toString().trim() === '__DONE__') {
        shell.stdout.destroy();
        shell.stderr.destroy();
      } else if (pgrepStarted) {
        // allow multiple lines and exclude shell's own pid (esp. in Linux)
        for (const line of data.toString().trim().split('\n')) {
          const pid = Number(line.trim());
          if (pid !== shell.pid) {
            backgroundPIDs.push(pid);
          }
        }
      } else {
        stderr += data.toString();
        output += data.toString();
      }
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
    });

    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;
    shell.on(
      'close',
      (_code: number | null, _signal: NodeJS.Signals | null) => {
        code = _code;
        signal = _signal;
      },
    );

    // wait for the shell to exit
    await new Promise((resolve) => shell.on('close', resolve));

    return {
      llmContent: [
        `Command: ${params.command}`,
        `Directory: ${params.directory || '(root)'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
        `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
      ].join('\n'),
      returnDisplay: output,
    };
  }
}
