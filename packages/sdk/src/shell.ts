/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AgentLoopContext,
  ShellExecutionService,
  ShellTool,
  type Config as CoreConfig,
} from '@google/gemini-cli-core';
import type {
  AgentShell,
  AgentShellResult,
  AgentShellOptions,
} from './types.js';

/**
 * SDK implementation of {@link AgentShell} that executes commands via the
 * core ShellExecutionService, subject to the agent's security policies.
 *
 * Commands that require interactive confirmation will be rejected since
 * no interactive session is available in headless SDK mode.
 *
 * @remarks In this implementation, stderr is combined into stdout by the
 * underlying ShellExecutionService. As a result, the stderr field of the
 * returned {@link AgentShellResult} will be empty, and both output and
 * stdout will contain the combined output.
 */
export class SdkAgentShell implements AgentShell {
  constructor(private readonly config: CoreConfig) {}

  async exec(
    command: string,
    options?: AgentShellOptions,
  ): Promise<AgentShellResult> {
    const cwd = options?.cwd || this.config.getWorkingDir();
    const abortController = new AbortController();

    // Link caller-supplied signal if provided
    let callerSignalCleanUp: (() => void) | undefined;
    if (options?.signal) {
      if (options.signal.aborted) {
        abortController.abort(options.signal.reason);
      } else {
        const onAbort = () => abortController.abort(options.signal?.reason);
        options.signal.addEventListener('abort', onAbort, { once: true });
        callerSignalCleanUp = () =>
          options.signal?.removeEventListener('abort', onAbort);
      }
    }

    // Set up timeout if requested
    let timeoutId: NodeJS.Timeout | undefined;
    let didTimeout = false;
    if (options?.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        abortController.abort(
          new Error(
            `Command timed out after ${options.timeoutSeconds} seconds.`,
          ),
        );
      }, options.timeoutSeconds * 1000);
    }

    // Use ShellTool to check policy
    const loopContext: AgentLoopContext = this.config;
    const shellTool = new ShellTool(this.config, loopContext.messageBus);
    try {
      const invocation = shellTool.build({
        command,
        dir_path: cwd,
      });

      const confirmation = await invocation.shouldConfirmExecute(
        abortController.signal,
      );
      if (confirmation) {
        throw new Error(
          'Command execution requires confirmation but no interactive session is available.',
        );
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      callerSignalCleanUp?.();
      return {
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    try {
      const baseExecutionConfig = this.config.getShellExecutionConfig();
      const executionConfig = options?.env
        ? {
            ...baseExecutionConfig,
            env: {
              ...(baseExecutionConfig.env ?? process.env),
              ...options.env,
            },
            sanitizationConfig: {
              ...baseExecutionConfig.sanitizationConfig,
              allowedEnvironmentVariables: [
                ...(baseExecutionConfig.sanitizationConfig
                  ?.allowedEnvironmentVariables ?? []),
                ...Object.keys(options.env),
              ],
            },
          }
        : baseExecutionConfig;

      const validationError = this.config.validatePathAccess(cwd);
      if (validationError) {
        throw new Error(validationError);
      }

      const handle = await ShellExecutionService.execute(
        command,
        cwd,
        () => {}, // No-op output event handler for now
        abortController.signal,
        false, // shouldUseNodePty: false for headless execution
        executionConfig,
      );

      const result = await handle.result;

      if (didTimeout) {
        return {
          output: result.output,
          stdout: result.output,
          stderr: '',
          exitCode: result.exitCode ?? 1,
          error: new Error(
            `Command timed out after ${options?.timeoutSeconds} seconds.`,
          ),
        };
      }

      return {
        output: result.output,
        stdout: result.output, // ShellExecutionService combines stdout/stderr usually
        stderr: '', // ShellExecutionService currently combines, so stderr is empty or mixed
        exitCode: result.exitCode,
      };
    } catch (error) {
      return {
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 1,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      callerSignalCleanUp?.();
    }
  }
}
