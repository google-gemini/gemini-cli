import {
  spawn,
  SpawnOptions,
  ChildProcessWithoutNullStreams,
  exec,
} from 'child_process'; // Added 'exec'
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
} from '../ui/types.js'; // Adjust path as needed
import { BackgroundTerminalAnalyzer } from '../utils/BackgroundTerminalAnalyzer.js';

// --- Interfaces ---
export interface TerminalToolParams {
  command: string;
  description?: string;
  timeout?: number;
  runInBackground?: boolean;
}

export interface TerminalToolResult extends ToolResult {
  // Add specific fields if needed for structured output from polling/LLM
  // finalStdout?: string;
  // finalStderr?: string;
  // llmAnalysis?: string;
}

// --- Constants ---
const MAX_OUTPUT_LENGTH = 10000; // Default max output length
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (for foreground commands)
const MAX_TIMEOUT_OVERRIDE_MS = 10 * 60 * 1000; // 10 minutes (max override for foreground)
const BACKGROUND_LAUNCH_TIMEOUT_MS = 15 * 1000; // 15 seconds timeout for *launching* background tasks
const BACKGROUND_POLL_INTERVAL_MS = 5000; // 5 seconds interval for checking background process status
const BACKGROUND_POLL_TIMEOUT_MS = 30000; // 30 seconds total polling time for background process status

