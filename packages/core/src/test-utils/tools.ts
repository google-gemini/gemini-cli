/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolResult,
  Kind,
} from '../tools/tools.js';
import { Schema, Type } from '@google/genai';

/**
 * A highly configurable mock tool for testing purposes.
 */
export class MockTool extends BaseTool<{ [key: string]: unknown }, ToolResult> {
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

  async execute(
    params: { [key: string]: unknown },
    _abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const result = this.executeFn(params);
    return (
      result ?? {
        llmContent: `Tool ${this.name} executed successfully.`,
        returnDisplay: `Tool ${this.name} executed successfully.`,
      }
    );
  }

  override async shouldConfirmExecute(
    _params: { [key: string]: unknown },
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'exec' as const,
        title: `Confirm ${this.displayName}`,
        command: this.name,
        rootCommand: this.name,
        onConfirm: async () => {},
      };
    }
    return false;
  }
}
