/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  spawn,
  SpawnOptions,
  ChildProcessWithoutNullStreams,
} from 'child_process';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
  ToolResult,
} from './tools.js';
import { BackgroundTerminalAnalyzer } from '../utils/BackgroundTerminalAnalyzer.js';

export interface TerminalToolParams {
  command: string;
  description?: string;
  timeout?: number;
  runInBackground?: boolean;
}

const MAX_OUTPUT_LENGTH = 10000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TIMEOUT_OVERRIDE_MS = 10 * 60 * 1000;
const BACKGROUND_LAUNCH_TIMEOUT_MS = 15 * 1000;
const BACKGROUND_POLL_TIMEOUT_MS = 30000;

interface QueuedCommand {
  params: TerminalToolParams;
  resolve: (result: ToolResult) => void;
  reject: (error: Error) => void;
}

export class TerminalTool extends BaseTool<TerminalToolParams, ToolResult> {
  static Name: string = 'execute_bash_command';
  private readonly rootDirectory: string;
  private readonly outputLimit: number;
  private bashProcess: ChildProcessWithoutNullStreams | null = null;
  private currentCwd: string;
  private isExecuting: boolean = false;
  private commandQueue: QueuedCommand[] = [];
  private currentCommandCleanup: (() => void) | null = null;
  private shouldAlwaysExecuteCommands: Map<string, boolean> = new Map();
  private shellReady: Promise<void>;
  private resolveShellReady: (() => void) | undefined;
  private rejectShellReady: ((reason?: unknown) => void) | undefined;
  private readonly backgroundTerminalAnalyzer: BackgroundTerminalAnalyzer;
  private readonly config: Config;

