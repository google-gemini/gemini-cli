/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_EVALUATE_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_EVALUATE_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { getSession, errorResult } from './session-manager.js';

interface EvaluateParams {
  expression: string;
  frameIndex?: number;
  threadId?: number;
}

class DebugEvaluateInvocation extends BaseToolInvocation<
  EvaluateParams,
  ToolResult
> {
  getDescription(): string {
    return `Evaluating: ${this.params.expression}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const threadId = this.params.threadId ?? 1;
      const frameIndex = this.params.frameIndex ?? 0;

      // Resolve frameId from frame index
      const frames = await session.stackTrace(threadId, 0, frameIndex + 1);
      const frameId =
        frames.length > frameIndex ? frames[frameIndex].id : undefined;

      const result = await session.evaluate(
        this.params.expression,
        frameId,
        'repl',
      );

      const typeStr = result.type ? ` (${result.type})` : '';
      return {
        llmContent: `${this.params.expression}${typeStr} = ${result.result}`,
        returnDisplay: `Evaluated expression.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugEvaluateTool extends BaseDeclarativeTool<
  EvaluateParams,
  ToolResult
> {
  static readonly Name = DEBUG_EVALUATE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugEvaluateTool.Name,
      'Debug Evaluate',
      DEBUG_EVALUATE_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_EVALUATE_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(params: EvaluateParams, messageBus: MessageBus) {
    return new DebugEvaluateInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_EVALUATE_DEFINITION, modelId);
  }
}
