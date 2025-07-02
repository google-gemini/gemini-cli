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
import stripAnsi from 'strip-ansi';

export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}
import { spawn } from 'child_process';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'run_shell_command';
  private whitelist: Set<string> = new Set();

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

  private hasDeleteCommand(command: string): boolean {
    const deleteCommands = [
      'rm', 'rmdir', 'del', 'erase', 'rd', // Unix/Linux and Windows delete commands
      'Remove-Item', 'Remove-ItemProperty', // PowerShell
      'unlink', 'trash' // Alternative delete commands
    ];
    
    // Split command by shell operators to handle compound commands
    const subCommands = this.splitIntoSubCommands(command);
    
    return subCommands.some(subCmd => {
      const commandRoot = this.getCommandRoot(subCmd.trim());
      return commandRoot ? deleteCommands.includes(commandRoot) : false;
    });
  }

  private splitIntoSubCommands(command: string): string[] {
    // Split on shell operators: &&, ||, |, ;
    // This is a simplified approach - could be enhanced for complex parsing
    return command.split(/&&|\|\||\||;/).map(cmd => cmd.trim()).filter(Boolean);
  }

  private extractFilePathsFromCommand(command: string): string[] {
    const paths: string[] = [];
    const isWindows = os.platform() === 'win32';
    const deleteCommands = [
      'rm', 'rmdir', 'del', 'erase', 'rd',
      'Remove-Item', 'Remove-ItemProperty',
      'unlink', 'trash'
    ];
    
    // Split into sub-commands and process each one
    const subCommands = this.splitIntoSubCommands(command);
    
    for (const subCmd of subCommands) {
      const parts = subCmd.trim().split(/\s+/);
      if (parts.length === 0) continue;
      
      const commandRoot = this.getCommandRoot(subCmd);
      if (!commandRoot || !deleteCommands.includes(commandRoot)) continue;
      
      // Extract file paths from this delete command
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        
        // Skip flags (starting with - or /)
        if (part.startsWith('-') || (isWindows && part.startsWith('/'))) continue;
        
        // This looks like a file path
        if (part && !part.includes('=') && !part.includes('>') && !part.includes('<')) {
          paths.push(part);
        }
      }
    }
    
    return paths;
  }

  private async createBackup(filePath: string, workingDir: string): Promise<string | null> {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(workingDir, filePath);
      
      // Check if file/directory exists
      if (!fs.existsSync(fullPath)) {
        return null; // Can't backup non-existent files
      }
      
      // Create backup directory
      const backupDir = path.join(workingDir, '.gemini', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      
      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const basename = path.basename(fullPath);
      const backupName = `${basename}.${timestamp}.backup`;
      const backupPath = path.join(backupDir, backupName);
      
      // Copy file or directory to backup location
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        await this.copyDirectory(fullPath, backupPath);
      } else {
        fs.copyFileSync(fullPath, backupPath);
      }
      
      return backupPath;
    } catch (error) {
      console.error(`Failed to create backup for ${filePath}:`, error);
      return null;
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private injectBackupCommands(command: string, workingDir: string): { command: string; backupMessages: string[] } {
    const deleteCommands = [
      'rm', 'rmdir', 'del', 'erase', 'rd',
      'Remove-Item', 'Remove-ItemProperty',
      'unlink', 'trash'
    ];
    const isWindows = os.platform() === 'win32';
    const backupMessages: string[] = [];
    
    // Create backup directory command
    const backupDir = path.join(workingDir, '.gemini', 'backups');
    const mkdirCmd = isWindows 
      ? `if not exist "${backupDir}" mkdir "${backupDir}"` 
      : `mkdir -p "${backupDir}"`;
    
    // Split command and inject backup logic before each delete command
    const subCommands = this.splitIntoSubCommands(command);
    const modifiedSubCommands: string[] = [];
    
    for (const subCmd of subCommands) {
      const trimmed = subCmd.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) {
        modifiedSubCommands.push(trimmed);
        continue;
      }
      
      const commandRoot = this.getCommandRoot(trimmed);
      if (!commandRoot || !deleteCommands.includes(commandRoot)) {
        modifiedSubCommands.push(trimmed);
        continue;
      }
      
      // This is a delete command - inject backup logic
      const filePaths: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('-') || (isWindows && part.startsWith('/'))) continue;
        if (part && !part.includes('=') && !part.includes('>') && !part.includes('<')) {
          filePaths.push(part);
        }
      }
      
      if (filePaths.length > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupCommands: string[] = [];
        
        for (const filePath of filePaths) {
          const basename = path.basename(filePath);
          const backupName = `${basename}.${timestamp}.backup`;
          const backupPath = path.join(backupDir, backupName);
          
          if (isWindows) {
            backupCommands.push(`if exist "${filePath}" copy "${filePath}" "${backupPath}" >nul 2>&1`);
          } else {
            backupCommands.push(`[ -e "${filePath}" ] && cp -r "${filePath}" "${backupPath}" 2>/dev/null || true`);
          }
          
          const relativePath = path.relative(workingDir, backupPath);
          backupMessages.push(`Backup will be created: ${relativePath}`);
        }
        
        // Combine: mkdir + backup commands + original delete command
        const combined = [mkdirCmd, ...backupCommands, trimmed].join(isWindows ? ' && ' : ' && ');
        modifiedSubCommands.push(combined);
      } else {
        modifiedSubCommands.push(trimmed);
      }
    }
    
    // Rejoin with original operators (simplified - assumes &&)
    const modifiedCommand = modifiedSubCommands.join(' && ');
    
    return { command: modifiedCommand, backupMessages };
  }

  isCommandAllowed(command: string): boolean {
    // 0. Disallow command substitution
    if (command.includes('$(') || command.includes('`')) {
      return false;
    }

    const SHELL_TOOL_NAMES = [ShellTool.name, ShellTool.Name];

    const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');

    /**
     * Checks if a command string starts with a given prefix, ensuring it's a
     * whole word match (i.e., followed by a space or it's an exact match).
     * e.g., `isPrefixedBy('npm install', 'npm')` -> true
     * e.g., `isPrefixedBy('npm', 'npm')` -> true
     * e.g., `isPrefixedBy('npminstall', 'npm')` -> false
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
      // 2. Check if the command is on the blocklist.
      const isBlocked = [...blockedCommands].some((blocked) =>
        isPrefixedBy(cmd, blocked),
      );
      if (isBlocked) {
        return false;
      }

      // 3. If in strict allow-list mode, check if the command is permitted.
      const isStrictAllowlist =
        hasSpecificAllowedCommands && !isWildcardAllowed;
      if (isStrictAllowlist) {
        const isAllowed = [...allowedCommands].some((allowed) =>
          isPrefixedBy(cmd, allowed),
        );
        if (!isAllowed) {
          return false;
        }
      }
    }

    // 4. If all checks pass, the command is allowed.
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
    updateOutput?: (chunk: string) => void,
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

    if (abortSignal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    // Handle backup for delete commands by modifying the command
    const workingDir = path.resolve(this.config.getTargetDir(), params.directory || '');
    const backupMessages: string[] = [];
    let modifiedCommand = params.command;
    
    if (this.config.getDeleteBackupsEnabled() && this.hasDeleteCommand(params.command)) {
      const result = this.injectBackupCommands(params.command, workingDir);
      modifiedCommand = result.command;
      backupMessages.push(...result.backupMessages);
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    // pgrep is not available on Windows, so we can't get background PIDs
    const command = isWindows
      ? modifiedCommand
      : (() => {
          // wrap command to append subprocess pids (via pgrep) to temporary file
          let command = modifiedCommand.trim();
          if (!command.endsWith('&')) command += ';';
          return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    // spawn command in specified directory (or project root if not specified)
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', command], {
          stdio: ['ignore', 'pipe', 'pipe'],
          // detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
        })
      : spawn('bash', ['-c', command], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
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
    abortSignal.addEventListener('abort', abortHandler);

    // wait for the shell to exit
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
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
      const contentLines = [
        `Command: ${params.command}`,
        `Directory: ${params.directory || '(root)'}`,
      ];
      
      // Add backup information if any backups were created
      if (backupMessages.length > 0) {
        contentLines.push(`Backups: ${backupMessages.join(', ')}`);
      }
      
      contentLines.push(
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
        `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
        `Process Group PGID: ${shell.pid ?? '(none)'}`,
      );
      
      llmContent = contentLines.join('\n');
    }

    let returnDisplayMessage = '';
    if (this.config.getDebugMode()) {
      returnDisplayMessage = llmContent;
    } else {
      // Include backup messages in user output
      const displayParts: string[] = [];
      if (backupMessages.length > 0) {
        displayParts.push(...backupMessages);
      }
      
      if (output.trim()) {
        displayParts.push(output);
      } else {
        // Output is empty, let's provide a reason if the command failed or was cancelled
        if (abortSignal.aborted) {
          displayParts.push('Command cancelled by user.');
        } else if (processSignal) {
          displayParts.push(`Command terminated by signal: ${processSignal}`);
        } else if (error) {
          // If error is not null, it's an Error object (or other truthy value)
          displayParts.push(`Command failed: ${getErrorMessage(error)}`);
        } else if (code !== null && code !== 0) {
          displayParts.push(`Command exited with code: ${code}`);
        }
        // If output is empty and command succeeded (code 0, no error/signal/abort),
        // we still want to show backup messages if any
      }
      
      returnDisplayMessage = displayParts.join('\n');
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
}