  constructor(
    rootDirectory: string,
    config: Config,
    outputLimit: number = MAX_OUTPUT_LENGTH,
  ) {
    const toolDisplayName = 'Terminal';
    const toolDescription = `Executes one or more bash commands sequentially in a secure and persistent interactive shell session. Can run commands in the foreground (waiting for completion) or background (returning after launch, with subsequent status polling).

Core Functionality:
* Starts in project root: '${path.basename(rootDirectory)}'. Current Directory starts as: ${rootDirectory} (will update based on 'cd' commands).
* Persistent State: Environment variables and the current working directory (\`pwd\`) persist between calls to this tool.
* **Execution Modes:**
    * **Foreground (default):** Waits for the command to complete. Captures stdout, stderr, and exit code. Output is truncated if it exceeds ${outputLimit} characters.
    * **Background (\`runInBackground: true\`):** Appends \`&\` to the command and redirects its output to temporary files. Returns *after* the command is launched, providing the Process ID (PID) and launch status. Subsequently, the tool **polls** for the background process status for up to ${BACKGROUND_POLL_TIMEOUT_MS / 1000} seconds. Once the process finishes or polling times out, the tool reads the captured stdout/stderr from the temporary files, runs an internal LLM analysis on the output, cleans up the files, and returns the final status, captured output, and analysis.
* Timeout: Optional timeout per 'execute' call (default: ${DEFAULT_TIMEOUT_MS / 60000} min, max override: ${MAX_TIMEOUT_OVERRIDE_MS / 60000} min for foreground). Background *launch* has a fixed shorter timeout (${BACKGROUND_LAUNCH_TIMEOUT_MS / 1000}s) for the launch attempt itself. Background *polling* has its own timeout (${BACKGROUND_POLL_TIMEOUT_MS / 1000}s). Timeout attempts SIGINT for foreground commands.

Usage Guidance & Restrictions:

1.  **Directory/File Verification (IMPORTANT):**
    * BEFORE executing commands that create files or directories (e.g., \`mkdir foo/bar\`, \`touch new/file.txt\`, \`git clone ...\`), use the dedicated File System tool (e.g., 'list_directory') to verify the target parent directory exists and is the correct location.
    * Example: Before running \`mkdir foo/bar\`, first use the File System tool to check that \`foo\` exists in the current directory (\`${rootDirectory}\` initially, check current CWD if it changed).

2.  **Use Specialized Tools (CRITICAL):**
    * Do NOT use this tool for filesystem searching (\`find\`, \`grep\`). Use the dedicated Search tool instead.
    * Do NOT use this tool for reading files (\`cat\`, \`head\`, \`tail\`, \`less\`, \`more\`). Use the dedicated File Reader tool instead.
    * Do NOT use this tool for listing files (\`ls\`). Use the dedicated File System tool ('list_directory') instead. Relying on this tool's output for directory structure is unreliable due to potential truncation and lack of structured data.

3.  **Command Execution Notes:**
    * Chain multiple commands using shell operators like ';' or '&&'. Do NOT use newlines within the 'command' parameter string itself (newlines are fine inside quoted arguments).
    * The shell's current working directory is tracked internally. While \`cd\` is permitted if the user explicitly asks or it's necessary for a workflow, **strongly prefer** using absolute paths or paths relative to the *known* current working directory to avoid errors. Check the '(Executed in: ...)' part of the previous command's output for the CWD.
        * Good example (if CWD is /workspace/project): \`pytest tests/unit\` or \`ls /workspace/project/data\`
        * Less preferred: \`cd tests && pytest unit\` (only use if necessary or requested)

4.  **Background Tasks (\`runInBackground: true\`):**
    * Use this for commands that are intended to run continuously (e.g., \`node server.js\`, \`npm start\`).
    * The tool initially returns success if the process *launches* successfully, along with its PID.
    * **Polling & Final Result:** The tool then monitors the process. The *final* result (delivered after polling completes or times out) will include:
        * The final status (completed or timed out).
        * The complete stdout and stderr captured in temporary files (truncated if necessary).
        * An LLM-generated analysis/summary of the output.
    * The initial exit code (usually 0) signifies successful *launching*; the final status indicates completion or timeout after polling.

Use this tool for running build steps (\`npm install\`, \`make\`), linters (\`eslint .\`), test runners (\`pytest\`, \`jest\`), code formatters (\`prettier --write .\`), package managers (\`pip install\`), version control operations (\`git status\`, \`git diff\`), starting background servers/services (\`node server.js --runInBackground true\`), or other safe, standard command-line operations within the project workspace.`;
    const toolParameterSchema = {
      type: 'object',
      properties: {
        command: {
          description: `The exact bash command or sequence of commands (using ';' or '&&') to execute. Must adhere to usage guidelines. Example: 'npm install && npm run build'`,
          type: 'string',
        },
        description: {
          description: `Optional: A brief, user-centric explanation of what the command does and why it's being run. Used for logging and confirmation prompts. Example: 'Install project dependencies'`,
          type: 'string',
        },
        timeout: {
          description: `Optional execution time limit in milliseconds for FOREGROUND commands. Max ${MAX_TIMEOUT_OVERRIDE_MS}ms (${MAX_TIMEOUT_OVERRIDE_MS / 60000} min). Defaults to ${DEFAULT_TIMEOUT_MS}ms (${DEFAULT_TIMEOUT_MS / 60000} min) if not specified or invalid. Ignored if 'runInBackground' is true.`,
          type: 'number',
        },
        runInBackground: {
          description: `If true, execute the command in the background using '&'. Defaults to false. Use for servers or long tasks.`,
          type: 'boolean',
        },
      },
      required: ['command'],
    };
    super(
      TerminalTool.Name,
      toolDisplayName,
      toolDescription,
      toolParameterSchema,
    );
    this.config = config;
    this.rootDirectory = path.resolve(rootDirectory);
    this.currentCwd = this.rootDirectory;
    this.outputLimit = outputLimit;
    this.shellReady = new Promise((resolve, reject) => {
      this.resolveShellReady = resolve;
      this.rejectShellReady = reject;
    });
    this.backgroundTerminalAnalyzer = new BackgroundTerminalAnalyzer(config);
    this.initializeShell();
  }

