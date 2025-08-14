/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
  Kind,
} from '../tools/tools.js';
import { Schema, Type } from '@google/genai';

class MockToolInvocation extends BaseToolInvocation<
  { [key: string]: unknown },
  ToolResult
> {
  constructor(
    private readonly tool: MockTool,
    params: { [key: string]: unknown },
  ) {
    super(params);
  }

  async execute(_abortSignal: AbortSignal): Promise<ToolResult> {
    const result = this.tool.executeFn(this.params);
    return (
      result ?? {
        llmContent: `Tool ${this.tool.name} executed successfully.`,
        returnDisplay: `Tool ${this.tool.name} executed successfully.`,
      }
    );
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.tool.shouldConfirm) {
      return {
        type: 'exec' as const,
        title: `Confirm ${this.tool.displayName}`,
        command: this.tool.name,
        rootCommand: this.tool.name,
        onConfirm: async () => {},
      };
    }
    return false;
  }

  getDescription(): string {
    return `A mock tool invocation for ${this.tool.name}`;
  }
}

/**
 * A highly configurable mock tool for testing purposes.
 */
export class MockTool extends BaseDeclarativeTool<
  { [key: string]: unknown },
  ToolResult
> {
  executeFn = vi.fn();
  shouldConfirm = false;

  constructor(
    name = 'mock-tool',
    displayName?: string,
    description = 'A mock tool for testing.',
    params: Schema = {
      type: Type.OBJECT,
      properties: { param: { type: Type.STRING } },
    },
  ) {
    super(name, displayName ?? name, description, Kind.Other, params);
  }

  protected createInvocation(params: {
    [key: string]: unknown;
  }): ToolInvocation<{ [key: string]: unknown }, ToolResult> {
    return new MockToolInvocation(this, params);
  }
}
