/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
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
  static Name: string = 'execute_bash_command';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    const toolDisplayName = 'Shell';
    const descriptionUrl = new URL('shell.md', import.meta.url);
    const toolDescription = fs.readFileSync(descriptionUrl, 'utf-8');
    super(
      ShellTool.Name,
      toolDisplayName,
      toolDescription,
      toolParameterSchema,
    );
  }

  getDescription(params: ShellToolParams): string {
    let description = `${params.command}`;
    // append optional [in directory]
    // note description is needed even if validation fails due to absolute path
    if (params.directory) {
      description += ` [in ${params.directory}]`;
    }
    // append optional (description), replacing any line breaks with spaces
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

    // wrap command to append subprocess pids (via pgrep) to temporary file
    const tempFileName = `shell_pgrep_${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    let command = params.command.trim();
    if (!command.endsWith('&')) command += ';';
    // note the final echo is only to trigger the stderr handler below
    command = `{ ${command} }; pgrep -g 0 >${tempFilePath} 2>&1; echo >&2`;

    // spawn command in specified directory (or project root if not specified)
    const shell = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // ensure subprocess starts its own process group (esp. in Linux)
      cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
    });

    let stdout = '';
    let output = '';
    shell.stdout.on('data', (data: Buffer) => {
      const str = data.toString();
      stdout += str;
      output += str;
    });

    let stderr = '';
    shell.stderr.on('data', (data: Buffer) => {
      // if the temporary file exists, close the streams and ignore any remaining output
      // otherwise the streams can remain connected to background processes
      if (fs.existsSync(tempFilePath)) {
        shell.stdout.destroy();
        shell.stderr.destroy();
      } else {
        const str = data.toString();
        stderr += str;
        output += str;
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

    // parse pids (pgrep output) from temporary file and remove it
    const backgroundPIDs: number[] = [];
    if (fs.existsSync(tempFilePath)) {
      const pgrepLines = fs
        .readFileSync(tempFilePath, 'utf8')
        .split('\n')
        .filter(Boolean);
      for (const line of pgrepLines) {
        if (!/^\d+$/.test(line)) {
          console.error(`pgrep: ${line}`);
        }
        const pid = Number(line);
        // exclude the shell subprocess pid
        if (pid !== shell.pid) {
          backgroundPIDs.push(pid);
        }
      }
      fs.unlinkSync(tempFilePath);
    } else {
      console.error('missing pgrep output');
    }

    const llmContent = [
      `Command: ${params.command}`,
      `Directory: ${params.directory || '(root)'}`,
      `Stdout: ${stdout || '(empty)'}`,
      `Stderr: ${stderr || '(empty)'}`,
      `Error: ${error ?? '(none)'}`,
      `Exit Code: ${code ?? '(none)'}`,
      `Signal: ${signal ?? '(none)'}`,
      `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
    ].join('\n');

    const returnDisplay = this.config.getDebugMode() ? llmContent : output;

    return { llmContent, returnDisplay };
  }
}