  private initializeShell() {
    if (this.bashProcess) {
      try {
        this.bashProcess.kill();
      } catch {
        /* Ignore */
      }
    }
    const spawnOptions: SpawnOptions = {
      cwd: this.rootDirectory,
      shell: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    };
    try {
      const bashPath = os.platform() === 'win32' ? 'bash.exe' : 'bash';
      this.bashProcess = spawn(
        bashPath,
        ['-s'],
        spawnOptions,
      ) as ChildProcessWithoutNullStreams;
      this.currentCwd = this.rootDirectory;
      this.bashProcess.on('error', (err) => {
        console.error('Persistent Bash Error:', err);
        this.rejectShellReady?.(err);
        this.bashProcess = null;
        this.isExecuting = false;
        this.clearQueue(
          new Error(`Persistent bash process failed to start: ${err.message}`),
        );
      });
      this.bashProcess.on('close', (code, signal) => {
        this.bashProcess = null;
        this.isExecuting = false;
        this.rejectShellReady?.(
          new Error(
            `Persistent bash process exited (code: ${code}, signal: ${signal})`,
          ),
        );
        this.clearQueue(
          new Error(
            `Persistent bash process exited unexpectedly (code: ${code}, signal: ${signal}). State is lost. Queued commands cancelled.`,
          ),
        );
        if (signal !== 'SIGINT') {
          this.shellReady = new Promise((resolve, reject) => {
            this.resolveShellReady = resolve;
            this.rejectShellReady = reject;
          });
          setTimeout(() => this.initializeShell(), 1000);
        }
      });
      setTimeout(() => {
        if (this.bashProcess && !this.bashProcess.killed) {
          this.resolveShellReady?.();
        } else if (!this.bashProcess) {
          // Error likely handled
        } else {
          this.rejectShellReady?.(
            new Error('Shell killed during initialization'),
          );
        }
      }, 1000);
    } catch (error: unknown) {
      console.error('Failed to spawn persistent bash:', error);
      this.rejectShellReady?.(error);
      this.bashProcess = null;
      this.clearQueue(
        new Error(`Failed to spawn persistent bash: ${getErrorMessage(error)}`),
      );
    }
  }

  validateToolParams(params: TerminalToolParams): string | null {
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
    if (
      params.timeout !== undefined &&
      (typeof params.timeout !== 'number' || params.timeout <= 0)
    ) {
      return 'Timeout must be a positive number of milliseconds.';
    }
    return null;
  }

  getDescription(params: TerminalToolParams): string {
    return params.description || params.command;
  }

