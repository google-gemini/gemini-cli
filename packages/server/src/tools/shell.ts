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
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
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
    const schemaUrl = new URL('shell.json', import.meta.url);
    const toolParameterSchema = JSON.parse(fs.readFileSync(schemaUrl, 'utf-8'));
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
      type: 'exec',
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

  async execute(
    params: ShellToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
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
    command = `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; ( trap '' PIPE ; echo >&2 ); exit $__code;`;

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
      let str = data.toString();
      // if the temporary file exists, close the streams and finalize stdout/stderr
      // otherwise these streams can delay termination ('close' event) until all background processes exit
      if (fs.existsSync(tempFilePath)) {
        shell.stdout.destroy();
        shell.stderr.destroy();
        // exclude final \n, which should be from echo >&2 unless there are background processes writing to stderr
        if (str.endsWith('\n')) {
          str = str.slice(0, -1);
        }
      }
      stderr += str;
      output += str;
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
      // remove wrapper from user's command in error message
      error.message = error.message.replace(command, params.command);
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const closeHandler = (
      _code: number | null,
      _signal: NodeJS.Signals | null,
    ) => {
      code = _code;
      processSignal = _signal;
    };
    shell.on('close', closeHandler);

    const abortHandler = () => {
      if (shell.pid) {
        try {
          // Kill the entire process group
          process.kill(-shell.pid, 'SIGTERM');
        } catch (_e) {
          // Fallback to killing the main process if group kill fails
          try {
            shell.kill('SIGKILL'); // or 'SIGTERM'
          } catch (_killError) {
            // Ignore errors if the process is already dead
          }
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    // wait for the shell to exit
    await new Promise((resolve) => shell.on('close', resolve));

    abortSignal.removeEventListener('abort', abortHandler);

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
      if (!abortSignal.aborted) {
        console.error('missing pgrep output');
      }
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = 'Command did not complete, it was cancelled by the user';
    } else {
      llmContent = [
        `Command: ${params.command}`,
        `Directory: ${params.directory || '(root)'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
        `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (this.config.getDebugMode()) {
      returnDisplayMessage = llmContent;
    } else {
      if (output.trim()) {
        returnDisplayMessage = output;
      } else {
        // Output is empty, let's provide a reason if the command failed or was cancelled
        if (abortSignal.aborted) {
          returnDisplayMessage = 'Command cancelled by user.';
        } else if (processSignal) {
          returnDisplayMessage = `Command terminated by signal: ${processSignal}`;
        } else if (error) {
          // If error is not null, it's an Error object (or other truthy value)
          returnDisplayMessage = `Command failed: ${getErrorMessage(error)}`;
        } else if (code !== null && code !== 0) {
          returnDisplayMessage = `Command exited with code: ${code}`;
        }
        // If output is empty and command succeeded (code 0, no error/signal/abort),
        // returnDisplayMessage will remain empty, which is fine.
      }
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
}
