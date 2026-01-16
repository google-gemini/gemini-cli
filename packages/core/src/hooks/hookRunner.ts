/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import type { HookConfig } from './types.js';
import { HookEventName, ConfigSource } from './types.js';
import type { Config } from '../config/config.js';
import type {
  HookInput,
  HookOutput,
  HookExecutionResult,
  BeforeAgentInput,
  BeforeModelInput,
  BeforeModelOutput,
  BeforeToolInput,
} from './types.js';
import type { LLMRequest } from './hookTranslator.js';
import { debugLogger } from '../utils/debugLogger.js';
import { sanitizeEnvironment } from '../services/environmentSanitization.js';
import {
  escapeShellArg,
  getShellConfiguration,
  type ShellType,
} from '../utils/shell-utils.js';

/**
 * Default timeout for hook execution (60 seconds)
 */
const DEFAULT_HOOK_TIMEOUT = 60000;

/**
 * Exit code constants for hook execution
 */
const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_BLOCKING_ERROR = 2;
const EXIT_CODE_NON_BLOCKING_ERROR = 1;

/**
 * Hook runner that executes command hooks
 */
export class HookRunner {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Execute a single hook
   */
  async executeHook(
    hookConfig: HookConfig,
    eventName: HookEventName,
    input: HookInput,
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();

    // Secondary security check: Ensure project hooks are not executed in untrusted folders
    if (
      hookConfig.source === ConfigSource.Project &&
      !this.config.isTrustedFolder()
    ) {
      const errorMessage =
        'Security: Blocked execution of project hook in untrusted folder';
      debugLogger.warn(errorMessage);
      return {
        hookConfig,
        eventName,
        success: false,
        error: new Error(errorMessage),
        duration: 0,
      };
    }

    try {
      return await this.executeCommandHook(
        hookConfig,
        eventName,
        input,
        startTime,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const hookId = hookConfig.name || hookConfig.command || 'unknown';
      const errorMessage = `Hook execution failed for event '${eventName}' (hook: ${hookId}): ${error}`;
      debugLogger.warn(`Hook execution error (non-fatal): ${errorMessage}`);

      return {
        hookConfig,
        eventName,
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
        duration,
      };
    }
  }

  /**
   * Execute multiple hooks in parallel
   */
  async executeHooksParallel(
    hookConfigs: HookConfig[],
    eventName: HookEventName,
    input: HookInput,
    onHookStart?: (config: HookConfig, index: number) => void,
    onHookEnd?: (config: HookConfig, result: HookExecutionResult) => void,
  ): Promise<HookExecutionResult[]> {
    const promises = hookConfigs.map(async (config, index) => {
      onHookStart?.(config, index);
      const result = await this.executeHook(config, eventName, input);
      onHookEnd?.(config, result);
      return result;
    });

    return Promise.all(promises);
  }

  /**
   * Execute multiple hooks sequentially
   */
  async executeHooksSequential(
    hookConfigs: HookConfig[],
    eventName: HookEventName,
    input: HookInput,
    onHookStart?: (config: HookConfig, index: number) => void,
    onHookEnd?: (config: HookConfig, result: HookExecutionResult) => void,
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];
    let currentInput = input;

    for (let i = 0; i < hookConfigs.length; i++) {
      const config = hookConfigs[i];
      onHookStart?.(config, i);
      const result = await this.executeHook(config, eventName, currentInput);
      onHookEnd?.(config, result);
      results.push(result);

      // If the hook succeeded and has output, use it to modify the input for the next hook
      if (result.success && result.output) {
        currentInput = this.applyHookOutputToInput(
          currentInput,
          result.output,
          eventName,
        );
      }
    }

    return results;
  }

  /**
   * Apply hook output to modify input for the next hook in sequential execution
   */
  private applyHookOutputToInput(
    originalInput: HookInput,
    hookOutput: HookOutput,
    eventName: HookEventName,
  ): HookInput {
    // Create a copy of the original input
    const modifiedInput = { ...originalInput };

    // Apply modifications based on hook output and event type
    if (hookOutput.hookSpecificOutput) {
      switch (eventName) {
        case HookEventName.BeforeAgent:
          if ('additionalContext' in hookOutput.hookSpecificOutput) {
            // For BeforeAgent, we could modify the prompt with additional context
            const additionalContext =
              hookOutput.hookSpecificOutput['additionalContext'];
            if (
              typeof additionalContext === 'string' &&
              'prompt' in modifiedInput
            ) {
              (modifiedInput as BeforeAgentInput).prompt +=
                '\n\n' + additionalContext;
            }
          }
          break;

        case HookEventName.BeforeModel:
          if ('llm_request' in hookOutput.hookSpecificOutput) {
            // For BeforeModel, we update the LLM request
            const hookBeforeModelOutput = hookOutput as BeforeModelOutput;
            if (
              hookBeforeModelOutput.hookSpecificOutput?.llm_request &&
              'llm_request' in modifiedInput
            ) {
              // Merge the partial request with the existing request
              const currentRequest = (modifiedInput as BeforeModelInput)
                .llm_request;
              const partialRequest =
                hookBeforeModelOutput.hookSpecificOutput.llm_request;
              (modifiedInput as BeforeModelInput).llm_request = {
                ...currentRequest,
                ...partialRequest,
              } as LLMRequest;
            }
          }
          break;

        case HookEventName.BeforeTool:
          if ('tool_input' in hookOutput.hookSpecificOutput) {
            const newToolInput = hookOutput.hookSpecificOutput[
              'tool_input'
            ] as Record<string, unknown>;
            if (newToolInput && 'tool_input' in modifiedInput) {
              (modifiedInput as BeforeToolInput).tool_input = {
                ...(modifiedInput as BeforeToolInput).tool_input,
                ...newToolInput,
              };
            }
          }
          break;

        default:
          // For other events, no special input modification is needed
          break;
      }
    }

    return modifiedInput;
  }

