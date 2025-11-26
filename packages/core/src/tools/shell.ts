/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os, { EOL } from 'node:os';
import crypto from 'node:crypto';
import type { Config } from '../config/config.js';
import { debugLogger, type AnyToolInvocation } from '../index.js';
import { ToolErrorType } from './tool-error.js';
import type {
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolConfirmationOutcome,
  Kind,
} from './tools.js';
import { ApprovalMode } from '../policy/types.js';

import { getErrorMessage } from '../utils/errors.js';
import { summarizeToolOutput } from '../utils/summarizer.js';
import type {
  ShellExecutionConfig,
  ShellOutputEvent,
} from '../services/shellExecutionService.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import {
  getCommandRoots,
  initializeShellParsers,
  isCommandAllowed,
  isShellInvocationAllowlisted,
  stripShellWrapper,
} from '../utils/shell-utils.js';
import { SHELL_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import type { Content } from '@google/genai';

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const SHELL_TIMEOUT_MS = 60000; // 1 minute initial timeout
const ANALYSIS_TIMEOUT_MS = 30000;

export interface ShellToolParams {
  command: string;
  description?: string;
  dir_path?: string;
}

export class ShellToolInvocation extends BaseToolInvocation<
  ShellToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ShellToolParams,
    private readonly allowlist: Set<string>,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    let description = `${this.params.command}`;
    // append optional [in directory]
    // note description is needed even if validation fails due to absolute path
    if (this.params.dir_path) {
      description += ` [in ${this.params.dir_path}]`;
    } else {
      description += ` [current working directory ${process.cwd()}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (this.params.description) {
      description += ` (${this.params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const command = stripShellWrapper(this.params.command);
    const rootCommands = [...new Set(getCommandRoots(command))];

    // In non-interactive mode, we need to prevent the tool from hanging while
    // waiting for user input. If a tool is not fully allowed (e.g. via
    // --allowed-tools="ShellTool(wc)"), we should throw an error instead of
    // prompting for confirmation. This check is skipped in YOLO mode.
    if (
      !this.config.isInteractive() &&
      this.config.getApprovalMode() !== ApprovalMode.YOLO
    ) {
      if (this.isInvocationAllowlisted(command)) {
        // If it's an allowed shell command, we don't need to confirm execution.
        return false;
      }

      throw new Error(
        `Command "${command}" is not in the list of allowed tools for non-interactive mode.`,
      );
    }

    const commandsToConfirm = rootCommands.filter(
      (command) => !this.allowlist.has(command),
    );

    if (commandsToConfirm.length === 0) {
      return false; // already approved and allowlisted
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: this.params.command,
      rootCommand: commandsToConfirm.join(', '),
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          commandsToConfirm.forEach((command) => this.allowlist.add(command));
        }
      },
    };
    return confirmationDetails;
  }

  private async analyzeProcess(
    command: string,
    output: string | AnsiOutput,
    durationMs: number,
    abortSignal: AbortSignal,
  ): Promise<{ action: 'cancel' | 'wait'; reason: string; timeout?: number }> {
    const recentOutput =
      typeof output === 'string' ? output : JSON.stringify(output);
    // Truncate output if too long (keep head and tail)
    const truncatedOutput =
      recentOutput.length > 2000
        ? recentOutput.slice(0, 1000) +
          '\n...[truncated]...\n' +
          recentOutput.slice(-1000)
        : recentOutput;

    const prompt = `You are a strict classification engine. Your ONLY function is to analyze the state of a running shell command and output a JSON object.

Rules:
1. Output MUST be raw JSON.
2. Do NOT wrap the output in markdown code blocks (no \`\`\`json).
3. Do NOT include any conversational text, reasoning, or explanations.

Analyze the following command execution:

Duration: ${Math.round(durationMs / 1000)} seconds
Command: "${command}"
Recent Output:
"""
${truncatedOutput}
"""

Determine the status based on these criteria:
- CANCEL if: It is stuck waiting for user input, running an infinite loop without progress, or stuck.
- WAIT if: It is a valid long-running task (build, install, download, processing).

Return this exact JSON structure:
{
  "action": "cancel" | "wait",
  "reason": "User-facing explanation of why",
  "timeout": number // Optional: Suggested wait time in ms (e.g., 300000)
}`;
    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

    try {
      // We use the DEFAULT_GEMINI_FLASH_MODEL for quick and cheap analysis.
      // We also set a short timeout via abortSignal to ensure the analysis itself doesn't hang.
      const response = await this.config.getContentGenerator().generateContent(
        {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          contents,
          config: {
            responseMimeType: 'application/json',
            abortSignal,
          },
        },
        // We don't have a specific prompt ID here, so we use a generic one or omit it if the API allows.
        // Assuming the signature matches generateContent(request, promptId?)
        'shell-analysis',
      );

      const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        return { action: 'wait', reason: 'Failed to get analysis from LLM' };
      }

      try {
        const result = JSON.parse(responseText);
        return {
          action: result.action === 'cancel' ? 'cancel' : 'wait',
          reason: result.reason || 'No reason provided',
          timeout:
            typeof result.timeout === 'number'
              ? result.timeout
              : typeof result.timeout === 'string' &&
                  !isNaN(Number(result.timeout))
                ? Number(result.timeout)
                : undefined,
        };
      } catch (parseError) {
        debugLogger.error(
          `Failed to parse JSON from shell analysis model. Raw output: "${responseText}"`,
          parseError,
        );
        return {
          action: 'wait',
          reason: 'Analysis response was not valid JSON',
        };
      }
    } catch (e) {
      debugLogger.error('Error analyzing shell process:', e);
      return { action: 'wait', reason: 'Error during analysis' };
    }
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
    shellExecutionConfig?: ShellExecutionConfig,
    setPidCallback?: (pid: number) => void,
  ): Promise<ToolResult> {
    const strippedCommand = stripShellWrapper(this.params.command);

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

    const internalAbortController = new AbortController();
    const abortHandler = () => internalAbortController.abort();
    signal.addEventListener('abort', abortHandler);

    let monitorTimeout: NodeJS.Timeout | undefined;

    try {
      // pgrep is not available on Windows, so we can't get background PIDs
      const commandToExecute = isWindows
        ? strippedCommand
        : (() => {
            // wrap command to append subprocess pids (via pgrep) to temporary file
            let command = strippedCommand.trim();
            if (!command.endsWith('&')) command += ';';
            return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
          })();

      const cwd = this.params.dir_path
        ? path.resolve(this.config.getTargetDir(), this.params.dir_path)
        : this.config.getTargetDir();

      let cumulativeOutput: string | AnsiOutput = '';
      let lastUpdateTime = Date.now();
      let isBinaryStream = false;

      const { result: resultPromise, pid } =
        await ShellExecutionService.execute(
          commandToExecute,
          cwd,
          (event: ShellOutputEvent) => {
            if (!updateOutput) {
              return;
            }

            let shouldUpdate = false;

            switch (event.type) {
              case 'data':
                if (isBinaryStream) break;
                cumulativeOutput = event.chunk;
                shouldUpdate = true;
                break;
              case 'binary_detected':
                isBinaryStream = true;
                cumulativeOutput =
                  '[Binary output detected. Halting stream...]';
                shouldUpdate = true;
                break;
              case 'binary_progress':
                isBinaryStream = true;
                cumulativeOutput = `[Receiving binary output... ${formatMemoryUsage(
                  event.bytesReceived,
                )} received]`;
                if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
                  shouldUpdate = true;
                }
                break;
              default: {
                throw new Error('An unhandled ShellOutputEvent was found.');
              }
            }

            if (shouldUpdate) {
              updateOutput(cumulativeOutput);
              lastUpdateTime = Date.now();
            }
          },
          internalAbortController.signal,
          this.config.getEnableInteractiveShell(),
          shellExecutionConfig ?? {},
        );

      if (pid && setPidCallback) {
        setPidCallback(pid);
      }

      // Start the monitoring loop
      const startTime = Date.now();
      let currentTimeout = SHELL_TIMEOUT_MS;
      let analysisResult:
        | { action: 'cancel' | 'wait'; reason: string }
        | undefined;
      let commandFinished = false;

      // We wrap the result promise to track its state
      resultPromise.finally(() => {
        commandFinished = true;
      });

      while (!commandFinished) {
        // Wait for either the command to finish or the timeout to fire
        const timeoutPromise = new Promise<boolean>((resolve) => {
          monitorTimeout = setTimeout(() => resolve(true), currentTimeout);
        });

        // We use a wrapper for resultPromise that resolves to false when the command finishes
        const raceResult = await Promise.race([
          resultPromise.then(() => false),
          timeoutPromise,
        ]);

        if (monitorTimeout) {
          clearTimeout(monitorTimeout);
          monitorTimeout = undefined;
        }

        if (raceResult === false) {
          // Command finished naturally (or was aborted externally)
          break;
        }

        // Timeout occurred.

        // Trigger analysis.
        // We use a separate short signal for the analysis so we don't hang forever if the LLM is unresponsive.
        const analysisSignalController = new AbortController();
        const analysisSignalTimeout = setTimeout(
          () => analysisSignalController.abort(),
          ANALYSIS_TIMEOUT_MS,
        ); // 30s timeout for analysis

        try {
          const analysis = await this.analyzeProcess(
            this.params.command,
            cumulativeOutput,
            Date.now() - startTime,
            analysisSignalController.signal,
          );
          clearTimeout(analysisSignalTimeout);

          if (analysis.action === 'cancel') {
            analysisResult = analysis;
            internalAbortController.abort();
            break; // Monitoring loop ends; main logic will handle the aborted result
          } else {
            if (analysis.timeout && analysis.timeout > 0) {
              currentTimeout = analysis.timeout;
            } else {
              currentTimeout = SHELL_TIMEOUT_MS;
            }
            debugLogger.log(
              `Shell monitor: Continuing wait for ${currentTimeout}ms. Reason: ${analysis.reason}`,
            );
          }
        } catch (e) {
          clearTimeout(analysisSignalTimeout);
          debugLogger.error('Shell monitor analysis failed', e);
          // Default to waiting same interval if analysis fails
        }
      }

      const result = await resultPromise;

      const backgroundPIDs: number[] = [];
      if (os.platform() !== 'win32') {
        if (fs.existsSync(tempFilePath)) {
          const pgrepLines = fs
            .readFileSync(tempFilePath, 'utf8')
            .split(EOL)
            .filter(Boolean);
          for (const line of pgrepLines) {
            if (!/^\d+$/.test(line)) {
              debugLogger.error(`pgrep: ${line}`);
            }
            const pid = Number(line);
            if (pid !== result.pid) {
              backgroundPIDs.push(pid);
            }
          }
        } else {
          if (!signal.aborted && !internalAbortController.signal.aborted) {
            // Only log error if it wasn't aborted, as aborting might interrupt pgrep
            debugLogger.error('missing pgrep output');
          }
        }
      }

      let llmContent = '';
      if (result.aborted) {
        llmContent = 'Command was cancelled by user before it could complete.';

        if (analysisResult) {
          llmContent = `Command was automatically cancelled by the model.`;
        }

        if (result.output.trim()) {
          llmContent += ` Below is the output before it was cancelled:\n${result.output}`;
        } else {
          llmContent += ' There was no output before it was cancelled.';
        }
      } else {
        // Create a formatted error string for display, replacing the wrapper command
        // with the user-facing command.
        const finalError = result.error
          ? result.error.message.replace(commandToExecute, this.params.command)
          : '(none)';

        llmContent = [
          `Command: ${this.params.command}`,
          `Directory: ${this.params.dir_path || '(root)'}`,
          `Output: ${result.output || '(empty)'}`,
          `Error: ${finalError}`, // Use the cleaned error string.
          `Exit Code: ${result.exitCode ?? '(none)'}`,
          `Signal: ${result.signal ?? '(none)'}`,
          `Background PIDs: ${
            backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'
          }`,
          `Process Group PGID: ${result.pid ?? '(none)'}`,
        ].join('\n');
      }

      let returnDisplayMessage = '';
      if (this.config.getDebugMode()) {
        returnDisplayMessage = llmContent;
      } else {
        if (result.output.trim()) {
          returnDisplayMessage = result.output;
        }

        if (result.aborted && analysisResult) {
          const reason = `\n\nThe command was automatically cancelled by the model with the following reason: ${analysisResult.reason}`;
          returnDisplayMessage += reason;
        } else if (!returnDisplayMessage) {
          if (result.aborted) {
            returnDisplayMessage = 'Command cancelled by user.';
          } else if (result.signal) {
            returnDisplayMessage = `Command terminated by signal: ${result.signal}`;
          } else if (result.error) {
            returnDisplayMessage = `Command failed: ${getErrorMessage(
              result.error,
            )}`;
          } else if (result.exitCode !== null && result.exitCode !== 0) {
            returnDisplayMessage = `Command exited with code: ${result.exitCode}`;
          }
          // If output is empty and command succeeded (code 0, no error/signal/abort),
          // returnDisplayMessage will remain empty, which is fine.
        }
      }
      const summarizeConfig = this.config.getSummarizeToolOutputConfig();
      const executionError = result.error
        ? {
            error: {
              message: result.error.message,
              type: ToolErrorType.SHELL_EXECUTE_ERROR,
            },
          }
        : {};
      if (summarizeConfig && summarizeConfig[SHELL_TOOL_NAME]) {
        const summary = await summarizeToolOutput(
          this.config,
          { model: 'summarizer-shell' },
          llmContent,
          this.config.getGeminiClient(),
          signal,
        );
        return {
          llmContent: summary,
          returnDisplay: returnDisplayMessage,
          ...executionError,
        };
      }

      return {
        llmContent,
        returnDisplay: returnDisplayMessage,
        ...executionError,
      };
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (monitorTimeout) {
        clearTimeout(monitorTimeout);
      }
      signal.removeEventListener('abort', abortHandler);
    }
  }

  private isInvocationAllowlisted(command: string): boolean {
    const allowedTools = this.config.getAllowedTools() || [];
    if (allowedTools.length === 0) {
      return false;
    }

    const invocation = { params: { command } } as unknown as AnyToolInvocation;
    return isShellInvocationAllowlisted(invocation, allowedTools);
  }
}

