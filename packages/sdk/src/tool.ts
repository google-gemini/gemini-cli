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
  Kind,
  type MessageBus,
} from '@google/gemini-cli-core';
import type { SessionContext } from './types.js';

export { z };

export class ModelVisibleError extends Error {
  constructor(message: string | Error) {
    super(message instanceof Error ? message.message : message);
    this.name = 'ModelVisibleError';
  }
}

export interface ToolDefinition<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
  sendErrorsToModel?: boolean;
}

export interface Tool<T extends z.ZodTypeAny> extends ToolDefinition<T> {
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

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
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

export function tool<T extends z.ZodTypeAny>(
  definition: ToolDefinition<T>,
  action: (params: z.infer<T>, context?: SessionContext) => Promise<unknown>,
): Tool<T> {
  return {
    ...definition,
    action,
  };
}
