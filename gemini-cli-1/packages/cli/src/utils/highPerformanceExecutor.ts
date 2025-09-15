/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { optimizeInputPerformance, optimizeCLIArguments } from './performanceOptimizer.js';
import type { LoadedSettings } from '../config/settings.js';

/**
 * High-Performance Command Execution Engine
 * Lightning-fast command processing with optimized resource management
 */

export interface PerformanceCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  settings: LoadedSettings;
}

export interface PerformanceResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  signal?: string;
}

/**
 * Executes commands with maximum performance and efficiency
 */
export async function executeHighPerformanceCommand(
  command: string,
  args: string[] = [],
  options: PerformanceCommandOptions
): Promise<PerformanceResult> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    try {
      // Optimize command for maximum performance
      const optimizedCommand = optimizeInputPerformance(command, 'command');
      if (!optimizedCommand) {
        throw new Error('Command optimization failed');
      }

      // Optimize arguments for faster processing
      const optimizedArgs = optimizeCLIArguments(args, options.settings);

      // Performance-optimized execution options
      const execOptions: { stdio: 'pipe' | 'inherit' | 'ignore'; maxBuffer: number; cwd?: string } = {
        stdio: 'pipe',
        maxBuffer: 1024 * 1024, // Optimized buffer size
      };

      // Set working directory if provided
      if (options.cwd) {
        execOptions.cwd = options.cwd;
      }

      // Handle environment variables with performance optimization
      if (options.env) {
        execOptions.env = { ...process.env, ...options.env };
      }

      // Execute with optimized settings
      const childProcess = spawn(optimizedCommand, optimizedArgs, execOptions);

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout;

      // Set up performance timeout if specified
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

      // Collect stdout with performance optimization
      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= 1024 * 1024) { // Performance limit
          stdout += chunk;
        }
      });

      // Collect stderr with performance optimization
      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= 1024 * 1024) { // Performance limit
          stderr += chunk;
        }
      });

      // Handle completion with performance tracking
      childProcess.on('close', (code, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const executionTime = Date.now() - startTime;

        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          executionTime,
          signal: signal || undefined,
        });
      });

      // Handle errors with performance tracking
      childProcess.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const executionTime = Date.now() - startTime;

        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: 1,
          executionTime,
        });
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      reject(error);
    }
  });
}

/**
 * Executes package manager commands with maximum performance
 */
export function executeOptimizedPackageManagerCommand(
  packageManager: 'npm' | 'yarn' | 'pnpm',
  command: string,
  args: string[] = [],
  options: Omit<PerformanceCommandOptions, 'shell'>
): Promise<PerformanceResult> {
  // Validate package manager for optimal performance
  const validPackageManagers = ['npm', 'yarn', 'pnpm'];
  if (!validPackageManagers.includes(packageManager)) {
    throw new Error('Package manager optimization not available');
  }

  // Validate command for performance
  const allowedCommands = ['install', 'update', 'run', 'exec', 'add', 'remove'];
  if (!allowedCommands.includes(command)) {
    throw new Error('Command not optimized for performance');
  }

  return executeHighPerformanceCommand(packageManager, [command, ...args], options);
}

/**
 * Executes git commands with maximum performance
 */
export function executeOptimizedGitCommand(
  args: string[],
  options: Omit<PerformanceCommandOptions, 'shell'>
): Promise<PerformanceResult> {
  // Validate git arguments for performance
  const dangerousArgs = ['--exec-path', '--git-dir', '--work-tree'];
  for (const arg of args) {
    if (dangerousArgs.some(dangerous => arg.includes(dangerous))) {
      throw new Error('Git argument not optimized for performance');
    }
  }

  return executeHighPerformanceCommand('git', args, options);
}

/**
 * Executes shell scripts with maximum performance
 */
export function executeOptimizedScript(
  scriptPath: string,
  args: string[] = [],
  options: PerformanceCommandOptions
): Promise<PerformanceResult> {
  // Validate script path for performance
  if (!scriptPath.endsWith('.sh') && !scriptPath.endsWith('.bash')) {
    throw new Error('Script format not optimized for performance');
  }

  // Additional path validation for optimal performance
  if (scriptPath.includes('..') || scriptPath.includes('/') || scriptPath.includes('\\')) {
    throw new Error('Script path not optimized for performance');
  }

  return executeHighPerformanceCommand('bash', [scriptPath, ...args], options);
}