function getShellToolDescription(): string {
  const returnedInfo = `

      The following information is returned:

      Command: Executed command.
      Directory: Directory where command was executed, or \`(root)\`.
      Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Error: Error or \`(none)\` if no error was reported for the subprocess.
      Exit Code: Exit code or \`(none)\` if terminated by signal.
      Signal: Signal number or \`(none)\` if no signal was received.
      Background PIDs: List of background processes started or \`(none)\`.
      Process Group PGID: Process group started or \`(none)\``;

  if (os.platform() === 'win32') {
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. Command can start background processes using PowerShell constructs such as \`Start-Process -NoNewWindow\` or \`Start-Job\`.${returnedInfo}`;
  } else {
    return `This tool executes a given shell command as \`bash -c <command>\`. Command can start background processes using \`&\`. Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${returnedInfo}`;
  }
}

function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `powershell.exe -NoProfile -Command <command>`';
  } else {
    return 'Exact bash command to execute as `bash -c <command>`';
  }
}

export class ShellTool extends BaseDeclarativeTool<
  ShellToolParams,
  ToolResult
> {
  static readonly Name = SHELL_TOOL_NAME;

  private allowlist: Set<string> = new Set();

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    void initializeShellParsers().catch(() => {
      // Errors are surfaced when parsing commands.
    });
    super(
      ShellTool.Name,
      'Shell',
      getShellToolDescription(),
      Kind.Execute,
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: getCommandDescription(),
          },
          description: {
            type: 'string',
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          dir_path: {
            type: 'string',
            description:
              '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ShellToolParams,
  ): string | null {
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }

    const commandCheck = isCommandAllowed(params.command, this.config);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        debugLogger.error(
          'Unexpected: isCommandAllowed returned false without a reason',
        );
        return `Command is not allowed: ${params.command}`;
      }
      return commandCheck.reason;
    }
    if (getCommandRoots(params.command).length === 0) {
      return 'Could not identify command root to obtain permission from user.';
    }
    if (params.dir_path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.dir_path,
      );
      const workspaceContext = this.config.getWorkspaceContext();
      if (!workspaceContext.isPathWithinWorkspace(resolvedPath)) {
        return `Directory '${resolvedPath}' is not within any of the registered workspace directories.`;
      }
    }
    return null;
  }

  protected createInvocation(
    params: ShellToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ShellToolParams, ToolResult> {
    return new ShellToolInvocation(
      this.config,
      params,
      this.allowlist,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
