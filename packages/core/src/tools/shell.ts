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
  ToolPasswordConfirmationDetails,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import stripAnsi from 'strip-ansi';
import { spawn, SpawnOptions } from 'child_process';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'run_shell_command';
  private whitelist: Set<string> = new Set();
  private sudoPassword?: string;
  private sudoPasswordTimestamp?: number;
  private readonly SUDO_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      'Shell',
      `This tool executes a given shell command as \`bash -c <command>\`. Command can start background processes using \`&\`. Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.

The following information is returned:

Command: Executed command.
Directory: Directory (relative to project root) where command was executed, or \`(root)\`.
Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
Background PIDs: List of background processes started or \`(none)\`.
Process Group PGID: Process group started or \`(none)\``,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Exact bash command to execute as `bash -c <command>`',
          },
          description: {
            type: 'string',
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          directory: {
            type: 'string',
            description:
              '(OPTIONAL) Directory to run the command in, if not the project root directory. Must be relative to the project root directory and must already exist.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: ShellToolParams): string {
    let description = `${params.command}`;
    if (params.directory) {
      description += ` [in ${params.directory}]`;
    }
    if (params.description) {
      description += ` (${params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  getCommandRoot(command: string): string | undefined {
    return command
      .trim()
      .replace(/[{}()]/g, '')
      .split(/[\s;&|]+/)[0]
      ?.split(/[/\\]/)
      .pop();
  }

  isCommandAllowed(command: string): boolean {
    if (command.includes('$(') || command.includes('`')) {
      return false;
    }
    const SHELL_TOOL_NAMES = [ShellTool.name, ShellTool.Name];
    const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');
    const isPrefixedBy = (cmd: string, prefix: string): boolean => {
      if (!cmd.startsWith(prefix)) return false;
      return cmd.length === prefix.length || cmd[prefix.length] === ' ';
    };
    const extractCommands = (tools: string[]): string[] =>
      tools.flatMap((tool) => {
        for (const toolName of SHELL_TOOL_NAMES) {
          if (tool.startsWith(`${toolName}(`) && tool.endsWith(')')) {
            return [normalize(tool.slice(toolName.length + 1, -1))];
          }
        }
        return [];
      });
    const coreTools = this.config.getCoreTools() || [];
    const excludeTools = this.config.getExcludeTools() || [];
    if (SHELL_TOOL_NAMES.some((name) => excludeTools.includes(name))) {
      return false;
    }
    const blockedCommands = new Set(extractCommands(excludeTools));
    const allowedCommands = new Set(extractCommands(coreTools));
    const hasSpecificAllowedCommands = allowedCommands.size > 0;
    const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
      coreTools.includes(name),
    );
    const commandsToValidate = command.split(/&&|\|\||\||;/).map(normalize);
    for (const cmd of commandsToValidate) {
      const isBlocked = [...blockedCommands].some((blocked) =>
        isPrefixedBy(cmd, blocked),
      );
      if (isBlocked) return false;
      const isStrictAllowlist =
        hasSpecificAllowedCommands && !isWildcardAllowed;
      if (isStrictAllowlist) {
        const isAllowed = [...allowedCommands].some((allowed) =>
          isPrefixedBy(cmd, allowed),
        );
        if (!isAllowed) return false;
      }
    }
    return true;
  }

  validateToolParams(params: ShellToolParams): string | null {
    if (!this.isCommandAllowed(params.command)) {
      return `Command is not allowed: ${params.command}`;
    }
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
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false;
    }
    const rootCommand = this.getCommandRoot(params.command)!;

    const isSudo = params.command.trim().startsWith('sudo ');
    const isWindows = os.platform() === 'win32';
    if (isSudo && !isWindows) {
      const isPasswordCached =
        this.sudoPassword &&
        this.sudoPasswordTimestamp &&
        Date.now() - this.sudoPasswordTimestamp < this.SUDO_CACHE_DURATION_MS;

      if (!isPasswordCached) {
        const confirmationDetails: ToolPasswordConfirmationDetails = {
          type: 'password',
          title: 'Sudo Password Required',
          rootCommand: 'sudo',
          onConfirm: async (password: string) => {
            this.sudoPassword = password;
            this.sudoPasswordTimestamp = Date.now();
          },
        };
        return confirmationDetails;
      }
    }

    if (this.whitelist.has(rootCommand)) {
      return false;
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
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Command rejected: ${params.command}\nReason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const isWindows = os.platform() === 'win32';
    const isSudoCommand = !isWindows && params.command.trim().startsWith('sudo ');
    let commandToExecute = params.command;

    if (isSudoCommand) {
      const isPasswordCached =
        this.sudoPassword &&
        this.sudoPasswordTimestamp &&
        Date.now() - this.sudoPasswordTimestamp < this.SUDO_CACHE_DURATION_MS;

      if (!isPasswordCached) {
        return {
          llmContent: 'Sudo command rejected: password has not been provided or has expired.',
          returnDisplay: 'Error: Sudo password required.',
        };
      }
      
      const userCommand = params.command.trim();
      // Securely escape the password for shell usage
      const escapedPassword = this.sudoPassword!.replace(/'/g, "'\\''");
      commandToExecute = `echo '${escapedPassword}' | ${userCommand.replace('sudo', 'sudo -S --')}`;
    }

    const spawnOptions: SpawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows,
      cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
    };

    const tempFileName = `shell_pgrep_${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    const command = isWindows
      ? commandToExecute
      : (() => {
          let cmd = commandToExecute;
          // The pgrep wrapper should now enclose the entire secure command
          if (!cmd.trim().endsWith('&')) cmd += ';';
          return `{ ${cmd} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    const shell = isWindows
      ? spawn('cmd.exe', ['/c', command], spawnOptions)
      : spawn('bash', ['-c', command], spawnOptions);

    let exited = false;
    let stdout = '';
    let output = '';
    let lastUpdateTime = Date.now();

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

    if (shell.stdout) {
      shell.stdout.on('data', (data: Buffer) => {
        if (!exited) {
          const str = stripAnsi(data.toString());
          // Check for sudo error message and clear the bad password
          if (str.includes('sudo: a password is required') || str.includes('sudo: sorry, try again')) {
            this.sudoPassword = undefined;
            this.sudoPasswordTimestamp = undefined;
          }
          stdout += str;
          appendOutput(str);
        }
      });
    }

    let stderr = '';
    if (shell.stderr) {
      shell.stderr.on('data', (data: Buffer) => {
        if (!exited) {
          const str = stripAnsi(data.toString());
          if (str.includes('sudo: a password is required') || str.includes('sudo: sorry, try again')) {
            this.sudoPassword = undefined;
            this.sudoPasswordTimestamp = undefined;
          }
          stderr += str;
          appendOutput(str);
        }
      });
    }

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
      error.message = error.message.replace(command, params.command);
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const exitHandler = (
      _code: number | null,
      _signal: NodeJS.Signals | null,
    ) => {
      exited = true;
      code = _code;
      processSignal = _signal;
    };
    shell.on('exit', exitHandler);

    const abortHandler = async () => {
      if (shell.pid && !exited) {
        if (os.platform() === 'win32') {
          spawn('taskkill', ['/pid', shell.pid.toString(), '/f', '/t']);
        } else {
          try {
            process.kill(-shell.pid, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (shell.pid && !exited) {
              process.kill(-shell.pid, 'SIGKILL');
            }
          } catch (_e) {
            try {
              if (shell.pid) shell.kill('SIGKILL');
            } catch (_e) {
              console.error(`failed to kill shell process ${shell.pid}: ${_e}`);
            }
          }
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    const backgroundPIDs: number[] = [];
    if (os.platform() !== 'win32') {
      if (fs.existsSync(tempFilePath)) {
        const pgrepLines = fs.readFileSync(tempFilePath, 'utf8').split('\n').filter(Boolean);
        for (const line of pgrepLines) {
          if (!/^\d+$/.test(line)) {
            console.error(`pgrep: ${line}`);
          }
          const pid = Number(line);
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
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = 'Command was cancelled by user before it could complete.';
      if (output.trim()) {
        llmContent += ` Below is the output (on stdout and stderr) before it was cancelled:\n${output}`;
      } else {
        llmContent += ' There was no output before it was cancelled.';
      }
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
        `Process Group PGID: ${shell.pid ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (this.config.getDebugMode()) {
      returnDisplayMessage = llmContent;
    } else {
      if (output.trim()) {
        returnDisplayMessage = output;
      } else {
        if (abortSignal.aborted) {
          returnDisplayMessage = 'Command cancelled by user.';
        } else if (processSignal) {
          returnDisplayMessage = `Command terminated by signal: ${processSignal}`;
        } else if (error) {
          returnDisplayMessage = `Command failed: ${getErrorMessage(error)}`;
        } else if (code !== null && code !== 0) {
          returnDisplayMessage = `Command exited with code: ${code}`;
        }
      }
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
}