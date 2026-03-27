/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_STEP_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_STEP_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import {
  getSession,
  formatStackFrame,
  setLastStopReason,
  errorResult,
} from './session-manager.js';

interface StepParams {
  action: 'continue' | 'next' | 'stepIn' | 'stepOut';
  threadId?: number;
}

class DebugStepInvocation extends BaseToolInvocation<StepParams, ToolResult> {
  getDescription(): string {
    return `Debug: ${this.params.action}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const threadId = this.params.threadId ?? 1;

      // Wait for the program to stop again after stepping
      const stoppedPromise = new Promise<Record<string, unknown>>((resolve) => {
        session.once('stopped', resolve);
      });

      switch (this.params.action) {
        case 'continue':
          await session.continue(threadId);
          break;
        case 'next':
          await session.next(threadId);
          break;
        case 'stepIn':
          await session.stepIn(threadId);
          break;
        case 'stepOut':
          await session.stepOut(threadId);
          break;
        default:
          return errorResult(
            `Unknown step action: ${String(this.params.action)}`,
          );
      }

      // Wait for stopped event (with timeout)
      const stopResult = await Promise.race([
        stoppedPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      if (stopResult === null) {
        return {
          llmContent: `Executed '${this.params.action}'. Program is running (did not stop within 5s). Use debug_step with action 'continue' to wait for the next breakpoint, or debug_disconnect to end the session.`,
          returnDisplay: `${this.params.action}: running.`,
        };
      }

      // Get current position
      const frames = await session.stackTrace(threadId, 0, 1);
      const location =
        frames.length > 0 ? formatStackFrame(frames[0], 0) : 'Unknown location';

      const reason =
        'reason' in stopResult && String(stopResult['reason'])
          ? String(stopResult['reason'])
          : 'unknown';

      // Update lastStopReason so the intelligence layer can use it
      setLastStopReason(reason);

      return {
        llmContent: `Executed '${this.params.action}'. Stopped: ${reason}\nLocation: ${location}\nUse debug_get_stacktrace to see full analysis with fix suggestions, or debug_step to continue.`,
        returnDisplay: `${this.params.action}: stopped (${reason}).`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugStepTool extends BaseDeclarativeTool<StepParams, ToolResult> {
  static readonly Name = DEBUG_STEP_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugStepTool.Name,
      'Debug Step',
      DEBUG_STEP_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_STEP_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(params: StepParams, messageBus: MessageBus) {
    return new DebugStepInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_STEP_DEFINITION, modelId);
  }
}
