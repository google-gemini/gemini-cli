/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';

interface FinishToolParams {
  summary: string;
}

export class FinishTool extends BaseDeclarativeTool<
  FinishToolParams,
  ToolResult
> {
  constructor() {
    super(
      'finish',
      'Finish',
      'Signals that the AI has finished its turn.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A summary of what was finished.',
          },
        },
        required: ['summary'],
      },
      false,
      false,
    );
  }

  protected createInvocation(
    params: FinishToolParams,
  ): ToolInvocation<FinishToolParams, ToolResult> {
    return new FinishToolInvocation(params);
  }
}

class FinishToolInvocation extends BaseToolInvocation<
  FinishToolParams,
  ToolResult
> {
  getDescription(): string {
    return `Finishing turn with summary: ${this.params.summary}`;
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: `Finished: ${this.params.summary}`,
      returnDisplay: `Finished: ${this.params.summary}`,
    };
  }
}
