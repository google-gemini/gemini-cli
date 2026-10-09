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
import {
  SafetyCheckDecision,
  type SafetyCheckInput,
  type SafetyCheckResult,
} from './protocol.js';
import type { CheckerRegistry } from './registry.js';
import type { ContextBuilder } from './context-builder.js';
import { z } from 'zod';

const SafetyCheckResultSchema: z.ZodType<SafetyCheckResult> =
  z.discriminatedUnion('decision', [
    z.object({
      decision: z.literal(SafetyCheckDecision.ALLOW),
      reason: z.string().optional(),
    }),
    z.object({
      decision: z.literal(SafetyCheckDecision.DENY),
      reason: z.string().min(1),
    }),
    z.object({
      decision: z.literal(SafetyCheckDecision.ASK_USER),
      reason: z.string().min(1),
    }),
  ]);

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
 *
 * External checkers are third-party binaries run locally: they get a
 * minimal environment (no CLI secrets such as API keys) and their output
 * is size-capped so a buggy or malicious checker cannot exhaust memory.
 */
export class CheckerRunner {
  private static readonly DEFAULT_TIMEOUT = 5000; // 5 seconds

  /**
   * Maximum stdout/stderr bytes collected from an external checker before
   * it is killed and the tool call is denied.
   */
  private static readonly MAX_OUTPUT_BYTES = 256 * 1024;

  private readonly registry: CheckerRegistry;
  private readonly contextBuilder: ContextBuilder;
  private readonly timeout: number;

  constructor(
    contextBuilder: ContextBuilder,
    registry: CheckerRegistry,
    config: CheckerRunnerConfig,
  ) {
    this.contextBuilder = contextBuilder;
    this.registry = registry;
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
        config: checkerConfig.config,
      };

      // In-process checkers can be async, but we'll also apply a timeout
      // for safety, in case of infinite loops or unexpected delays.
      return await this.executeWithTimeout(checker.check(input));
    } catch (error) {
      return {
        decision: SafetyCheckDecision.DENY,
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
        config: checkerConfig.config,
      };

      // Run the checker process
      return await this.executeCheckerProcess(
        checkerPath,
        input,
        checkerConfig.name,
      );
    } catch (error) {
      // If anything goes wrong, deny the operation
      return {
        decision: SafetyCheckDecision.DENY,
        reason: `Failed to run safety checker "${checkerConfig.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Minimal environment for external checkers: PATH (and SYSTEMROOT on
   * Windows) only, so secrets from the CLI process env are not handed to
   * third-party binaries. Explicit config.env entries win on top.
   */
  private buildCheckerEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    if (process.env['PATH'] !== undefined) {
      env['PATH'] = process.env['PATH'];
    }
    if (process.env['SYSTEMROOT'] !== undefined) {
      env['SYSTEMROOT'] = process.env['SYSTEMROOT'];
    }
    return { ...env, ...this.contextBuilder.config.env };
  }

  /**
   * Executes an external checker process and handles its lifecycle.
   */
  private executeCheckerProcess(
    checkerPath: string,
    input: SafetyCheckInput,
    checkerName: string,
  ): Promise<SafetyCheckResult> {
    return new Promise((resolve) => {
      const child = spawn(checkerPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.contextBuilder.config.getWorkingDir(),
        env: this.buildCheckerEnv(),
      });

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let capped = false;
      let timeoutHandle: NodeJS.Timeout | null = null;
      let killed = false;

      let exited = false;

      const capOutput = (
        streamName: 'stdout' | 'stderr',
        incomingBytes: number,
      ): boolean => {
        if (capped) {
          return true;
        }
        const total = streamName === 'stdout' ? stdoutBytes : stderrBytes;
        if (total + incomingBytes <= CheckerRunner.MAX_OUTPUT_BYTES) {
          return false;
        }
        capped = true;
        killed = true;
        child.kill('SIGTERM');
        resolve({
          decision: SafetyCheckDecision.DENY,
          reason: `Safety checker "${checkerName}" ${streamName} exceeded the ${CheckerRunner.MAX_OUTPUT_BYTES} byte output limit`,
        });
        // Fallback: if process doesn't exit after 5s, force kill
        setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
          }
        }, 5000).unref();
        return true;
      };

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        resolve({
          decision: SafetyCheckDecision.DENY,
          reason: `Safety checker "${checkerName}" timed out after ${this.timeout}ms`,
        });

        // Fallback: if process doesn't exit after 5s, force kill
        setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
          }
        }, 5000).unref();
      }, this.timeout);

      // Collect output
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          if (capOutput('stdout', data.length)) {
            return;
          }
          stdoutBytes += data.length;
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          if (capOutput('stderr', data.length)) {
            return;
          }
          stderrBytes += data.length;
          stderr += data.toString();
        });
      }

      // Handle process completion
      child.on('close', (code: number | null) => {
        exited = true;
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
            decision: SafetyCheckDecision.DENY,
            reason: `Safety checker "${checkerName}" exited with code ${code}${
              stderr ? `: ${stderr}` : ''
            }`,
          });
          return;
        }

        // Try to parse the output
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const rawResult = JSON.parse(stdout);
          const result = SafetyCheckResultSchema.parse(rawResult);

          resolve(result);
        } catch (parseError) {
          resolve({
            decision: SafetyCheckDecision.DENY,
            reason: `Failed to parse output from safety checker "${checkerName}": ${
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
            decision: SafetyCheckDecision.DENY,
            reason: `Failed to spawn safety checker "${checkerName}": ${error.message}`,
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
          decision: SafetyCheckDecision.DENY,
          reason: `Failed to write to stdin of safety checker "${checkerName}": ${
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
