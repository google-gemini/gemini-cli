/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, SpawnOptions } from 'child_process';
import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';

export interface TerminalToolParams {
  command: string;
}

const MAX_OUTPUT_LENGTH = 10000;
const DEFAULT_EXEC_TIMEOUT_MS = 5 * 60 * 1000;

const BANNED_COMMAND_ROOTS = [
  'alias',
  'bg',
  'command',
  'declare',
  'dirs',
  'disown',
  'enable',
  'eval',
  'exec',
  'exit',
  'export',
  'fc',
  'fg',
  'getopts',
  'hash',
  'history',
  'jobs',
  'kill',
  'let',
  'local',
  'logout',
  'popd',
  'printf',
  'pushd',
  'read',
  'readonly',
  'set',
  'shift',
  'shopt',
  'source',
  'suspend',
  'test',
  'times',
  'trap',
  'type',
  'typeset',
  'ulimit',
  'umask',
  'unalias',
  'unset',
  'wait',
  'curl',
  'wget',
  'nc',
  'telnet',
  'ssh',
  'scp',
  'ftp',
  'sftp',
  'http',
  'https',
  'rsync',
  'lynx',
  'w3m',
  'links',
  'elinks',
  'httpie',
  'xh',
  'http-prompt',
  'chrome',
  'firefox',
  'safari',
  'edge',
  'xdg-open',
  'open',
];

/**
 * Simplified implementation of the Terminal tool logic for single command execution.
 */
export class TerminalLogic extends BaseTool<TerminalToolParams, ToolResult> {
  static readonly Name = 'execute_bash_command';
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    super(
      TerminalLogic.Name,
      '', // Display name handled by CLI wrapper
      '', // Description handled by CLI wrapper
      {
        type: 'object',
        properties: {
          command: {
            description: `The exact bash command or sequence of commands (using ';' or '&&') to execute. Must adhere to usage guidelines. Example: 'npm install && npm run build'`,
            type: 'string',
          },
        },
        required: ['command'],
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
  }

  validateParams(params: TerminalToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return "Parameters failed schema validation (expecting only 'command').";
    }
    const commandOriginal = params.command.trim();
    if (!commandOriginal) {
      return 'Command cannot be empty.';
    }
    const commandParts = commandOriginal.split(/[\s;&&|]+/);
    for (const part of commandParts) {
      if (!part) continue;
      const cleanPart =
        part
          .replace(/^[^a-zA-Z0-9]+/, '')
          .split(/[/\\]/)
          .pop() || part.replace(/^[^a-zA-Z0-9]+/, '');
      if (cleanPart && BANNED_COMMAND_ROOTS.includes(cleanPart.toLowerCase())) {
        return `Command contains a banned keyword: '${cleanPart}'. Banned list includes network tools, session control, etc.`;
      }
    }
    return null;
  }

  getDescription(params: TerminalToolParams): string {
    return params.command;
  }

  async execute(
    params: TerminalToolParams,
    executionCwd?: string,
    timeout: number = DEFAULT_EXEC_TIMEOUT_MS,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Command rejected: ${params.command}\nReason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const cwd = executionCwd ? path.resolve(executionCwd) : this.rootDirectory;
    if (!cwd.startsWith(this.rootDirectory) && cwd !== this.rootDirectory) {
      const message = `Execution CWD validation failed: Attempted path "${cwd}" resolves outside the allowed root directory "${this.rootDirectory}".`;
      return {
        llmContent: `Command rejected: ${params.command}\nReason: ${message}`,
        returnDisplay: `Error: ${message}`,
      };
    }

    return new Promise((resolve) => {
      const spawnOptions: SpawnOptions = {
        cwd,
        shell: true,
        env: { ...process.env },
        stdio: 'pipe',
        windowsHide: true,
        timeout: timeout,
      };
      let stdout = '';
      let stderr = '';
      let processError: Error | null = null;
      let timedOut = false;

      try {
        const child = spawn(params.command, spawnOptions);
        child.stdout!.on('data', (data) => {
          stdout += data.toString();
          if (stdout.length > MAX_OUTPUT_LENGTH) {
            stdout = this.truncateOutput(stdout);
            child.stdout!.pause();
          }
        });
        child.stderr!.on('data', (data) => {
          stderr += data.toString();
          if (stderr.length > MAX_OUTPUT_LENGTH) {
            stderr = this.truncateOutput(stderr);
            child.stderr!.pause();
          }
        });
        child.on('error', (err) => {
          processError = err;
          console.error(
            `TerminalLogic spawn error for "${params.command}":`,
            err,
          );
        });
        child.on('close', (code, signal) => {
          const exitCode = code ?? (signal ? -1 : -2);
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            if (child.killed && timeout > 0) timedOut = true;
          }
          const finalStdout = this.truncateOutput(stdout);
          const finalStderr = this.truncateOutput(stderr);
          let llmContent = `Command: ${params.command}\nExecuted in: ${cwd}\nExit Code: ${exitCode}\n`;
          if (timedOut) llmContent += `Status: Timed Out after ${timeout}ms\n`;
          if (processError)
            llmContent += `Process Error: ${processError.message}\n`;
          llmContent += `Stdout:\n${finalStdout}\nStderr:\n${finalStderr}`;
          let displayOutput = finalStderr.trim() || finalStdout.trim();
          if (timedOut)
            displayOutput = `Timeout: ${displayOutput || 'No output before timeout'}`;
          else if (exitCode !== 0 && !displayOutput)
            displayOutput = `Failed (Exit Code: ${exitCode})`;
          else if (exitCode === 0 && !displayOutput)
            displayOutput = `Success (no output)`;
          resolve({
            llmContent,
            returnDisplay: displayOutput.trim() || `Exit Code: ${exitCode}`,
          });
        });
      } catch (spawnError: unknown) {
        const errMsg = getErrorMessage(spawnError);
        console.error(
          `TerminalLogic failed to spawn "${params.command}":`,
          spawnError,
        );
        resolve({
          llmContent: `Failed to start command: ${params.command}\nError: ${errMsg}`,
          returnDisplay: `Error spawning command: ${errMsg}`,
        });
      }
    });
  }

  private truncateOutput(
    output: string,
    limit: number = MAX_OUTPUT_LENGTH,
  ): string {
    if (output.length > limit) {
      return (
        output.substring(0, limit) +
        `\n... [Output truncated at ${limit} characters]`
      );
    }
    return output;
  }
}
