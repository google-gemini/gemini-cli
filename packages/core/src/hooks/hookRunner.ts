/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import type { Logger } from '@opentelemetry/api-logs';
import type { HookConfig } from '../config/config.js';
import { HookEventName } from '../config/config.js';
import type {
  HookInput,
  HookOutput,
  HookExecutionResult,
  BeforeAgentInput,
  BeforeModelInput,
  BeforeModelOutput,
} from './types.js';
import type { LLMRequest } from './hookTranslator.js';
import type { PluginManager, PluginInstance } from './pluginManager.js';

/**
 * Default timeout for hook execution (60 seconds)
 */
const DEFAULT_HOOK_TIMEOUT = 60000;

/**
 * Hook runner that executes both command and plugin hooks
 */
export class HookRunner {
  private readonly pluginManager: PluginManager;

  constructor(logger: Logger, pluginManager: PluginManager) {
    this.pluginManager = pluginManager;
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

    try {
      if (hookConfig.type === 'command') {
        return await this.executeCommandHook(
          hookConfig,
          eventName,
          input,
          startTime,
        );
      } else if (hookConfig.type === 'plugin') {
        return await this.executePluginHook(
          hookConfig,
          eventName,
          input,
          startTime,
        );
      } else {
        const duration = Date.now() - startTime;
        const errorMessage = `Unknown hook type: ${hookConfig.type}`;
        console.error(errorMessage);

        return {
          hookConfig,
          eventName,
          success: false,
          error: Error(errorMessage),
          duration,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = `Hook execution failed: ${error}`;
      console.warn(`Hook execution error (non-fatal): ${errorMessage}`);

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
  ): Promise<HookExecutionResult[]> {
    const promises = hookConfigs.map((config) =>
      this.executeHook(config, eventName, input),
    );

    return await Promise.all(promises);
  }

  /**
   * Execute multiple hooks sequentially
   */
  async executeHooksSequential(
    hookConfigs: HookConfig[],
    eventName: HookEventName,
    input: HookInput,
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];
    let currentInput = input;

    for (const config of hookConfigs) {
      const result = await this.executeHook(config, eventName, currentInput);
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
        console.warn(`Hook configuration error (non-fatal): ${errorMessage}`);
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
      const command = this.expandCommand(hookConfig.command, input);

      // Set up environment variables
      const env = {
        ...process.env,
        GEMINI_PROJECT_DIR: input.cwd,
        CLAUDE_PROJECT_DIR: input.cwd, // For compatibility
      };

      // Parse command and arguments
      const [cmd, ...args] = this.parseCommand(command);

      const child = spawn(cmd, args, {
        env,
        cwd: input.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
        child.stdin.write(JSON.stringify(input));
        child.stdin.end();
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
        if (exitCode === 0 && stdout.trim()) {
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
        } else if (exitCode !== 0 && stderr.trim()) {
          // Convert error output to structured format
          output = this.convertPlainTextToHookOutput(
            stderr.trim(),
            exitCode || 1,
          );
        }

        resolve({
          hookConfig,
          eventName,
          success: exitCode === 0,
          output,
          stdout,
          stderr,
          exitCode: exitCode || 0,
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
   * Execute a plugin hook
   */
  private async executePluginHook(
    hookConfig: HookConfig,
    eventName: HookEventName,
    input: HookInput,
    startTime: number,
  ): Promise<HookExecutionResult> {
    if (!hookConfig.package || !hookConfig.method) {
      const message = hookConfig.method
        ? `Plugin hook missing package (Method = ${hookConfig.method})`
        : hookConfig.package
          ? `Plugin hook missing method (Package = ${hookConfig.package})`
          : 'Plugin hook missing package and method';
      console.warn(`Hook configuration error (non-fatal): ${message}`);
      return {
        hookConfig,
        eventName,
        success: false,
        error: new Error(message),
        duration: Date.now() - startTime,
      };
    }

    const timeout = hookConfig.timeout ?? DEFAULT_HOOK_TIMEOUT;

    // Ensure plugin is ready
    const pluginInstance =
      await this.pluginManager.ensurePluginReady(hookConfig);
    if (!pluginInstance) {
      const message = `Failed to load plugin: ${hookConfig.package}`;
      console.warn(`Hook plugin error (non-fatal): ${message}`);
      return {
        hookConfig,
        eventName,
        success: false,
        error: new Error(message),
        duration: Date.now() - startTime,
      };
    }

    // Get the hook method
    const hookMethod = this.getHookMethod(pluginInstance, hookConfig.method);
    if (!hookMethod) {
      const message = `Hook method ${hookConfig.method} not found in plugin ${hookConfig.package}`;
      console.warn(`Hook plugin error (non-fatal): ${message}`);
      return {
        hookConfig,
        eventName,
        success: false,
        error: new Error(message),
        duration: Date.now() - startTime,
      };
    }

    // Execute with timeout
    return await this.executeWithTimeout(
      hookConfig,
      eventName,
      () => hookMethod(input),
      startTime,
      timeout,
    );
  }

  /**
   * Get hook method from plugin instance
   */
  private getHookMethod(
    pluginInstance: PluginInstance,
    methodName: string,
  ): ((input: HookInput) => Promise<HookOutput>) | null {
    const hooks = pluginInstance.plugin.hooks;
    const method = (hooks as Record<string, unknown>)[methodName];

    if (typeof method === 'function') {
      return method as (input: HookInput) => Promise<HookOutput>;
    }

    return null;
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout(
    hookConfig: HookConfig,
    eventName: HookEventName,
    fn: () => Promise<HookOutput>,
    startTime: number,
    timeout: number,
  ): Promise<HookExecutionResult> {
    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        resolve({
          hookConfig,
          eventName,
          success: false,
          error: new Error(`Plugin hook timed out after ${timeout}ms`),
          duration: Date.now() - startTime,
        });
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutHandle);
          resolve({
            hookConfig,
            eventName,
            success: true,
            output: result,
            duration: Date.now() - startTime,
          });
        })
        .catch((error) => {
          clearTimeout(timeoutHandle);
          const errorMessage = `Plugin hook execution failed: ${error}`;
          console.warn(`Hook plugin error (non-fatal): ${errorMessage}`);
          resolve({
            hookConfig,
            eventName,
            success: false,
            error: error instanceof Error ? error : new Error(errorMessage),
            duration: Date.now() - startTime,
          });
        });
    });
  }

  /**
   * Expand command with environment variables and input context
   */
  private expandCommand(command: string, input: HookInput): string {
    return command
      .replace(/\$GEMINI_PROJECT_DIR/g, input.cwd)
      .replace(/\$CLAUDE_PROJECT_DIR/g, input.cwd); // For compatibility
  }

  /**
   * Convert plain text output to structured HookOutput
   */
  private convertPlainTextToHookOutput(
    text: string,
    exitCode: number,
  ): HookOutput {
    if (exitCode === 0) {
      // Success - treat as system message or additional context
      return {
        decision: 'allow',
        systemMessage: text,
      };
    } else if (exitCode === 2) {
      // Blocking error
      return {
        decision: 'deny',
        reason: text,
      };
    } else {
      // Non-blocking error
      return {
        decision: 'allow',
        systemMessage: `Warning: ${text}`,
      };
    }
  }

  /**
   * Parse command string into command and arguments
   */
  private parseCommand(command: string): string[] {
    // Simple command parsing - could be enhanced for complex cases
    const parts = command.trim().split(/\s+/);
    return parts.filter((part) => part.length > 0);
  }
}