  async shouldConfirmExecute(
    params: TerminalToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    const rootCommand =
      params.command
        .trim()
        .split(/[\s;&&|]+/)[0]
        ?.split(/[/\\]/)
        .pop() || 'unknown';
    if (this.shouldAlwaysExecuteCommands.get(rootCommand)) {
      return false;
    }
    const description = this.getDescription(params);
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      title: 'Confirm Shell Command',
      command: params.command,
      rootCommand,
      description: `Execute in '${this.currentCwd}':\n${description}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.shouldAlwaysExecuteCommands.set(rootCommand, true);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: TerminalToolParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Command rejected: ${params.command}\nReason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }
    return new Promise((resolve) => {
      const queuedItem: QueuedCommand = {
        params,
        resolve,
        reject: (error) =>
          resolve({
            llmContent: `Internal tool error for command: ${params.command}\nError: ${error.message}`,
            returnDisplay: `Internal Tool Error: ${error.message}`,
          }),
      };
      this.commandQueue.push(queuedItem);
      setImmediate(() => this.triggerQueueProcessing());
    });
  }

  private async triggerQueueProcessing(): Promise<void> {
    if (this.isExecuting || this.commandQueue.length === 0) {
      return;
    }
    this.isExecuting = true;
    const { params, resolve, reject } = this.commandQueue.shift()!;
    try {
      await this.shellReady;
      if (!this.bashProcess || this.bashProcess.killed) {
        throw new Error(
          'Persistent bash process is not available or was killed.',
        );
      }
      const result = await this.executeCommandInShell(params);
      resolve(result);
    } catch (error: unknown) {
      console.error(`Error executing command "${params.command}":`, error);
      if (error instanceof Error) {
        reject(error);
      } else {
        reject(new Error('Unknown error occurred: ' + JSON.stringify(error)));
      }
    } finally {
      this.isExecuting = false;
      setImmediate(() => this.triggerQueueProcessing());
    }
  }

  private executeCommandInShell(
    params: TerminalToolParams,
  ): Promise<ToolResult> {
    let tempStdoutPath: string | null = null;
    let tempStderrPath: string | null = null;
    let originalResolve: (value: ToolResult | PromiseLike<ToolResult>) => void;
    let originalReject: (reason?: unknown) => void;
    const promise = new Promise<ToolResult>((resolve, reject) => {
      originalResolve = resolve;
      originalReject = reject;
      if (!this.bashProcess) {
        return reject(
          new Error('Bash process is not running. Cannot execute command.'),
        );
      }
      const isBackgroundTask = params.runInBackground ?? false;
      const commandUUID = crypto.randomUUID();
      const startDelimiter = `::START_CMD_${commandUUID}::`;
      const endDelimiter = `::END_CMD_${commandUUID}::`;
      const exitCodeDelimiter = `::EXIT_CODE_${commandUUID}::`;
      const pidDelimiter = `::PID_${commandUUID}::`;
      if (isBackgroundTask) {
        try {
          const tempDir = os.tmpdir();
          tempStdoutPath = path.join(tempDir, `term_out_${commandUUID}.log`);
          tempStderrPath = path.join(tempDir, `term_err_${commandUUID}.log`);
        } catch (err: unknown) {
          return reject(
            new Error(
              `Failed to determine temporary directory: ${getErrorMessage(err)}`,
            ),
          );
        }
      }
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let commandOutputStarted = false;
      let exitCode: number | null = null;
      let backgroundPid: number | null = null;
      let receivedEndDelimiter = false;
      const effectiveTimeout = isBackgroundTask
        ? BACKGROUND_LAUNCH_TIMEOUT_MS
        : Math.min(
            params.timeout ?? DEFAULT_TIMEOUT_MS,
            MAX_TIMEOUT_OVERRIDE_MS,
          );
      let onStdoutData: ((data: Buffer) => void) | null = null;
      let onStderrData: ((data: Buffer) => void) | null = null;
      let launchTimeoutId: NodeJS.Timeout | null = null;
      launchTimeoutId = setTimeout(() => {
        const timeoutMessage = isBackgroundTask
          ? `Background command launch timed out after ${effectiveTimeout}ms.`
          : `Command timed out after ${effectiveTimeout}ms.`;
        if (!isBackgroundTask && this.bashProcess && !this.bashProcess.killed) {
          try {
            this.bashProcess.stdin.write('\x03');
          } catch (e: unknown) {
            console.error('Error writing SIGINT on timeout:', e);
          }
        }
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean);
        if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
          this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch((err) => {
            console.warn(
              `Error cleaning up temp files on timeout: ${err.message}`,
            );
          });
        }
        originalResolve({
          llmContent: `Command execution failed: ${timeoutMessage}\nCommand: ${params.command}\nExecuted in: ${this.currentCwd}\n${isBackgroundTask ? 'Mode: Background Launch' : `Mode: Foreground\nTimeout Limit: ${effectiveTimeout}ms`}\nPartial Stdout (Launch):\n${this.truncateOutput(stdoutBuffer)}\nPartial Stderr (Launch):\n${this.truncateOutput(stderrBuffer)}\nNote: ${isBackgroundTask ? 'Launch failed or took too long.' : 'Attempted interrupt (SIGINT). Shell state might be unpredictable if command ignored interrupt.'}`,
          returnDisplay: `Timeout: ${timeoutMessage}`,
        });
      }, effectiveTimeout);
      const processDataChunk = (chunk: string, isStderr: boolean): boolean => {
        let dataToProcess = chunk;
        if (!commandOutputStarted) {
          const startIndex = dataToProcess.indexOf(startDelimiter);
          if (startIndex !== -1) {
            commandOutputStarted = true;
            dataToProcess = dataToProcess.substring(
              startIndex + startDelimiter.length,
            );
          } else {
            return false;
          }
        }
        const pidIndex = dataToProcess.indexOf(pidDelimiter);
        if (pidIndex !== -1) {
          const pidMatch = dataToProcess
            .substring(pidIndex + pidDelimiter.length)
            .match(/^(\d+)/);
          if (pidMatch?.[1]) {
            backgroundPid = parseInt(pidMatch[1], 10);
            const pidEndIndex =
              pidIndex + pidDelimiter.length + pidMatch[1].length;
            const beforePid = dataToProcess.substring(0, pidIndex);
            if (isStderr) stderrBuffer += beforePid;
            else stdoutBuffer += beforePid;
            dataToProcess = dataToProcess.substring(pidEndIndex);
          } else {
            const beforePid = dataToProcess.substring(0, pidIndex);
            if (isStderr) stderrBuffer += beforePid;
            else stdoutBuffer += beforePid;
            dataToProcess = dataToProcess.substring(
              pidIndex + pidDelimiter.length,
            );
          }
        }
        const exitCodeIndex = dataToProcess.indexOf(exitCodeDelimiter);
        if (exitCodeIndex !== -1) {
          const exitCodeMatch = dataToProcess
            .substring(exitCodeIndex + exitCodeDelimiter.length)
            .match(/^(\d+)/);
          if (exitCodeMatch?.[1]) {
            exitCode = parseInt(exitCodeMatch[1], 10);
            const beforeExitCode = dataToProcess.substring(0, exitCodeIndex);
            if (isStderr) stderrBuffer += beforeExitCode;
            else stdoutBuffer += beforeExitCode;
            dataToProcess = dataToProcess.substring(
              exitCodeIndex +
                exitCodeDelimiter.length +
                exitCodeMatch[1].length,
            );
          } else {
            const beforeExitCode = dataToProcess.substring(0, exitCodeIndex);
            if (isStderr) stderrBuffer += beforeExitCode;
            else stdoutBuffer += beforeExitCode;
            dataToProcess = dataToProcess.substring(
              exitCodeIndex + exitCodeDelimiter.length,
            );
          }
        }
        const endDelimiterIndex = dataToProcess.indexOf(endDelimiter);
        if (endDelimiterIndex !== -1) {
          receivedEndDelimiter = true;
          const beforeEndDelimiter = dataToProcess.substring(
            0,
            endDelimiterIndex,
          );
          if (isStderr) stderrBuffer += beforeEndDelimiter;
          else stdoutBuffer += beforeEndDelimiter;
          const afterEndDelimiter = dataToProcess.substring(
            endDelimiterIndex + endDelimiter.length,
          );
          const exitCodeEchoMatch = afterEndDelimiter.match(/^(\d+)/);
          dataToProcess = exitCodeEchoMatch
            ? afterEndDelimiter.substring(exitCodeEchoMatch[1].length)
            : afterEndDelimiter;
        }
        if (dataToProcess.length > 0) {
          if (isStderr) stderrBuffer += dataToProcess;
          else stdoutBuffer += dataToProcess;
        }
        if (receivedEndDelimiter && exitCode !== null) {
          setImmediate(cleanupAndResolve);
          return true;
        }
        return false;
      };
      onStdoutData = (data: Buffer) => processDataChunk(data.toString(), false);
      onStderrData = (data: Buffer) => processDataChunk(data.toString(), true);
      const cleanupListeners = (listeners?: {
        onStdoutData: ((data: Buffer) => void) | null;
        onStderrData: ((data: Buffer) => void) | null;
      }) => {
        if (launchTimeoutId) clearTimeout(launchTimeoutId);
        launchTimeoutId = null;
        const stdoutListener = listeners?.onStdoutData ?? onStdoutData;
        const stderrListener = listeners?.onStderrData ?? onStderrData;
        if (this.bashProcess && !this.bashProcess.killed) {
          if (stdoutListener)
            this.bashProcess.stdout.removeListener('data', stdoutListener);
          if (stderrListener)
            this.bashProcess.stderr.removeListener('data', stderrListener);
        }
        if (this.currentCommandCleanup === cleanupListeners) {
          this.currentCommandCleanup = null;
        }
        onStdoutData = null;
        onStderrData = null;
      };
      this.currentCommandCleanup = cleanupListeners;
      const cleanupAndResolve = async () => {
        if (
          !this.currentCommandCleanup ||
          this.currentCommandCleanup !== cleanupListeners
        ) {
          if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
            this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch(
              (err) => {
                console.warn(
                  `Error cleaning up temp files for superseded command: ${err.message}`,
                );
              },
            );
          }
          return;
        }
        const launchStdout = this.truncateOutput(stdoutBuffer);
        const launchStderr = this.truncateOutput(stderrBuffer);
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean);
        if (exitCode === null) {
          console.error(
            `CRITICAL: Command "${params.command}" (background: ${isBackgroundTask}) finished delimiter processing but exitCode is null.`,
          );
          const errorMode = isBackgroundTask
            ? 'Background Launch'
            : 'Foreground';
          if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
            await this.cleanupTempFiles(tempStdoutPath, tempStderrPath);
          }
          originalResolve({
            llmContent: `Command: ${params.command}\nExecuted in: ${this.currentCwd}\nMode: ${errorMode}\nExit Code: -2 (Internal Error: Exit code not captured)\nStdout (during setup):\n${launchStdout}\nStderr (during setup):\n${launchStderr}`,
            returnDisplay:
              `Internal Error: Failed to capture command exit code.\n${launchStdout}\nStderr: ${launchStderr}`.trim(),
          });
          return;
        }
        let cwdUpdateError = '';
        if (!isBackgroundTask) {
          const mightChangeCwd = params.command.trim().startsWith('cd ');
          if (exitCode === 0 || mightChangeCwd) {
            try {
              const latestCwd = await this.getCurrentShellCwd();
              if (this.currentCwd !== latestCwd) {
                this.currentCwd = latestCwd;
              }
            } catch (e: unknown) {
              if (exitCode === 0) {
                cwdUpdateError = `\nWarning: Failed to verify/update current working directory after command: ${getErrorMessage(e)}`;
                console.error(
                  'Failed to update CWD after successful command:',
                  e,
                );
              }
            }
          }
        }
        if (isBackgroundTask) {
          const launchSuccess = exitCode === 0;
          const pidString =
            backgroundPid !== null ? backgroundPid.toString() : 'Not Captured';
          if (
            launchSuccess &&
            backgroundPid !== null &&
            tempStdoutPath &&
            tempStderrPath
          ) {
            this.inspectBackgroundProcess(
              backgroundPid,
              params.command,
              this.currentCwd,
              launchStdout,
              launchStderr,
              tempStdoutPath,
              tempStderrPath,
              originalResolve,
            );
          } else {
            const reason =
              backgroundPid === null
                ? 'PID not captured'
                : `Launch failed (Exit Code: ${exitCode})`;
            const displayMessage = `Failed to launch process in background (${reason})`;
            console.error(
              `Background launch failed for command: ${params.command}. Reason: ${reason}`,
            );
            if (tempStdoutPath && tempStderrPath) {
              await this.cleanupTempFiles(tempStdoutPath, tempStderrPath);
            }
            originalResolve({
              llmContent: `Background Command Launch Failed: ${params.command}\nExecuted in: ${this.currentCwd}\nReason: ${reason}\nPID: ${pidString}\nExit Code (Launch): ${exitCode}\nStdout (During Launch):\n${launchStdout}\nStderr (During Launch):\n${launchStderr}`,
              returnDisplay: displayMessage,
            });
          }
        } else {
          let displayOutput = '';
          const stdoutTrimmed = launchStdout.trim();
          const stderrTrimmed = launchStderr.trim();
          if (stderrTrimmed) {
            displayOutput = stderrTrimmed;
          } else if (stdoutTrimmed) {
            displayOutput = stdoutTrimmed;
          }
          if (exitCode !== 0 && !displayOutput) {
            displayOutput = `Failed with exit code: ${exitCode}`;
          } else if (exitCode === 0 && !displayOutput) {
            displayOutput = `Success (no output)`;
          }
          originalResolve({
            llmContent: `Command: ${params.command}\nExecuted in: ${this.currentCwd}\nExit Code: ${exitCode}\nStdout:\n${launchStdout}\nStderr:\n${launchStderr}${cwdUpdateError}`,
            returnDisplay: displayOutput.trim() || `Exit Code: ${exitCode}`,
          });
        }
      };
      if (!this.bashProcess || this.bashProcess.killed) {
        console.error(
          'Bash process lost or killed before listeners could be attached.',
        );
        if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
          this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch((err) => {
            console.warn(
              `Error cleaning up temp files on attach failure: ${err.message}`,
            );
          });
        }
        return originalReject(
          new Error(
            'Bash process lost or killed before listeners could be attached.',
          ),
        );
      }
      if (onStdoutData) this.bashProcess.stdout.on('data', onStdoutData);
      if (onStderrData) this.bashProcess.stderr.on('data', onStderrData);
      let commandToWrite: string;
      if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
        commandToWrite = `echo "${startDelimiter}"; { { ${params.command} > "${tempStdoutPath}" 2> "${tempStderrPath}"; } & } 2>/dev/null; __LAST_PID=$!; echo "${pidDelimiter}$__LAST_PID" >&2; echo "${exitCodeDelimiter}$?" >&2; echo "${endDelimiter}$?" >&1\n`;
      } else if (!isBackgroundTask) {
        commandToWrite = `echo "${startDelimiter}"; ${params.command}; __EXIT_CODE=$?; echo "${exitCodeDelimiter}$__EXIT_CODE" >&2; echo "${endDelimiter}$__EXIT_CODE" >&1\n`;
      } else {
        return originalReject(
          new Error(
            'Internal setup error: Missing temporary file paths for background execution.',
          ),
        );
      }
      try {
        if (this.bashProcess?.stdin?.writable) {
          this.bashProcess.stdin.write(commandToWrite, (err) => {
            if (err) {
              console.error(
                `Error writing command "${params.command}" to bash stdin (callback):`,
                err,
              );
              const listenersToClean = { onStdoutData, onStderrData };
              cleanupListeners(listenersToClean);
              if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
                this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch(
                  (e) => console.warn(`Cleanup failed: ${e.message}`),
                );
              }
              originalReject(
                new Error(
                  `Shell stdin write error: ${err.message}. Command likely did not execute.`,
                ),
              );
            }
          });
        } else {
          throw new Error(
            'Shell stdin is not writable or process closed when attempting to write command.',
          );
        }
      } catch (e: unknown) {
        console.error(
          `Error writing command "${params.command}" to bash stdin (sync):`,
          e,
        );
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean);
        if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
          this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch((err) =>
            console.warn(`Cleanup failed: ${err.message}`),
          );
        }
        originalReject(
          new Error(
            `Shell stdin write exception: ${getErrorMessage(e)}. Command likely did not execute.`,
          ),
        );
      }
    });
    return promise;
  }

  private async inspectBackgroundProcess(
    pid: number,
    command: string,
    cwd: string,
    initialStdout: string,
    initialStderr: string,
    tempStdoutPath: string,
    tempStderrPath: string,
    resolve: (value: ToolResult | PromiseLike<ToolResult>) => void,
  ): Promise<void> {
    let finalStdout = '';
    let finalStderr = '';
    let llmAnalysis = '';
    let fileReadError = '';
    try {
      const { status, summary } = await this.backgroundTerminalAnalyzer.analyze(
        pid,
        tempStdoutPath,
        tempStderrPath,
        command,
      );
      if (status === 'Unknown') llmAnalysis = `LLM analysis failed: ${summary}`;
      else llmAnalysis = summary;
    } catch (llmerror: unknown) {
      console.error(
        `LLM analysis failed for PID ${pid} command "${command}":`,
        llmerror,
      );
      llmAnalysis = `LLM analysis failed: ${getErrorMessage(llmerror)}`;
    }
    try {
      finalStdout = await fs.readFile(tempStdoutPath, 'utf-8');
      finalStderr = await fs.readFile(tempStderrPath, 'utf-8');
    } catch (err: unknown) {
      console.error(`Error reading temp output files for PID ${pid}:`, err);
      fileReadError = `\nWarning: Failed to read temporary output files (${getErrorMessage(err)}). Final output may be incomplete.`;
    }
    await this.cleanupTempFiles(tempStdoutPath, tempStderrPath);
    const truncatedFinalStdout = this.truncateOutput(finalStdout);
    const truncatedFinalStderr = this.truncateOutput(finalStderr);
    resolve({
      llmContent: `Background Command: ${command}\nLaunched in: ${cwd}\nPID: ${pid}\n--- LLM Analysis ---\n${llmAnalysis}\n--- Final Stdout (from ${path.basename(tempStdoutPath)}) ---\n${truncatedFinalStdout}\n--- Final Stderr (from ${path.basename(tempStderrPath)}) ---\n${truncatedFinalStderr}\n--- Launch Stdout ---\n${initialStdout}\n--- Launch Stderr ---\n${initialStderr}${fileReadError}`,
      returnDisplay: `(PID: ${pid}): ${this.truncateOutput(llmAnalysis, 200)}`,
    });
  }

  private async cleanupTempFiles(
    stdoutPath: string | null,
    stderrPath: string | null,
  ): Promise<void> {
    const unlinkQuietly = async (filePath: string | null) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (err: unknown) {
        if (!isNodeError(err) || err.code !== 'ENOENT') {
          console.warn(
            `Failed to delete temporary file '${filePath}': ${getErrorMessage(err)}`,
          );
        }
      }
    };
    await Promise.all([unlinkQuietly(stdoutPath), unlinkQuietly(stderrPath)]);
  }

  private getCurrentShellCwd(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (
        !this.bashProcess ||
        !this.bashProcess.stdin?.writable ||
        this.bashProcess.killed
      ) {
        return reject(
          new Error(
            'Shell not running, stdin not writable, or killed for PWD check',
          ),
        );
      }
      const pwdUuid = crypto.randomUUID();
      const pwdDelimiter = `::PWD_${pwdUuid}::`;
      let pwdOutput = '';
      let onPwdData: ((data: Buffer) => void) | null = null;
      let onPwdError: ((data: Buffer) => void) | null = null;
      let pwdTimeoutId: NodeJS.Timeout | null = null;
      let finished = false;
      const cleanupPwdListeners = (err?: Error) => {
        if (finished) return;
        finished = true;
        if (pwdTimeoutId) clearTimeout(pwdTimeoutId);
        pwdTimeoutId = null;
        const stdoutListener = onPwdData;
        const stderrListener = onPwdError;
        onPwdData = null;
        onPwdError = null;
        if (this.bashProcess && !this.bashProcess.killed) {
          if (stdoutListener)
            this.bashProcess.stdout.removeListener('data', stdoutListener);
          if (stderrListener)
            this.bashProcess.stderr.removeListener('data', stderrListener);
        }
        if (err) {
          reject(err);
        } else {
          resolve(pwdOutput.trim());
        }
      };
      onPwdData = (data: Buffer) => {
        if (!onPwdData) return;
        const dataStr = data.toString();
        const delimiterIndex = dataStr.indexOf(pwdDelimiter);
        if (delimiterIndex !== -1) {
          pwdOutput += dataStr.substring(0, delimiterIndex);
          cleanupPwdListeners();
        } else {
          pwdOutput += dataStr;
        }
      };
      onPwdError = (data: Buffer) => {
        if (!onPwdError) return;
        const dataStr = data.toString();
        console.error(`Error during PWD check: ${dataStr}`);
        cleanupPwdListeners(
          new Error(
            `Stderr received during pwd check: ${this.truncateOutput(dataStr, 100)}`,
          ),
        );
      };
      this.bashProcess.stdout.on('data', onPwdData);
      this.bashProcess.stderr.on('data', onPwdError);
      pwdTimeoutId = setTimeout(() => {
        cleanupPwdListeners(new Error('Timeout waiting for pwd response'));
      }, 5000);
      try {
        const pwdCommand = `printf "%s" "$PWD"; printf "${pwdDelimiter}";\n`;
        if (this.bashProcess?.stdin?.writable) {
          this.bashProcess.stdin.write(pwdCommand, (err) => {
            if (err) {
              console.error('Error writing pwd command (callback):', err);
              cleanupPwdListeners(
                new Error(`Failed to write pwd command: ${err.message}`),
              );
            }
          });
        } else {
          throw new Error('Shell stdin not writable for pwd command.');
        }
      } catch (e: unknown) {
        console.error('Exception writing pwd command:', e);
        cleanupPwdListeners(
          new Error(`Exception writing pwd command: ${getErrorMessage(e)}`),
        );
      }
    });
  }

  private truncateOutput(output: string, limit?: number): string {
    const effectiveLimit = limit ?? this.outputLimit;
    if (output.length > effectiveLimit) {
      return (
        output.substring(0, effectiveLimit) +
        `\n... [Output truncated at ${effectiveLimit} characters]`
      );
    }
    return output;
  }

  private clearQueue(error: Error) {
    const queue = this.commandQueue;
    this.commandQueue = [];
    queue.forEach(({ resolve, params }) =>
      resolve({
        llmContent: `Command cancelled: ${params.command}\nReason: ${error.message}`,
        returnDisplay: `Command Cancelled: ${error.message}`,
      }),
    );
  }

  destroy() {
    this.rejectShellReady?.(
      new Error('BashTool destroyed during initialization or operation.'),
    );
    this.rejectShellReady = undefined;
    this.resolveShellReady = undefined;
    this.clearQueue(new Error('BashTool is being destroyed.'));
    try {
      this.currentCommandCleanup?.();
    } catch (e) {
      console.warn('Error during current command cleanup:', e);
    }
    if (this.bashProcess) {
      const proc = this.bashProcess;
      const pid = proc.pid;
      this.bashProcess = null;
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      proc.removeAllListeners('error');
      proc.removeAllListeners('close');
      proc.stdin?.end();
      try {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 500);
      } catch (e: unknown) {
        console.warn(
          `Error trying to kill bash process PID: ${pid}: ${getErrorMessage(e)}`,
        );
      }
    }
  }
}
