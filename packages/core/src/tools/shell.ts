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
  Icon,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import stripAnsi from 'strip-ansi';

export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}
import { spawn } from 'child_process';
import { summarizeToolOutput } from '../utils/summarizer.js';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'run_shell_command';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      'Shell',
      `This tool executes a given shell command as \`bash -c <command>\`. Command can start background processes using \`&\`. Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.\n\nThe following information is returned:\n\nCommand: Executed command.\nDirectory: Directory (relative to project root) where command was executed, or \`(root)\` .\nStdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.\nStderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.\nError: Error or \`(none)\` if no error was reported for the subprocess.\nExit Code: Exit code or \`(none)\` if terminated by signal.\nSignal: Signal number or \`(none)\` if no signal was received.\nBackground PIDs: List of background processes started or \`(none)\` .\nProcess Group PGID: Process group started or \`(none)\` `,
      Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: 'Exact bash command to execute as `bash -c <command>`',
          },
          description: {
            type: Type.STRING,
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          directory: {
            type: Type.STRING,
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

  /**
   * Splits a shell command into a list of individual commands, respecting quotes.
   * This is used to separate chained commands (e.g., using &&, ||, ;).
   * @param command The shell command string to parse
   * @returns An array of individual command strings
   */
  private splitCommands(command: string): string[] {
    const commands: string[] = [];
    let currentCommand = '';
    let inSingleQuotes = false;
    let inDoubleQuotes = false;
    let i = 0;

    while (i < command.length) {
      const char = command[i];
      const nextChar = command[i + 1];

      if (char === '\\' && i < command.length - 1) {
        currentCommand += char + command[i + 1];
        i += 2;
        continue;
      }

      if (char === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
      } else if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
      }

      if (!inSingleQuotes && !inDoubleQuotes) {
        if (
          (char === '&' && nextChar === '&') ||
          (char === '|' && nextChar === '|')
        ) {
          commands.push(currentCommand.trim());
          currentCommand = '';
          i++; // Skip the next character
        } else if (char === ';' || char === '&' || char === '|') {
          commands.push(currentCommand.trim());
          currentCommand = '';
        } else {
          currentCommand += char;
        }
      } else {
        currentCommand += char;
      }
      i++;
    }

    if (currentCommand.trim()) {
      commands.push(currentCommand.trim());
    }

    return commands.filter(Boolean); // Filter out any empty strings
  }

  /**
   * Extracts the root command from a given shell command string.
   * This is used to identify the base command for permission checks.
   * @param command The shell command string to parse
   * @returns The root command name, or undefined if it cannot be determined
   * @example getCommandRoot("ls -la /tmp") returns "ls"
   * @example getCommandRoot("git status && npm test") returns "git"
   */
  getCommandRoot(command: string): string | undefined {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return undefined;
    }

    // This regex is designed to find the first "word" of a command,
    // while respecting quotes. It looks for a sequence of non-whitespace
    // characters that are not inside quotes.
    const match = trimmedCommand.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
    if (match) {
      // The first element in the match array is the full match.
      // The subsequent elements are the capture groups.
      // We prefer a captured group because it will be unquoted.
      const commandRoot = match[1] || match[2] || match[3];
      if (commandRoot) {
        // If the command is a path, return the last component.
        return commandRoot.split(/[\\/]/).pop();
      }
    }

    return undefined;
  }

  getCommandRoots(command: string): string[] {
    if (!command) {
      return [];
    }
    return this.splitCommands(command)
      .map((c) => this.getCommandRoot(c))
      .filter((c): c is string => !!c);
  }

  stripShellWrapper(command: string): string {
    const pattern = /^\s*(?:sh|bash|zsh|cmd.exe)\s+(?:\/c|-c)\s+/;
    const match = command.match(pattern);
    if (match) {
      let newCommand = command.substring(match[0].length).trim();
      if (
        (newCommand.startsWith('"') && newCommand.endsWith('"')) ||
        (newCommand.startsWith("'") && newCommand.endsWith("'"))
      ) {
        newCommand = newCommand.substring(1, newCommand.length - 1);
      }
      return newCommand;
    }
    return command.trim();
  }

  /**
   * Detects command substitution patterns in a shell command, following bash quoting rules:
   * - Single quotes ('): Everything literal, no substitution possible
   * - Double quotes ("): Command substitution with $() and backticks unless escaped with \
   * - No quotes: Command substitution with $(), <(), and backticks
   * @param command The shell command string to check
   * @returns true if command substitution would be executed by bash
   */
  private detectCommandSubstitution(command: string): boolean {
    let inSingleQuotes = false;
    let inDoubleQuotes = false;
    let inBackticks = false;
    let i = 0;

    while (i < command.length) {
      const char = command[i];
      const nextChar = command[i + 1];

      // Handle escaping - only works outside single quotes
      if (char === '\\' && !inSingleQuotes) {
        i += 2; // Skip the escaped character
        continue;
      }

      // Handle quote state changes
      if (char === "'" && !inDoubleQuotes && !inBackticks) {
        inSingleQuotes = !inSingleQuotes;
      } else if (char === '"' && !inSingleQuotes && !inBackticks) {
        inDoubleQuotes = !inDoubleQuotes;
      } else if (char === '`' && !inSingleQuotes) {
        // Backticks work outside single quotes (including in double quotes)
        inBackticks = !inBackticks;
      }

      // Check for command substitution patterns that would be executed
      if (!inSingleQuotes) {
        // $(...) command substitution - works in double quotes and unquoted
        if (char === '$' && nextChar === '(') {
          return true;
        }

        // <(...) process substitution - works unquoted only (not in double quotes)
        if (
          char === '<' &&
          nextChar === '(' &&
          !inDoubleQuotes &&
          !inBackticks
        ) {
          return true;
        }

        // Backtick command substitution - check for opening backtick
        // (We track the state above, so this catches the start of backtick substitution)
        if (char === '`' && !inBackticks) {
          return true;
        }
      }

      i++;
    }

    return false;
  }

  /**
   * Determines whether a given shell command is allowed to execute based on
   * the tool's configuration including allowlists and blocklists.
   * @param command The shell command string to validate
   * @returns An object with 'allowed' boolean and optional 'reason' string if not allowed
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    // 0. Disallow command substitution
    // Parse the command to check for unquoted/unescaped command substitution
    const hasCommandSubstitution = this.detectCommandSubstitution(command);
    if (hasCommandSubstitution) {
      return {
        allowed: false,
        reason:
          'Command substitution using $(), <(), or >() is not allowed for security reasons',
      };
    }

    const SHELL_TOOL_NAMES = [ShellTool.name, ShellTool.Name];

    const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');

    /**
     * Checks if a command string starts with a given prefix, ensuring it's a
     * whole word match (i.e., followed by a space or it's an exact match).
     * e.g., \`isPrefixedBy('npm install', 'npm')\` -> true
     * e.g., \`isPrefixedBy('npm', 'npm')\` -> true
     * e.g., \`isPrefixedBy('npminstall', 'npm')\` -> false
     */
    const isPrefixedBy = (cmd: string, prefix: string): boolean => {
      if (!cmd.startsWith(prefix)) {
        return false;
      }
      return cmd.length === prefix.length || cmd[prefix.length] === ' ';
    };

    /**
     * Extracts and normalizes shell commands from a list of tool strings.
     * e.g., 'ShellTool("ls -l")' becomes 'ls -l'
     */
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

    // 1. Check if the shell tool is globally disabled.
    if (SHELL_TOOL_NAMES.some((name) => excludeTools.includes(name))) {
      return {
        allowed: false,
        reason: 'Shell tool is globally disabled in configuration',
      };
    }

    const blockedCommands = new Set(extractCommands(excludeTools));
    const allowedCommands = new Set(extractCommands(coreTools));

    const hasSpecificAllowedCommands = allowedCommands.size > 0;
    const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
      coreTools.includes(name),
    );

    const commandsToValidate = this.splitCommands(command).map(normalize);

    const blockedCommandsArr = [...blockedCommands];

    for (const cmd of commandsToValidate) {
      // 2. Check if the command is on the blocklist.
      const isBlocked = blockedCommandsArr.some((blocked) =>
        isPrefixedBy(cmd, blocked),
      );
      if (isBlocked) {
        return {
          allowed: false,
          reason: `Command '${cmd}' is blocked by configuration`,
        };
      }

      // 3. If in strict allow-list mode, check if the command is permitted.
      const isStrictAllowlist =
        hasSpecificAllowedCommands && !isWildcardAllowed;
      const allowedCommandsArr = [...allowedCommands];
      if (isStrictAllowlist) {
        const isAllowed = allowedCommandsArr.some((allowed) =>
          isPrefixedBy(cmd, allowed),
        );
        if (!isAllowed) {
          return {
            allowed: false,
            reason: `Command '${cmd}' is not in the allowed commands list`,
          };
        }
      }
    }

    // 4. If all checks pass, the command is allowed.
    return { allowed: true };
  }

  validateToolParams(params: ShellToolParams): string | null {
    const commandCheck = this.isCommandAllowed(params.command);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        console.error(
          'Unexpected: isCommandAllowed returned false without a reason',
        );
        return `Command is not allowed: ${params.command}`;
      }
      return commandCheck.reason;
    }
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }
    if (this.getCommandRoots(params.command).length === 0) {
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
      return false; // skip confirmation, execute call will fail immediately
    }

    const command = this.stripShellWrapper(params.command);
    const rootCommands = [...new Set(this.getCommandRoots(command))];
    const commandsToConfirm = rootCommands.filter(
      (command) => !this.allowlist.has(command),
    );

    if (commandsToConfirm.length === 0) {
      return false; // already approved and whitelisted
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: params.command,
      rootCommand: commandsToConfirm.join(', '),
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          commandsToConfirm.forEach((command) => this.whitelist.add(command));
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: ShellToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const strippedCommand = this.stripShellWrapper(params.command);
    const validationError = this.validateToolParams({
      ...params,
      command: strippedCommand,
    });
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: validationError,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    // pgrep is not available on Windows, so we can't get background PIDs
    const commandToExecute = isWindows
      ? strippedCommand
      : (() => {
          // wrap command to append subprocess pids (via pgrep) to temporary file
          let command = strippedCommand.trim();
          if (!command.endsWith('&')) command += ';';
          return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    // spawn command in specified directory (or project root if not specified)
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          // detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
        })
      : spawn('bash', ['-c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
        });

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

    shell.stdout.on('data', (data: Buffer) => {
      // continue to consume post-exit for background processes
      // removing listeners can overflow OS buffer and block subprocesses
      // destroying (e.g. shell.stdout.destroy()) can terminate subprocesses via SIGPIPE
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
      // remove wrapper from user's command in error message
      error.message = error.message.replace(commandToExecute, params.command);
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
          // For Windows, use taskkill to kill the process tree
          spawn('taskkill', ['/pid', shell.pid.toString(), '/f', '/t']);
        } else {
          try {
            // attempt to SIGTERM process group (negative PID)
            // fall back to SIGKILL (to group) after 200ms
            process.kill(-shell.pid, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (shell.pid && !exited) {
              process.kill(-shell.pid, 'SIGKILL');
            }
          } catch (_e) {
            // if group kill fails, fall back to killing just the main process
            try {
              if (shell.pid) {
                shell.kill('SIGKILL');
              }
            } catch (_e) {
              console.error(`failed to kill shell process ${shell.pid}: ${_e}`);
            }
          }
        }
      }
    };
    signal.addEventListener('abort', abortHandler);

    // wait for the shell to exit
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }

    // parse pids (pgrep output) from temporary file and remove it
    const backgroundPIDs: number[] = [];
    if (os.platform() !== 'win32') {
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
        if (!signal.aborted) {
          console.error('missing pgrep output');
        }
      }
    }

    let llmContent = '';
    if (signal.aborted) {
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
        // Output is empty, let's provide a reason if the command failed or was cancelled
        if (signal.aborted) {
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

    const summarizeConfig = this.config.getSummarizeToolOutputConfig();
    if (summarizeConfig && summarizeConfig[this.name]) {
      const summary = await summarizeToolOutput(
        llmContent,
        this.config.getGeminiClient(),
        signal,
        summarizeConfig[this.name].tokenBudget,
      );
      return {
        llmContent: summary,
        returnDisplay: returnDisplayMessage,
      };
    }

    return {
      llmContent,
      returnDisplay: returnDisplayMessage,
    };
  }
}