const BANNED_COMMAND_ROOTS = [
  // Session/flow control (excluding cd)
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
  /* 'pwd' is safe */ 'read',
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
  // Network commands
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
  'ftp',
  'rsync',
  // Browsers/GUI launchers
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

// --- Helper Type for Command Queue ---
interface QueuedCommand {
  params: TerminalToolParams;
  resolve: (result: TerminalToolResult) => void;
  reject: (error: Error) => void;
  confirmationDetails: ToolExecuteConfirmationDetails | false; // Kept for potential future use
}

/**
 * Implementation of the terminal tool that executes shell commands within a persistent session.
 */
export class TerminalTool extends BaseTool<
  TerminalToolParams,
  TerminalToolResult
> {
  static Name: string = 'execute_bash_command';

  private readonly rootDirectory: string;
  private readonly outputLimit: number;
  private bashProcess: ChildProcessWithoutNullStreams | null = null;
  private currentCwd: string;
  private isExecuting: boolean = false;
  private commandQueue: QueuedCommand[] = [];
  private currentCommandCleanup: (() => void) | null = null;
  private shouldAlwaysExecuteCommands: Map<string, boolean> = new Map(); // Track confirmation per root command
  private shellReady: Promise<void>;
  private resolveShellReady: (() => void) | undefined; // Definite assignment assertion
  private rejectShellReady: ((reason?: any) => void) | undefined; // Definite assignment assertion
  private readonly backgroundTerminalAnalyzer: BackgroundTerminalAnalyzer;

  constructor(rootDirectory: string, outputLimit: number = MAX_OUTPUT_LENGTH) {
    const toolDisplayName = 'Terminal';
    // --- LLM-Facing Description ---
    // Updated description for background tasks to mention polling and LLM analysis
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

3.  **Security & Banned Commands:**
    * Certain commands are banned for security (e.g., network: ${BANNED_COMMAND_ROOTS.filter((c) => ['curl', 'wget', 'ssh'].includes(c)).join(', ')}; session: ${BANNED_COMMAND_ROOTS.filter((c) => ['exit', 'export', 'kill'].includes(c)).join(', ')}; etc.). The full list is extensive.
    * If you attempt a banned command, this tool will return an error explaining the restriction. You MUST relay this error clearly to the user.

4.  **Command Execution Notes:**
    * Chain multiple commands using shell operators like ';' or '&&'. Do NOT use newlines within the 'command' parameter string itself (newlines are fine inside quoted arguments).
    * The shell's current working directory is tracked internally. While \`cd\` is permitted if the user explicitly asks or it's necessary for a workflow, **strongly prefer** using absolute paths or paths relative to the *known* current working directory to avoid errors. Check the '(Executed in: ...)' part of the previous command's output for the CWD.
        * Good example (if CWD is /workspace/project): \`pytest tests/unit\` or \`ls /workspace/project/data\`
        * Less preferred: \`cd tests && pytest unit\` (only use if necessary or requested)

5.  **Background Tasks (\`runInBackground: true\`):**
    * Use this for commands that are intended to run continuously (e.g., \`node server.js\`, \`npm start\`).
    * The tool initially returns success if the process *launches* successfully, along with its PID.
    * **Polling & Final Result:** The tool then monitors the process. The *final* result (delivered after polling completes or times out) will include:
        * The final status (completed or timed out).
        * The complete stdout and stderr captured in temporary files (truncated if necessary).
        * An LLM-generated analysis/summary of the output.
    * The initial exit code (usually 0) signifies successful *launching*; the final status indicates completion or timeout after polling.

Use this tool for running build steps (\`npm install\`, \`make\`), linters (\`eslint .\`), test runners (\`pytest\`, \`jest\`), code formatters (\`prettier --write .\`), package managers (\`pip install\`), version control operations (\`git status\`, \`git diff\`), starting background servers/services (\`node server.js --runInBackground true\`), or other safe, standard command-line operations within the project workspace.`;
    // --- Parameter Schema ---
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

    this.rootDirectory = path.resolve(rootDirectory);
    this.currentCwd = this.rootDirectory;
    this.outputLimit = outputLimit;
    this.shellReady = new Promise((resolve, reject) => {
      this.resolveShellReady = resolve;
      this.rejectShellReady = reject;
    });
    this.backgroundTerminalAnalyzer = new BackgroundTerminalAnalyzer();

    this.initializeShell();
  }

  // --- Shell Initialization and Management (largely unchanged) ---
  private initializeShell() {
    if (this.bashProcess) {
      try {
        this.bashProcess.kill();
      } catch (e) {
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
      this.currentCwd = this.rootDirectory; // Reset CWD on restart

      this.bashProcess.on('error', (err) => {
        console.error('Persistent Bash Error:', err);
        this.rejectShellReady?.(err); // Use optional chaining as reject might be cleared
        this.bashProcess = null;
        this.isExecuting = false;
        this.clearQueue(
          new Error(`Persistent bash process failed to start: ${err.message}`),
        );
      });

      this.bashProcess.on('close', (code, signal) => {
        this.bashProcess = null;
        this.isExecuting = false;
        // Only reject if it hasn't been resolved/rejected already
        this.rejectShellReady?.(
          new Error(
            `Persistent bash process exited (code: ${code}, signal: ${signal})`,
          ),
        );
        // Reset shell readiness promise for reinitialization attempts
        this.shellReady = new Promise((resolve, reject) => {
          this.resolveShellReady = resolve;
          this.rejectShellReady = reject;
        });
        this.clearQueue(
          new Error(
            `Persistent bash process exited unexpectedly (code: ${code}, signal: ${signal}). State is lost. Queued commands cancelled.`,
          ),
        );
        // Attempt to reinitialize after a short delay
        setTimeout(() => this.initializeShell(), 1000);
      });

      // Readiness check - ensure shell is responsive
      // Slightly longer timeout to allow shell init
      setTimeout(() => {
        if (this.bashProcess && !this.bashProcess.killed) {
          this.resolveShellReady?.(); // Use optional chaining
        } else if (!this.bashProcess) {
          // Error likely already handled by 'error' or 'close' event
        } else {
          // Process was killed during init?
          this.rejectShellReady?.(
            new Error('Shell killed during initialization'),
          );
        }
      }, 1000); // Increase readiness check timeout slightly
    } catch (error: any) {
      console.error('Failed to spawn persistent bash:', error);
      this.rejectShellReady?.(error); // Use optional chaining
      this.bashProcess = null;
      this.clearQueue(
        new Error(`Failed to spawn persistent bash: ${error.message}`),
      );
    }
  }

  // --- Parameter Validation (unchanged) ---
  invalidParams(params: TerminalToolParams): string | null {
    if (
      !SchemaValidator.validate(
        this.parameterSchema as Record<string, unknown>,
        params,
      )
    ) {
      return `Parameters failed schema validation.`;
    }

    const commandOriginal = params.command.trim();
    if (!commandOriginal) {
      return 'Command cannot be empty.';
    }
    const commandLower = commandOriginal.toLowerCase();
    const commandParts = commandOriginal.split(/[\s;&&|]+/);

    for (const part of commandParts) {
      if (!part) continue;
      // Improved check: strip leading special chars before checking basename
      const cleanPart =
        part
          .replace(/^[^a-zA-Z0-9]+/, '')
          .split(/[\/\\]/)
          .pop() || part.replace(/^[^a-zA-Z0-9]+/, '');
      if (cleanPart && BANNED_COMMAND_ROOTS.includes(cleanPart.toLowerCase())) {
        return `Command contains a banned keyword: '${cleanPart}'. Banned list includes network tools, session control, etc.`;
      }
    }

    if (
      params.timeout !== undefined &&
      (typeof params.timeout !== 'number' || params.timeout <= 0)
    ) {
      return 'Timeout must be a positive number of milliseconds.';
    }

    // Relax the absolute path restriction slightly if needed, but generally good practice
    // const firstCommandPart = commandParts[0];
    // if (firstCommandPart && (firstCommandPart.startsWith('/') || firstCommandPart.startsWith('\\'))) {
    //     return 'Executing commands via absolute paths (starting with \'/\' or \'\\\') is restricted. Use commands available in PATH or relative paths.';
    // }

    return null; // Parameters are valid
  }

  // --- Description and Confirmation (unchanged) ---
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
        ?.split(/[\/\\]/)
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

  // --- Command Execution and Queueing (unchanged structure) ---
  async execute(params: TerminalToolParams): Promise<TerminalToolResult> {
    const validationError = this.invalidParams(params);
    if (validationError) {
      return {
        llmContent: `Command rejected: ${params.command}\nReason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // Assume confirmation is handled before calling execute

    return new Promise((resolve) => {
      const queuedItem: QueuedCommand = {
        params,
        resolve, // Resolve outer promise
        reject: (error) =>
          resolve({
            // Handle internal errors by resolving outer promise
            llmContent: `Internal tool error for command: ${params.command}\nError: ${error.message}`,
            returnDisplay: `Internal Tool Error: ${error.message}`,
          }),
        confirmationDetails: false, // Placeholder
      };
      this.commandQueue.push(queuedItem);
      // Ensure queue processing is triggered *after* adding the item
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
      await this.shellReady; // Wait for the shell to be ready (or reinitialized)
      if (!this.bashProcess || this.bashProcess.killed) {
        // Check if killed
        throw new Error(
          'Persistent bash process is not available or was killed.',
        );
      }
      // **** Core execution logic call ****
      const result = await this.executeCommandInShell(params);
      resolve(result); // Resolve the specific command's promise
    } catch (error: any) {
      console.error(`Error executing command "${params.command}":`, error);
      reject(error); // Use the specific command's reject handler
    } finally {
      this.isExecuting = false;
      // Use setImmediate to avoid potential deep recursion
      setImmediate(() => this.triggerQueueProcessing());
    }
  }

  // --- **** MODIFIED: Core Command Execution Logic **** ---
  private executeCommandInShell(
    params: TerminalToolParams,
  ): Promise<TerminalToolResult> {
    // Define temp file paths here to be accessible throughout
    let tempStdoutPath: string | null = null;
    let tempStderrPath: string | null = null;
    let originalResolve: (
      value: TerminalToolResult | PromiseLike<TerminalToolResult>,
    ) => void; // To pass to polling
    let originalReject: (reason?: any) => void;

    const promise = new Promise<TerminalToolResult>((resolve, reject) => {
      originalResolve = resolve; // Assign outer scope resolve
      originalReject = reject; // Assign outer scope reject

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
      const pidDelimiter = `::PID_${commandUUID}::`; // For background PID

      // --- Initialize Temp Files for Background Task ---
      if (isBackgroundTask) {
        try {
          const tempDir = os.tmpdir();
          tempStdoutPath = path.join(tempDir, `term_out_${commandUUID}.log`);
          tempStderrPath = path.join(tempDir, `term_err_${commandUUID}.log`);
        } catch (err: any) {
          // If temp dir setup fails, reject immediately
          return reject(
            new Error(
              `Failed to determine temporary directory: ${err.message}`,
            ),
          );
        }
      }
      // --- End Temp File Init ---

      let stdoutBuffer = ''; // For launch output
      let stderrBuffer = ''; // For launch output
      let commandOutputStarted = false;
      let exitCode: number | null = null;
      let backgroundPid: number | null = null; // Store PID
      let receivedEndDelimiter = false;

      // Timeout only applies to foreground execution or background *launch* phase
      const effectiveTimeout = isBackgroundTask
        ? BACKGROUND_LAUNCH_TIMEOUT_MS
        : Math.min(
            params.timeout ?? DEFAULT_TIMEOUT_MS, // Use default timeout if not provided
            MAX_TIMEOUT_OVERRIDE_MS,
          );

      let onStdoutData: ((data: Buffer) => void) | null = null;
      let onStderrData: ((data: Buffer) => void) | null = null;
      let launchTimeoutId: NodeJS.Timeout | null = null; // Renamed for clarity

      launchTimeoutId = setTimeout(() => {
        const timeoutMessage = isBackgroundTask
          ? `Background command launch timed out after ${effectiveTimeout}ms.`
          : `Command timed out after ${effectiveTimeout}ms.`;

        if (!isBackgroundTask && this.bashProcess && !this.bashProcess.killed) {
          try {
            this.bashProcess.stdin.write('\x03'); // Ctrl+C for foreground timeout
          } catch (e: any) {
            console.error('Error writing SIGINT on timeout:', e);
          }
        }
        // Store listeners before calling cleanup, as cleanup nullifies them
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean); // Clean up listeners for this command

        // Clean up temp files if background launch timed out
        if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
          this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch((err) => {
            console.warn(
              `Error cleaning up temp files on timeout: ${err.message}`,
            );
          });
        }

        // Resolve the main promise with timeout info
        originalResolve({
          llmContent: `Command execution failed: ${timeoutMessage}\nCommand: ${params.command}\nExecuted in: ${this.currentCwd}\n${isBackgroundTask ? 'Mode: Background Launch' : `Mode: Foreground\nTimeout Limit: ${effectiveTimeout}ms`}\nPartial Stdout (Launch):\n${this.truncateOutput(stdoutBuffer)}\nPartial Stderr (Launch):\n${this.truncateOutput(stderrBuffer)}\nNote: ${isBackgroundTask ? 'Launch failed or took too long.' : 'Attempted interrupt (SIGINT). Shell state might be unpredictable if command ignored interrupt.'}`,
          returnDisplay: `Timeout: ${timeoutMessage}`,
        });
      }, effectiveTimeout);

      // --- Data processing logic (refined slightly) ---
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
            return false; // Still waiting for start delimiter
          }
        }

        // Process PID delimiter (mostly expected on stderr for background)
        const pidIndex = dataToProcess.indexOf(pidDelimiter);
        if (pidIndex !== -1) {
          // Extract PID value strictly between delimiter and newline/end
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
            // Consume delimiter even if no number followed
            const beforePid = dataToProcess.substring(0, pidIndex);
            if (isStderr) stderrBuffer += beforePid;
            else stdoutBuffer += beforePid;
            dataToProcess = dataToProcess.substring(
              pidIndex + pidDelimiter.length,
            );
          }
        }

        // Process Exit Code delimiter
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

        // Process End delimiter
        const endDelimiterIndex = dataToProcess.indexOf(endDelimiter);
        if (endDelimiterIndex !== -1) {
          receivedEndDelimiter = true;
          const beforeEndDelimiter = dataToProcess.substring(
            0,
            endDelimiterIndex,
          );
          if (isStderr) stderrBuffer += beforeEndDelimiter;
          else stdoutBuffer += beforeEndDelimiter;
          // Consume delimiter and potentially the exit code echoed after it
          const afterEndDelimiter = dataToProcess.substring(
            endDelimiterIndex + endDelimiter.length,
          );
          const exitCodeEchoMatch = afterEndDelimiter.match(/^(\d+)/);
          dataToProcess = exitCodeEchoMatch
            ? afterEndDelimiter.substring(exitCodeEchoMatch[1].length)
            : afterEndDelimiter;
        }

        // Append remaining data
        if (dataToProcess.length > 0) {
          if (isStderr) stderrBuffer += dataToProcess;
          else stdoutBuffer += dataToProcess;
        }

        // Check completion criteria
        if (receivedEndDelimiter && exitCode !== null) {
          setImmediate(cleanupAndResolve); // Use setImmediate
          return true; // Signal completion of this command's stream processing
        }

        return false; // More data or delimiters expected
      };

      // Assign listeners
      onStdoutData = (data: Buffer) => processDataChunk(data.toString(), false);
      onStderrData = (data: Buffer) => processDataChunk(data.toString(), true);

      // --- Cleanup Logic ---
      // Pass listeners to allow cleanup even if they are nullified later
      const cleanupListeners = (listeners?: {
        onStdoutData: any;
        onStderrData: any;
      }) => {
        if (launchTimeoutId) clearTimeout(launchTimeoutId);
        launchTimeoutId = null;

        // Use passed-in listeners if available, otherwise use current scope's
        const stdoutListener = listeners?.onStdoutData ?? onStdoutData;
        const stderrListener = listeners?.onStderrData ?? onStderrData;

        if (this.bashProcess && !this.bashProcess.killed) {
          if (stdoutListener)
            this.bashProcess.stdout.removeListener('data', stdoutListener);
          if (stderrListener)
            this.bashProcess.stderr.removeListener('data', stderrListener);
        }
        // Only nullify the *current command's* cleanup reference if it matches
        if (this.currentCommandCleanup === cleanupListeners) {
          this.currentCommandCleanup = null;
        }
        // Nullify the listener references in the outer scope regardless
        onStdoutData = null;
        onStderrData = null;
      };
      // Store *this specific* cleanup function instance for the current command
      this.currentCommandCleanup = cleanupListeners;

      // --- Final Resolution / Polling Logic ---
      const cleanupAndResolve = async () => {
        // Prevent double execution if cleanup was already called (e.g., by timeout)
        if (
          !this.currentCommandCleanup ||
          this.currentCommandCleanup !== cleanupListeners
        ) {
          // Ensure temp files are cleaned if this command was superseded but might have created them
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

        // Capture initial output *before* cleanup nullifies buffers indirectly
        const launchStdout = this.truncateOutput(stdoutBuffer);
        const launchStderr = this.truncateOutput(stderrBuffer);

        // Store listeners before calling cleanup
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean); // Remove listeners and clear launch timeout NOW

        // --- Error check for missing exit code ---
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
            // Use originalResolve as this is a failure *before* polling starts
            llmContent: `Command: ${params.command}\nExecuted in: ${this.currentCwd}\nMode: ${errorMode}\nExit Code: -2 (Internal Error: Exit code not captured)\nStdout (during setup):\n${launchStdout}\nStderr (during setup):\n${launchStderr}`,
            returnDisplay:
              `Internal Error: Failed to capture command exit code.\n${launchStdout}\nStderr: ${launchStderr}`.trim(),
          });
          return;
        }

        // --- CWD Update Logic (Only for Foreground Success or 'cd') ---
        let cwdUpdateError = '';
        if (!isBackgroundTask) {
          // Only run for foreground
          const mightChangeCwd = params.command.trim().startsWith('cd ');
          if (exitCode === 0 || mightChangeCwd) {
            try {
              const latestCwd = await this.getCurrentShellCwd();
              if (this.currentCwd !== latestCwd) {
                this.currentCwd = latestCwd;
              }
            } catch (e: any) {
              if (exitCode === 0) {
                // Only warn if the command itself succeeded
                cwdUpdateError = `\nWarning: Failed to verify/update current working directory after command: ${e.message}`;
                console.error(
                  'Failed to update CWD after successful command:',
                  e,
                );
              }
            }
          }
        }
        // --- End CWD Update ---

        // --- Result Formatting & Polling Decision ---
        if (isBackgroundTask) {
          const launchSuccess = exitCode === 0;
          const pidString =
            backgroundPid !== null ? backgroundPid.toString() : 'Not Captured';

          // Check if polling should start
          if (
            launchSuccess &&
            backgroundPid !== null &&
            tempStdoutPath &&
            tempStderrPath
          ) {
            // --- START POLLING ---
            // Don't await this, let it run in the background and resolve the original promise later
            this.inspectBackgroundProcess(
              backgroundPid,
              params.command,
              this.currentCwd, // CWD at time of launch
              launchStdout, // Initial output captured during launch
              launchStderr, // Initial output captured during launch
              tempStdoutPath, // Path for final stdout
              tempStderrPath, // Path for final stderr
              originalResolve, // The resolve function of the main promise
            );
            // IMPORTANT: Do NOT resolve the promise here. pollBackgroundProcess will do it.
            // --- END POLLING ---
          } else {
            // Background launch failed OR PID was not captured OR temp files missing
            const reason =
              backgroundPid === null
                ? 'PID not captured'
                : `Launch failed (Exit Code: ${exitCode})`;
            const displayMessage = `Failed to launch process in background (${reason})`;
            console.error(
              `Background launch failed for command: ${params.command}. Reason: ${reason}`,
            ); // ERROR LOG
            // Ensure cleanup of temp files if launch failed
            if (tempStdoutPath && tempStderrPath) {
              await this.cleanupTempFiles(tempStdoutPath, tempStderrPath);
            }
            originalResolve({
              // Use originalResolve as polling won't start
              llmContent: `Background Command Launch Failed: ${params.command}\nExecuted in: ${this.currentCwd}\nReason: ${reason}\nPID: ${pidString}\nExit Code (Launch): ${exitCode}\nStdout (During Launch):\n${launchStdout}\nStderr (During Launch):\n${launchStderr}`,
              returnDisplay: displayMessage,
            });
          }
        } else {
          // --- Foreground task result (resolve immediately) ---
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
            // Use originalResolve for foreground result
            llmContent: `Command: ${params.command}\nExecuted in: ${this.currentCwd}\nExit Code: ${exitCode}\nStdout:\n${launchStdout}\nStderr:\n${launchStderr}${cwdUpdateError}`,
            returnDisplay: displayOutput.trim() || `Exit Code: ${exitCode}`, // Ensure some display
          });
          // --- End Foreground Result ---
        }
      }; // End of cleanupAndResolve

      // --- Attach listeners ---
      if (!this.bashProcess || this.bashProcess.killed) {
        console.error(
          'Bash process lost or killed before listeners could be attached.',
        );
        // Ensure temp files are cleaned up if they exist
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
      // Defensive remove shouldn't be strictly necessary with current cleanup logic, but harmless
      // if (onStdoutData) this.bashProcess.stdout.removeListener('data', onStdoutData);
      // if (onStderrData) this.bashProcess.stderr.removeListener('data', onStderrData);

      // Attach the fresh listeners
      if (onStdoutData) this.bashProcess.stdout.on('data', onStdoutData);
      if (onStderrData) this.bashProcess.stderr.on('data', onStderrData);

      // --- Construct and Write Command ---
      let commandToWrite: string;
      if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
        // Background: Redirect command's stdout/stderr to temp files.
        // Use subshell { ... } > file 2> file to redirect the command inside.
        // Capture PID of the subshell. Capture exit code of the subshell launch.
        // Ensure the subshell itself doesn't interfere with delimiter capture on stderr.
        commandToWrite = `echo "${startDelimiter}"; { { ${params.command} > "${tempStdoutPath}" 2> "${tempStderrPath}"; } & } 2>/dev/null; __LAST_PID=$!; echo "${pidDelimiter}$__LAST_PID" >&2; echo "${exitCodeDelimiter}$?" >&2; echo "${endDelimiter}$?" >&1\n`;
      } else if (!isBackgroundTask) {
        // Foreground: Original structure. Capture command exit code.
        commandToWrite = `echo "${startDelimiter}"; ${params.command}; __EXIT_CODE=$?; echo "${exitCodeDelimiter}$__EXIT_CODE" >&2; echo "${endDelimiter}$__EXIT_CODE" >&1\n`;
      } else {
        // Should not happen if background task setup failed, but handle defensively
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
              // Store listeners before calling cleanup
              const listenersToClean = {
                onStdoutData,
                onStderrData,
              };
              cleanupListeners(listenersToClean); // Attempt cleanup
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
      } catch (e: any) {
        console.error(
          `Error writing command "${params.command}" to bash stdin (sync):`,
          e,
        );
        // Store listeners before calling cleanup
        const listenersToClean = { onStdoutData, onStderrData };
        cleanupListeners(listenersToClean); // Attempt cleanup
        if (isBackgroundTask && tempStdoutPath && tempStderrPath) {
          this.cleanupTempFiles(tempStdoutPath, tempStderrPath).catch((err) =>
            console.warn(`Cleanup failed: ${err.message}`),
          );
        }
        originalReject(
          new Error(
            `Shell stdin write exception: ${e.message}. Command likely did not execute.`,
          ),
        );
      }
    }); // End of main promise constructor

    return promise; // Return the promise created at the top
  } // End of executeCommandInShell

  // --- **** NEW: Background Process Polling **** ---
  private async inspectBackgroundProcess(
    pid: number,
    command: string,
    cwd: string,
    initialStdout: string, // Stdout during launch phase
    initialStderr: string, // Stderr during launch phase
    tempStdoutPath: string, // Path to redirected stdout
    tempStderrPath: string, // Path to redirected stderr
    resolve: (
      value: TerminalToolResult | PromiseLike<TerminalToolResult>,
    ) => void, // The original promise's resolve
  ): Promise<void> {
    // This function manages its own lifecycle but resolves the outer promise
    let finalStdout = '';
    let finalStderr = '';
    let llmAnalysis = '';
    let fileReadError = '';

    // --- Call LLM Analysis ---
    try {
      const { status, summary } = await this.backgroundTerminalAnalyzer.analyze(
        pid,
        tempStdoutPath,
        tempStderrPath,
        command,
      );
      if (status === 'Unknown') llmAnalysis = `LLM analysis failed: ${summary}`;
      else llmAnalysis = summary;
    } catch (llmError: any) {
      console.error(
        `LLM analysis failed for PID ${pid} command "${command}":`,
        llmError,
      );
      llmAnalysis = `LLM analysis failed: ${llmError.message}`; // Include error in analysis placeholder
    }
    // --- End LLM Call ---

    try {
      finalStdout = await fs.readFile(tempStdoutPath, 'utf-8');
      finalStderr = await fs.readFile(tempStderrPath, 'utf-8');
    } catch (err: any) {
      console.error(`Error reading temp output files for PID ${pid}:`, err);
      fileReadError = `\nWarning: Failed to read temporary output files (${err.message}). Final output may be incomplete.`;
    }

    // --- Clean up temp files ---
    await this.cleanupTempFiles(tempStdoutPath, tempStderrPath);
    // --- End Cleanup ---

    const truncatedFinalStdout = this.truncateOutput(finalStdout);
    const truncatedFinalStderr = this.truncateOutput(finalStderr);

    // Resolve the original promise passed into pollBackgroundProcess
    resolve({
      llmContent: `Background Command: ${command}\nLaunched in: ${cwd}\nPID: ${pid}\n--- LLM Analysis ---\n${llmAnalysis}\n--- Final Stdout (from ${path.basename(tempStdoutPath)}) ---\n${truncatedFinalStdout}\n--- Final Stderr (from ${path.basename(tempStderrPath)}) ---\n${truncatedFinalStderr}\n--- Launch Stdout ---\n${initialStdout}\n--- Launch Stderr ---\n${initialStderr}${fileReadError}`,
      returnDisplay: `(PID: ${pid}): ${this.truncateOutput(llmAnalysis, 200)}`,
    });
  } // End of pollBackgroundProcess

  // --- **** NEW: Helper to cleanup temp files **** ---
  private async cleanupTempFiles(
    stdoutPath: string | null,
    stderrPath: string | null,
  ): Promise<void> {
    const unlinkQuietly = async (filePath: string | null) => {
      if (!filePath) return;
      try {
        await fs.unlink(filePath);
      } catch (err: any) {
        // Ignore errors like file not found (it might have been deleted already or failed to create)
        if (err.code !== 'ENOENT') {
          console.warn(
            `Failed to delete temporary file '${filePath}': ${err.message}`,
          );
        } else {
        }
      }
    };
    // Run deletions concurrently and wait for both
    await Promise.all([unlinkQuietly(stdoutPath), unlinkQuietly(stderrPath)]);
  }

  // --- Get CWD (mostly unchanged, added robustness) ---
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
      let onPwdError: ((data: Buffer) => void) | null = null; // To catch errors during pwd
      let pwdTimeoutId: NodeJS.Timeout | null = null;
      let finished = false; // Prevent double resolution/rejection

      const cleanupPwdListeners = (err?: Error) => {
        if (finished) return; // Already handled
        finished = true;
        if (pwdTimeoutId) clearTimeout(pwdTimeoutId);
        pwdTimeoutId = null;

        const stdoutListener = onPwdData; // Capture current reference
        const stderrListener = onPwdError; // Capture current reference
        onPwdData = null; // Nullify before removing
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
          // Trim whitespace and trailing newlines robustly
          resolve(pwdOutput.trim());
        }
      };

      onPwdData = (data: Buffer) => {
        if (!onPwdData) return; // Listener removed
        const dataStr = data.toString();
        const delimiterIndex = dataStr.indexOf(pwdDelimiter);
        if (delimiterIndex !== -1) {
          pwdOutput += dataStr.substring(0, delimiterIndex);
          cleanupPwdListeners(); // Resolve successfully
        } else {
          pwdOutput += dataStr;
        }
      };

      onPwdError = (data: Buffer) => {
        if (!onPwdError) return; // Listener removed
        const dataStr = data.toString();
        // If delimiter appears on stderr, or any stderr occurs, treat as error
        console.error(`Error during PWD check: ${dataStr}`);
        cleanupPwdListeners(
          new Error(
            `Stderr received during pwd check: ${this.truncateOutput(dataStr, 100)}`,
          ),
        );
      };

      // Attach listeners
      this.bashProcess.stdout.on('data', onPwdData);
      this.bashProcess.stderr.on('data', onPwdError);

      // Set timeout
      pwdTimeoutId = setTimeout(() => {
        cleanupPwdListeners(new Error('Timeout waiting for pwd response'));
      }, 5000); // 5 second timeout for pwd

      // Write command
      try {
        // Use printf for robustness against special characters in PWD and ensure newline
        const pwdCommand = `printf "%s" "$PWD"; printf "${pwdDelimiter}";\n`;
        if (this.bashProcess?.stdin?.writable) {
          this.bashProcess.stdin.write(pwdCommand, (err) => {
            if (err) {
              // Error during write callback, likely means shell is unresponsive
              console.error('Error writing pwd command (callback):', err);
              cleanupPwdListeners(
                new Error(`Failed to write pwd command: ${err.message}`),
              );
            }
          });
        } else {
          throw new Error('Shell stdin not writable for pwd command.');
        }
      } catch (e: any) {
        console.error('Exception writing pwd command:', e);
        cleanupPwdListeners(
          new Error(`Exception writing pwd command: ${e.message}`),
        );
      }
    });
  }

  // --- Truncate Output (unchanged) ---
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

  // --- Clear Queue (unchanged) ---
  private clearQueue(error: Error) {
    const queuedCount = this.commandQueue.length;
    const queue = this.commandQueue;
    this.commandQueue = [];
    queue.forEach(({ resolve, params }) =>
      resolve({
        llmContent: `Command cancelled: ${params.command}\nReason: ${error.message}`,
        returnDisplay: `Command Cancelled: ${error.message}`,
      }),
    );
  }

  // --- Destroy (Added cleanup for pending background tasks if possible) ---
  destroy() {
    // Reject any pending shell readiness promise
    this.rejectShellReady?.(
      new Error('BashTool destroyed during initialization or operation.'),
    );
    this.rejectShellReady = undefined; // Prevent further calls
    this.resolveShellReady = undefined;

    this.clearQueue(new Error('BashTool is being destroyed.'));

    // Attempt to cleanup listeners for the *currently executing* command, if any
    try {
      this.currentCommandCleanup?.();
    } catch (e) {
      console.warn('Error during current command cleanup:', e);
    }

    // Handle the bash process itself
    if (this.bashProcess) {
      const proc = this.bashProcess; // Reference before nullifying
      const pid = proc.pid;
      this.bashProcess = null; // Nullify reference immediately

      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      proc.removeAllListeners('error');
      proc.removeAllListeners('close');

      // Ensure stdin is closed
      proc.stdin?.end();

      try {
        // Don't wait for these, just attempt
        proc.kill('SIGTERM'); // Attempt graceful first
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL'); // Force kill if needed
          }
        }, 500); // 500ms grace period
      } catch (e: any) {
        // Catch errors if process already exited etc.
        console.warn(
          `Error trying to kill bash process PID: ${pid}: ${e.message}`,
        );
      }
    } else {
    }

    // Note: We cannot reliably clean up temp files for background tasks
    // that were polling when destroy() was called without more complex state tracking.
    // OS should eventually clean /tmp, or implement a startup cleanup routine if needed.
  }
} // End of TerminalTool class
