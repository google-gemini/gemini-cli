/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os';
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
import { spawn } from 'child_process';
import { summarizeToolOutput } from '../utils/summarizer.js';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export interface AdbToolParams {
  command: string;
  description?: string;
  deviceId?: string;
}

export class AdbTool extends BaseTool<AdbToolParams, ToolResult> {
  static Name: string = 'run_adb_command';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      AdbTool.Name,
      'ADB',
      `This tool executes adb (Android Debug Bridge) commands to interact with connected Android devices. The tool automatically manages device selection and sudo permissions.

The following information is returned:

Command: Executed adb command.
Device: Target device ID or '(auto-selected)' if no specific device was specified.
Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.

${config.getAdbSudoMode() ? 'Note: Sudo mode is enabled - commands will be executed with "su -c" prefix for root access on the device.' : 'Note: Sudo mode is disabled - commands will be executed with standard user permissions.'}`,
      Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: 'Adb command to execute (without the "adb" prefix). Example: "shell ls /data/data", "devices", "install app.apk"',
          },
          description: {
            type: Type.STRING,
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          deviceId: {
            type: Type.STRING,
            description:
              '(OPTIONAL) Specific device ID to target. If not provided, adb will automatically select a device or use the only connected device.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: AdbToolParams): string {
    let description = `adb ${params.command}`;
    // append optional [for device]
    if (params.deviceId) {
      description += ` [for device ${params.deviceId}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (params.description) {
      description += ` (${params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  /**
   * Extracts the root command from an adb command string.
   * This is used to identify the base command for permission checks.
   *
   * @param command The adb command string to parse
   * @returns The root command name, or undefined if it cannot be determined
   * @example getCommandRoot("shell ls -la") returns "shell"
   * @example getCommandRoot("devices") returns "devices"
   */
  getCommandRoot(command: string): string | undefined {
    return command
      .trim() // remove leading and trailing whitespace
      .replace(/[{}()]/g, '') // remove all grouping operators
      .split(/[\s;&|]+/)[0] // split on any whitespace or separator or chaining operators and take first part
      ?.split(/[/\\]/) // split on any path separators (or return undefined if previous line was undefined)
      .pop(); // take last part and return command root (or undefined if previous line was empty)
  }

  /**
   * Determines whether a given adb command is allowed to execute based on
   * the tool's configuration including allowlists and blocklists.
   *
   * @param command The adb command string to validate
   * @returns An object with 'allowed' boolean and optional 'reason' string if not allowed
   */
  isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    // 0. Disallow command substitution for security
    if (command.includes('$(')) {
      return {
        allowed: false,
        reason:
          'Command substitution using $() is not allowed for security reasons',
      };
    }

    const ADB_TOOL_NAMES = [AdbTool.name, AdbTool.Name];

    const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');

    /**
     * Checks if a command string starts with a given prefix, ensuring it's a
     * whole word match (i.e., followed by a space or it's an exact match).
     */
    const isPrefixedBy = (cmd: string, prefix: string): boolean => {
      if (!cmd.startsWith(prefix)) {
        return false;
      }
      return cmd.length === prefix.length || cmd[prefix.length] === ' ';
    };

    /**
     * Extracts and normalizes adb commands from a list of tool strings.
     * e.g., 'AdbTool("shell ls")' becomes 'shell ls'
     */
    const extractCommands = (tools: string[]): string[] =>
      tools.flatMap((tool) => {
        for (const toolName of ADB_TOOL_NAMES) {
          if (tool.startsWith(`${toolName}(`) && tool.endsWith(')')) {
            return [normalize(tool.slice(toolName.length + 1, -1))];
          }
        }
        return [];
      });

    const coreTools = this.config.getCoreTools() || [];
    const excludeTools = this.config.getExcludeTools() || [];

    // 1. Check if the adb tool is globally disabled.
    if (ADB_TOOL_NAMES.some((name) => excludeTools.includes(name))) {
      return {
        allowed: false,
        reason: 'ADB tool is globally disabled in configuration',
      };
    }

    const blockedCommands = new Set(extractCommands(excludeTools));
    const allowedCommands = new Set(extractCommands(coreTools));

    const hasSpecificAllowedCommands = allowedCommands.size > 0;
    const isWildcardAllowed = ADB_TOOL_NAMES.some((name) =>
      coreTools.includes(name),
    );

    const commandsToValidate = command.split(/&&|\|\||\||;/).map(normalize);

    const blockedCommandsArr = [...blockedCommands];

    for (const cmd of commandsToValidate) {
      // 2. Check if the command is on the blocklist.
      const isBlocked = blockedCommandsArr.some((blocked) =>
        isPrefixedBy(cmd, blocked),
      );
      if (isBlocked) {
        return {
          allowed: false,
          reason: `ADB command '${cmd}' is blocked by configuration`,
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
            reason: `ADB command '${cmd}' is not in the allowed commands list`,
          };
        }
      }
    }

    // 4. If all checks pass, the command is allowed.
    return { allowed: true };
  }

  validateToolParams(params: AdbToolParams): string | null {
    const commandCheck = this.isCommandAllowed(params.command);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        console.error(
          'Unexpected: isCommandAllowed returned false without a reason',
        );
        return `ADB command is not allowed: ${params.command}`;
      }
      return commandCheck.reason;
    }
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.command.trim()) {
      return 'ADB command cannot be empty.';
    }
    if (!this.getCommandRoot(params.command)) {
      return 'Could not identify adb command root to obtain permission from user.';
    }
    return null;
  }

  async shouldConfirmExecute(
    params: AdbToolParams,
    _abortSignal: AbortSignal,
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
      title: 'Confirm ADB Command',
      command: `adb ${params.command}`,
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
    params: AdbToolParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: [
          `ADB command rejected: ${params.command}`,
          `Reason: ${validationError}`,
        ].join('\n'),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'ADB command was cancelled by user before it could start.',
        returnDisplay: 'ADB command cancelled by user.',
      };
    }

    // Build the adb command
    const adbCommand = ['adb'];
    
    // Add device selection if specified
    if (params.deviceId) {
      adbCommand.push('-s', params.deviceId);
    }

    // Handle sudo mode for shell commands
    if (this.config.getAdbSudoMode() && params.command.startsWith('shell ')) {
      const shellCommand = params.command.slice(6); // Remove 'shell ' prefix
      adbCommand.push('shell', 'su', '-c', shellCommand);
    } else {
      // Split the command and add to adb command array
      adbCommand.push(...params.command.split(' '));
    }

    const isWindows = os.platform() === 'win32';

    // spawn adb command
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', ...adbCommand], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: this.config.getTargetDir(),
        })
      : spawn(adbCommand[0], adbCommand.slice(1), {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
          cwd: this.config.getTargetDir(),
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
      error.message = error.message.replace(adbCommand.join(' '), `adb ${params.command}`);
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
              console.error(`failed to kill adb process ${shell.pid}: ${_e}`);
            }
          }
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    // wait for the adb command to exit
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = 'ADB command was cancelled by user before it could complete.';
      if (output.trim()) {
        llmContent += ` Below is the output (on stdout and stderr) before it was cancelled:\n${output}`;
      } else {
        llmContent += ' There was no output before it was cancelled.';
      }
    } else {
      llmContent = [
        `Command: adb ${params.command}`,
        `Device: ${params.deviceId || '(auto-selected)'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
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
          returnDisplayMessage = 'ADB command cancelled by user.';
        } else if (processSignal) {
          returnDisplayMessage = `ADB command terminated by signal: ${processSignal}`;
        } else if (error) {
          returnDisplayMessage = `ADB command failed: ${getErrorMessage(error)}`;
        } else if (code !== null && code !== 0) {
          returnDisplayMessage = `ADB command exited with code: ${code}`;
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
        abortSignal,
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