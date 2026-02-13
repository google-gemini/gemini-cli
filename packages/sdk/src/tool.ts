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

export { z };

export interface ToolDefinition<T extends z.ZodType> {
  name: string;
  description: string;
  inputSchema: T;
}

export interface Tool<T extends z.ZodType> extends ToolDefinition<T> {
  action: (params: z.infer<T>) => Promise<unknown>;
}

class SdkToolInvocation<T extends z.ZodType> extends BaseToolInvocation<
  z.infer<T>,
  ToolResult
> {
  constructor(
    params: z.infer<T>,
    messageBus: MessageBus,
    private readonly action: (params: z.infer<T>) => Promise<unknown>,
    toolName: string,
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
      const result = await this.action(this.params);
      const output =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return {
        llmContent: output,
        returnDisplay: output,
      };
    } catch (error) {
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
  }
}

export class SdkTool<T extends z.ZodType> extends BaseDeclarativeTool<
  z.infer<T>,
  ToolResult
> {
  constructor(
    private readonly definition: Tool<T>,
    messageBus: MessageBus,
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

  protected createInvocation(
    params: z.infer<T>,
    messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<z.infer<T>, ToolResult> {
    return new SdkToolInvocation(
      params,
      messageBus,
      this.definition.action,
      toolName || this.name,
    );
  }
}

export function tool<T extends z.ZodType>(
  definition: ToolDefinition<T>,
  action: (params: z.infer<T>) => Promise<unknown>,
): Tool<T> {
  return {
    ...definition,
    action,
  };
}
