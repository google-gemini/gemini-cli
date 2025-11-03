/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import type { FunctionCall } from '@google/genai';
import type {
  SafetyCheckerConfig,
  InProcessCheckerConfig,
  ExternalCheckerConfig,
} from '../policy/types.js';
import type { SafetyCheckInput, SafetyCheckResult } from './protocol.js';
import { CheckerRegistry } from './registry.js';
import type { ContextBuilder } from './context-builder.js';

/**
 * Configuration for the checker runner.
 */
export interface CheckerRunnerConfig {
  /**
   * Maximum time (in milliseconds) to wait for a checker to complete.
   * Default: 5000 (5 seconds)
   */
  timeout?: number;

  /**
   * Path to the directory containing external checkers.
   */
  checkersPath: string;
}

/**
 * Service for executing safety checker processes.
 */
export class CheckerRunner {
  private static readonly DEFAULT_TIMEOUT = 5000; // 5 seconds

  private readonly registry: CheckerRegistry;
  private readonly contextBuilder: ContextBuilder;
  private readonly timeout: number;

  constructor(contextBuilder: ContextBuilder, config: CheckerRunnerConfig) {
    this.contextBuilder = contextBuilder;
    this.registry = new CheckerRegistry(config.checkersPath);
    this.timeout = config.timeout ?? CheckerRunner.DEFAULT_TIMEOUT;
  }

  /**
   * Runs a safety checker and returns the result.
   */
  async runChecker(
    toolCall: FunctionCall,
    checkerConfig: SafetyCheckerConfig,
  ): Promise<SafetyCheckResult> {
    if (checkerConfig.type === 'in-process') {
      return this.runInProcessChecker(toolCall, checkerConfig);
    }
    return this.runExternalChecker(toolCall, checkerConfig);
  }

  private async runInProcessChecker(
    toolCall: FunctionCall,
    checkerConfig: InProcessCheckerConfig,
  ): Promise<SafetyCheckResult> {
    try {
      const checker = this.registry.resolveInProcess(checkerConfig.name);
      const context = checkerConfig.required_context
        ? this.contextBuilder.buildMinimalContext(
            checkerConfig.required_context,
          )
        : this.contextBuilder.buildFullContext();

      const input: SafetyCheckInput = {
        protocolVersion: '1.0.0',
        toolCall,
        context,
      };

      // In-process checkers can be async, but we'll also apply a timeout
      // for safety, in case of infinite loops or unexpected delays.
      return await this.executeWithTimeout(checker.check(input));
    } catch (error) {
      return {
        allowed: false,
        reason: `Failed to run in-process checker "${checkerConfig.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  private async runExternalChecker(
    toolCall: FunctionCall,
    checkerConfig: ExternalCheckerConfig,
  ): Promise<SafetyCheckResult> {
    try {
      // Resolve the checker executable path
      const checkerPath = this.registry.resolveExternal(checkerConfig.name);

      // Build the appropriate context
      const context = checkerConfig.required_context
        ? this.contextBuilder.buildMinimalContext(
            checkerConfig.required_context,
          )
        : this.contextBuilder.buildFullContext();

      // Create the input payload
      const input: SafetyCheckInput = {
        protocolVersion: '1.0.0',
        toolCall,
        context,
      };

      // Run the checker process
      return await this.executeCheckerProcess(checkerPath, input);
    } catch (error) {
      // If anything goes wrong, deny the operation
      return {
        allowed: false,
        reason: `Failed to run safety checker "${checkerConfig.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Executes an external checker process and handles its lifecycle.
   */
  private executeCheckerProcess(
    checkerPath: string,
    input: SafetyCheckInput,
  ): Promise<SafetyCheckResult> {
    return new Promise((resolve) => {
      const child = spawn('node', [checkerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;
      let killed = false;

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        resolve({
          allowed: false,
          reason: `Safety checker timed out after ${this.timeout}ms`,
        });
      }, this.timeout);

      // Collect output
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      // Handle process completion
      child.on('close', (code: number | null) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        // If we already killed it due to timeout, don't process the result
        if (killed) {
          return;
        }

        // Non-zero exit code is a failure
        if (code !== 0) {
          resolve({
            allowed: false,
            reason: `Safety checker exited with code ${code}${
              stderr ? `: ${stderr}` : ''
            }`,
          });
          return;
        }

        // Try to parse the output
        try {
          const result: SafetyCheckResult = JSON.parse(stdout);

          // Validate the result structure
          if (typeof result.allowed !== 'boolean') {
            throw new Error(
              'Invalid result: missing or invalid "allowed" field',
            );
          }

          resolve(result);
        } catch (parseError) {
          resolve({
            allowed: false,
            reason: `Failed to parse checker output: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          });
        }
      });

      // Handle process errors
      child.on('error', (error: Error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (!killed) {
          resolve({
            allowed: false,
            reason: `Failed to spawn checker process: ${error.message}`,
          });
        }
      });

      // Send input to the checker
      try {
        if (child.stdin) {
          child.stdin.write(JSON.stringify(input));
          child.stdin.end();
        } else {
          throw new Error('Failed to open stdin for checker process');
        }
      } catch (writeError) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        child.kill();
        resolve({
          allowed: false,
          reason: `Failed to write to checker stdin: ${
            writeError instanceof Error
              ? writeError.message
              : String(writeError)
          }`,
        });
      }
    });
  }

  /**
   * Executes a promise with a timeout.
   */
  private executeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Checker timed out after ${this.timeout}ms`));
      }, this.timeout);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => {
          clearTimeout(timeoutHandle);
        });
    });
  }
}
