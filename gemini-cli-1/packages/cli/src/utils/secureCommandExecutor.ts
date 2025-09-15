/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { validateAndSanitizeInput, validateCLIArguments } from './securityValidators.js';
import type { LoadedSettings } from '../config/settings.js';

/**
 * Secure command execution wrapper to prevent injection attacks
 */

export interface SecureCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
  settings: LoadedSettings;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string;
}

/**
 * Executes a command securely with comprehensive validation
 */
export function executeSecureCommand(
  command: string,
  args: string[] = [],
  options: SecureCommandOptions
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    try {
      // Validate and sanitize the command
      const sanitizedCommand = validateAndSanitizeInput(command, 'command');
      if (!sanitizedCommand) {
        throw new Error('Invalid command');
      }

      // Validate arguments
      const sanitizedArgs = validateCLIArguments(args, options.settings);

      // Prepare execution options
      const execOptions: any = {
        stdio: 'pipe',
        maxBuffer: 1024 * 1024, // 1MB limit
      };

      // Set working directory if provided
      if (options.cwd) {
        execOptions.cwd = options.cwd;
      }

      // Handle environment variables securely
      if (options.env) {
        execOptions.env = { ...process.env, ...options.env };
      }

      // Never use shell: true unless explicitly required and validated
      if (options.shell === true) {
        // Only allow shell execution for trusted, hardcoded commands
        const trustedCommands = ['npm', 'yarn', 'pnpm', 'git'];
        if (!trustedCommands.includes(sanitizedCommand)) {
          throw new Error('Shell execution not allowed for this command');
        }
        execOptions.shell = true;
      }

      // Execute the command
      const childProcess = spawn(sanitizedCommand, sanitizedArgs, execOptions);

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout;

      // Set up timeout if specified
      if (options.timeout && options.timeout > 0) {
        timeoutId = setTimeout(() => {
          childProcess.kill('SIGTERM');
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }, options.timeout);
      }

      // Collect stdout
      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= 1024 * 1024) { // 1MB limit
          stdout += chunk;
        }
      });

      // Collect stderr with size limit
      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= 1024 * 1024) { // 1MB limit
          stderr += chunk;
        }
      });

      // Handle process completion
      childProcess.on('close', (code, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          signal: signal || undefined,
        });
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: 1,
        });
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Validates and executes package manager commands securely
 */
export function executePackageManagerCommand(
  packageManager: 'npm' | 'yarn' | 'pnpm',
  command: string,
  args: string[] = [],
  options: Omit<SecureCommandOptions, 'shell'>
): Promise<CommandResult> {
  // Validate package manager
  const validPackageManagers = ['npm', 'yarn', 'pnpm'];
  if (!validPackageManagers.includes(packageManager)) {
    throw new Error('Invalid package manager');
  }

  // Validate command
  const allowedCommands = ['install', 'update', 'run', 'exec', 'add', 'remove'];
  if (!allowedCommands.includes(command)) {
    throw new Error('Invalid package manager command');
  }

  return executeSecureCommand(packageManager, [command, ...args], {
    ...options,
    shell: true, // Package managers need shell execution
  });
}

/**
 * Securely executes git commands with validation
 */
export function executeGitCommand(
  args: string[],
  options: Omit<SecureCommandOptions, 'shell'>
): Promise<CommandResult> {
  // Validate git arguments to prevent dangerous operations
  const dangerousArgs = ['--exec-path', '--git-dir', '--work-tree'];
  for (const arg of args) {
    if (dangerousArgs.some(dangerous => arg.includes(dangerous))) {
      throw new Error('Dangerous git argument detected');
    }
  }

  return executeSecureCommand('git', args, options);
}

/**
 * Validates and executes shell scripts securely
 */
export function executeSecureScript(
  scriptPath: string,
  args: string[] = [],
  options: SecureCommandOptions
): Promise<CommandResult> {
  // Validate script path
  if (!scriptPath.endsWith('.sh') && !scriptPath.endsWith('.bash')) {
    throw new Error('Only shell scripts are allowed');
  }

  // Additional path validation
  if (scriptPath.includes('..') || scriptPath.includes('/') || scriptPath.includes('\\')) {
    throw new Error('Invalid script path');
  }

  return executeSecureCommand('bash', [scriptPath, ...args], options);
}
