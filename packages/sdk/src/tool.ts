/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolResult,
  type ToolInvocation,
  type ExecuteOptions,
  Kind,
  type MessageBus,
} from '@google/gemini-cli-core';
import type { SessionContext } from './types.js';

export { z };

/**
 * An error that, when thrown from a tool's action, will be visible to the
 * Gemini model in the conversation. Useful for providing feedback to the
 * model about why a tool failed so it can retry or adjust its approach.
 */
export class ModelVisibleError extends Error {
  constructor(message: string | Error) {
    super(message instanceof Error ? message.message : message);
    this.name = 'ModelVisibleError';
  }
}

/**
 * The declarative definition of a tool, including its name, description,
 * Zod input schema, and optional error-handling behavior.
 *
 * @typeParam T - The Zod schema type that validates the tool's input parameters.
 */
export interface ToolDefinition<T extends z.ZodTypeAny> {
  /**
   * A unique name for the tool, used by the model to invoke it.
   */
  name: string;

  /**
   * A human-readable description of what the tool does.
   * This is sent to the model to help it decide when to use the tool.
   */
  description: string;

  /**
   * A Zod schema that validates and type-checks the tool's input parameters.
   */
  inputSchema: T;

  /**
   * When `true`, any errors thrown by the tool's action will be sent back
   * to the model as part of the conversation. Defaults to `false`.
   */
  sendErrorsToModel?: boolean;
}

/**
 * A complete tool definition that combines a {@link ToolDefinition} with
 * an executable action function.
 *
 * The action receives validated parameters (inferred from the Zod schema)
 * and an optional {@link SessionContext}, and returns an arbitrary result
 * that will be serialized and sent back to the model.
 *
 * @typeParam T - The Zod schema type that validates the tool's input parameters.
 */
export interface Tool<T extends z.ZodTypeAny> extends ToolDefinition<T> {
  /**
   * The function executed when the model invokes this tool.
   *
   * @param params - The validated input parameters, typed from the Zod schema.
   * @param context - Optional session context providing access to filesystem,
   *   shell, and other session state.
   * @returns A promise resolving to the tool's output, which will be
   *   serialized (to JSON if not already a string) and sent to the model.
   */
  action: (params: z.infer<T>, context?: SessionContext) => Promise<unknown>;
}

class SdkToolInvocation<T extends z.ZodTypeAny> extends BaseToolInvocation<
  z.infer<T>,
  ToolResult
> {
  constructor(
    params: z.infer<T>,
    messageBus: MessageBus,
    private readonly action: (
      params: z.infer<T>,
      context?: SessionContext,
    ) => Promise<unknown>,
    private readonly context: SessionContext | undefined,
    toolName: string,
    private readonly sendErrorsToModel: boolean = false,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    return `Executing ${this._toolName}...`;
  }

  async execute({
    abortSignal: _abortSignal,
    updateOutput: _updateOutput,
  }: ExecuteOptions): Promise<ToolResult> {
    try {
      const result = await this.action(this.params, this.context);
      const output =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return {
        llmContent: output,
        returnDisplay: output,
      };
    } catch (error) {
      if (this.sendErrorsToModel || error instanceof ModelVisibleError) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          llmContent: `Error: ${errorMessage}`,
          returnDisplay: `Error: ${errorMessage}`,
          error: {
            message: errorMessage,
          },
        };
      }
      throw error;
    }
  }
}

/**
 * A wrapper that integrates an SDK {@link Tool} into the core tool registry.
 *
 * Handles parameter validation, execution, error handling (including
 * {@link ModelVisibleError}), and context binding for tool invocations.
 *
 * @typeParam T - The Zod schema type that validates the tool's input parameters.
 */
export class SdkTool<T extends z.ZodTypeAny> extends BaseDeclarativeTool<
  z.infer<T>,
  ToolResult
> {
  constructor(
    private readonly definition: Tool<T>,
    messageBus: MessageBus,
    _agent?: unknown,
    private readonly context?: SessionContext,
  ) {
    super(
      definition.name,
      definition.name,
      definition.description,
      Kind.Other,
      zodToJsonSchema(definition.inputSchema),
      messageBus,
    );
  }

  bindContext(context: SessionContext): SdkTool<T> {
    return new SdkTool(this.definition, this.messageBus, undefined, context);
  }

  createInvocationWithContext(
    params: z.infer<T>,
    messageBus: MessageBus,
    context: SessionContext | undefined,
    toolName?: string,
  ): ToolInvocation<z.infer<T>, ToolResult> {
    return new SdkToolInvocation(
      params,
      messageBus,
      this.definition.action,
      context || this.context,
      toolName || this.name,
      this.definition.sendErrorsToModel,
    );
  }

  protected createInvocation(
    params: z.infer<T>,
    messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<z.infer<T>, ToolResult> {
    return new SdkToolInvocation(
      params,
      messageBus,
      this.definition.action,
      this.context,
      toolName || this.name,
      this.definition.sendErrorsToModel,
    );
  }
}

/**
 * Helper function to create a {@link Tool} by combining a definition and an action.
 *
 * @typeParam T - The Zod schema type for the tool's input parameters.
 * @param definition - The tool's name, description, and input schema.
 * @param action - The async function to execute when the tool is invoked.
 * @returns A complete {@link Tool} object ready to be passed to
 *   {@link GeminiCliAgentOptions.tools}.
 *
 * @example
 * ```typescript
 * import { z, tool } from '@google/gemini-cli-sdk';
 *
 * const myTool = tool(
 *   {
 *     name: 'get_weather',
 *     description: 'Get the current weather for a location',
 *     inputSchema: z.object({ city: z.string() }),
 *   },
 *   async (params) => {
 *     return `Weather in ${params.city}: Sunny, 25°C`;
 *   },
 * );
 * ```
 */
export function tool<T extends z.ZodTypeAny>(
  definition: ToolDefinition<T>,
  action: (params: z.infer<T>, context?: SessionContext) => Promise<unknown>,
): Tool<T> {
  return {
    ...definition,
    action,
  };
}
