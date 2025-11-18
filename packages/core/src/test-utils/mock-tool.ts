/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from '../tools/modifiable-tool.js';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from '../tools/tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from '../tools/tools.js';

interface MockToolOptions {
  name: string;
  displayName?: string;
  description?: string;
  canUpdateOutput?: boolean;
  isOutputMarkdown?: boolean;
  shouldConfirmExecute?: (
    params: { [key: string]: unknown },
    signal: AbortSignal,
  ) => Promise<ToolCallConfirmationDetails | false>;
  execute?: (
    params: { [key: string]: unknown },
    signal?: AbortSignal,
    updateOutput?: (output: string) => void,
  ) => Promise<ToolResult>;
  params?: object;
}

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
  ): Promise<ToolResult> {
    if (updateOutput) {
      return this.tool.execute(this.params, signal, updateOutput);
    } else {
      return this.tool.execute(this.params);
    }
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
  shouldConfirmExecute: (
    params: { [key: string]: unknown },
    signal: AbortSignal,
  ) => Promise<ToolCallConfirmationDetails | false>;
  execute: (
    params: { [key: string]: unknown },
    signal?: AbortSignal,
    updateOutput?: (output: string) => void,
  ) => Promise<ToolResult>;

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
      this.shouldConfirmExecute = () => Promise.resolve(false);
    }

    if (options.execute) {
      this.execute = options.execute;
    } else {
      this.execute = () =>
        Promise.resolve({
          llmContent: `Tool ${this.name} executed successfully.`,
          returnDisplay: `Tool ${this.name} executed successfully.`,
        });
    }
  }

  protected createInvocation(params: {
    [key: string]: unknown;
  }): ToolInvocation<{ [key: string]: unknown }, ToolResult> {
    return new MockToolInvocation(this, params);
  }
}

export const MOCK_TOOL_SHOULD_CONFIRM_EXECUTE = () =>
  Promise.resolve({
    type: 'exec' as const,
    title: 'Confirm mockTool',
    command: 'mockTool',
    rootCommand: 'mockTool',
    onConfirm: async () => {},
  });

export class MockModifiableToolInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly tool: MockModifiableTool,
    params: Record<string, unknown>,
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
        type: 'edit',
        title: 'Confirm Mock Tool',
        fileName: 'test.txt',
        filePath: 'test.txt',
        fileDiff: 'diff',
        originalContent: 'originalContent',
        newContent: 'newContent',
        onConfirm: async () => {},
      };
    }
    return false;
  }

  getDescription(): string {
    return `A mock modifiable tool invocation for ${this.tool.name}`;
  }
}

/**
 * Configurable mock modifiable tool for testing.
 */
export class MockModifiableTool
  extends BaseDeclarativeTool<Record<string, unknown>, ToolResult>
  implements ModifiableDeclarativeTool<Record<string, unknown>>
{
  // Should be overrided in test file. Functionality will be updated in follow
  // up PR which has MockModifiableTool expect MockTool
  executeFn: (params: Record<string, unknown>) => ToolResult | undefined = () =>
    undefined;
  shouldConfirm = true;

  constructor(name = 'mockModifiableTool') {
    super(name, name, 'A mock modifiable tool for testing.', Kind.Other, {
      type: 'object',
      properties: { param: { type: 'string' } },
    });
  }

  getModifyContext(
    _abortSignal: AbortSignal,
  ): ModifyContext<Record<string, unknown>> {
    return {
      getFilePath: () => 'test.txt',
      getCurrentContent: async () => 'old content',
      getProposedContent: async () => 'new content',
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        _originalParams: Record<string, unknown>,
      ) => ({ newContent: modifiedProposedContent }),
    };
  }

  protected createInvocation(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new MockModifiableToolInvocation(this, params);
  }
}
