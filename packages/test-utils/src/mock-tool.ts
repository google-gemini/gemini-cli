/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from '@google/gemini-cli-core';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from '@google/gemini-cli-core';

type MockToolOptions = {
  name: string;
  displayName?: string;
  description?: string;
  canUpdateOutput?: boolean;
  isOutputMarkdown?: boolean;
  shouldConfirmExecute?: (
    ...args: unknown[]
  ) => Promise<ToolCallConfirmationDetails | false>;
  execute?: (...args: unknown[]) => Promise<ToolResult>;
  params?: object;
};

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

  execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    terminalColumns?: number,
    terminalRows?: number,
  ): Promise<ToolResult> {
    return this.tool.execute(
      this.params,
      signal,
      updateOutput,
      terminalColumns,
      terminalRows,
    );
  }

  override shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return this.tool.shouldConfirmExecute(this.params, abortSignal);
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
  execute: (...args: unknown[]) => Promise<ToolResult>;
  shouldConfirmExecute: (
    ...args: unknown[]
  ) => Promise<ToolCallConfirmationDetails | false>;

  constructor(options: MockToolOptions) {
    super(
      options.name,
      options.displayName ?? options.name,
      options.description ?? options.name,
      Kind.Other,
      options.params,
      options.isOutputMarkdown ?? false,
      options.canUpdateOutput ?? false,
    );

    if (options.shouldConfirmExecute) {
      this.shouldConfirmExecute = options.shouldConfirmExecute;
    } else {
      this.shouldConfirmExecute = vi.fn().mockResolvedValue(false);
    }

    if (options.execute) {
      this.execute = options.execute;
    } else {
      this.execute = vi.fn();
    }
  }

  protected createInvocation(params: {
    [key: string]: unknown;
  }): ToolInvocation<{ [key: string]: unknown }, ToolResult> {
    return new MockToolInvocation(this, params);
  }
}