  /**
   * Execute a command hook
   */
  private async executeCommandHook(
    hookConfig: HookConfig,
    eventName: HookEventName,
    input: HookInput,
    startTime: number,
  ): Promise<HookExecutionResult> {
    const timeout = hookConfig.timeout ?? DEFAULT_HOOK_TIMEOUT;

    return new Promise((resolve) => {
      if (!hookConfig.command) {
        const errorMessage = 'Command hook missing command';
        debugLogger.warn(
          `Hook configuration error (non-fatal): ${errorMessage}`,
        );
        resolve({
          hookConfig,
          eventName,
          success: false,
          error: new Error(errorMessage),
          duration: Date.now() - startTime,
        });
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const shellConfig = getShellConfiguration();
      const command = this.expandCommand(
        hookConfig.command,
        input,
        shellConfig.shell,
      );

      // Set up environment variables
      const env = {
        ...sanitizeEnvironment(process.env, this.config.sanitizationConfig),
        GEMINI_PROJECT_DIR: input.cwd,
        CLAUDE_PROJECT_DIR: input.cwd, // For compatibility
      };

      const child = spawn(
        shellConfig.executable,
        [...shellConfig.argsPrefix, command],
        {
          env,
          cwd: input.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        },
      );

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Send input to stdin
      if (child.stdin) {
        child.stdin.on('error', (err: NodeJS.ErrnoException) => {
          // Ignore EPIPE errors which happen when the child process closes stdin early
          if (err.code !== 'EPIPE') {
            debugLogger.debug(`Hook stdin error: ${err}`);
          }
        });

        // Wrap write operations in try-catch to handle synchronous EPIPE errors
        // that occur when the child process exits before we finish writing
        try {
          child.stdin.write(JSON.stringify(input));
          child.stdin.end();
        } catch (err) {
          // Ignore EPIPE errors which happen when the child process closes stdin early
          if (err instanceof Error && 'code' in err && err.code !== 'EPIPE') {
            debugLogger.debug(`Hook stdin write error: ${err}`);
          }
        }
      }

      // Collect stdout
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process exit
      child.on('close', (exitCode) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            hookConfig,
            eventName,
            success: false,
            error: new Error(`Hook timed out after ${timeout}ms`),
            stdout,
            stderr,
            duration,
          });
          return;
        }

        // Parse output
        let output: HookOutput | undefined;
        if (exitCode === EXIT_CODE_SUCCESS && stdout.trim()) {
          try {
            let parsed = JSON.parse(stdout.trim());
            if (typeof parsed === 'string') {
              // If the output is a string, parse it in case
              // it's double-encoded JSON string.
              parsed = JSON.parse(parsed);
            }
            if (parsed) {
              output = parsed as HookOutput;
            }
          } catch {
            // Not JSON, convert plain text to structured output
            output = this.convertPlainTextToHookOutput(stdout.trim(), exitCode);
          }
        } else if (exitCode !== EXIT_CODE_SUCCESS && stderr.trim()) {
          // Convert error output to structured format
          output = this.convertPlainTextToHookOutput(
            stderr.trim(),
            exitCode || EXIT_CODE_NON_BLOCKING_ERROR,
          );
        }

        resolve({
          hookConfig,
          eventName,
          success: exitCode === EXIT_CODE_SUCCESS,
          output,
          stdout,
          stderr,
          exitCode: exitCode || EXIT_CODE_SUCCESS,
          duration,
        });
      });

      // Handle process errors
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        resolve({
          hookConfig,
          eventName,
          success: false,
          error,
          stdout,
          stderr,
          duration,
        });
      });
    });
  }

  /**
   * Expand command with environment variables and input context
   */
  private expandCommand(
    command: string,
    input: HookInput,
    shellType: ShellType,
  ): string {
    debugLogger.debug(`Expanding hook command: ${command} (cwd: ${input.cwd})`);
    const escapedCwd = escapeShellArg(input.cwd, shellType);
    return command
      .replace(/\$GEMINI_PROJECT_DIR/g, () => escapedCwd)
      .replace(/\$CLAUDE_PROJECT_DIR/g, () => escapedCwd); // For compatibility
  }

  /**
   * Convert plain text output to structured HookOutput
   */
  private convertPlainTextToHookOutput(
    text: string,
    exitCode: number,
  ): HookOutput {
    if (exitCode === EXIT_CODE_SUCCESS) {
      // Success - treat as system message or additional context
      return {
        decision: 'allow',
        systemMessage: text,
      };
    } else if (exitCode === EXIT_CODE_BLOCKING_ERROR) {
      // Blocking error
      return {
        decision: 'deny',
        reason: text,
      };
    } else {
      // Non-blocking error (EXIT_CODE_NON_BLOCKING_ERROR or any other code)
      return {
        decision: 'allow',
        systemMessage: `Warning: ${text}`,
      };
    }
  }
}
