/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_GET_STACKTRACE_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_GET_STACKTRACE_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Scope, Variable } from '../../debug/index.js';
import {
  getSession,
  stackTraceAnalyzer,
  fixSuggestionEngine,
  getLastStopReason,
  errorResult,
} from './session-manager.js';

interface GetStackTraceParams {
  threadId?: number;
  maxFrames?: number;
}

class DebugGetStackTraceInvocation extends BaseToolInvocation<
  GetStackTraceParams,
  ToolResult
> {
  getDescription(): string {
    return 'Getting call stack';
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const threadId = this.params.threadId ?? 1;
      const maxFrames = this.params.maxFrames ?? 20;

      const frames = await session.stackTrace(threadId, 0, maxFrames);

      if (frames.length === 0) {
        return {
          llmContent:
            'No stack frames available. The program may not be paused at a breakpoint.',
          returnDisplay: 'No stack frames.',
        };
      }

      // Gather scopes and variables for the top frame for intelligence analysis
      let scopes: Scope[] = [];
      const variableMap = new Map<number, Variable[]>();
      try {
        scopes = await session.scopes(frames[0].id);
        for (const scope of scopes) {
          if (scope.name.toLowerCase() !== 'global') {
            const vars = await session.variables(scope.variablesReference);
            variableMap.set(scope.variablesReference, vars);
          }
        }
      } catch {
        // Variables may not be available — continue with stack trace only
      }

      // Use intelligence layer for LLM-optimized output
      const analysis = stackTraceAnalyzer.analyze(
        getLastStopReason(),
        frames,
        scopes,
        variableMap,
        session.getRecentOutput(),
      );

      const result = fixSuggestionEngine.suggest(
        analysis,
        frames,
        scopes,
        variableMap,
        session.getRecentOutput(),
        getLastStopReason(),
      );

      return {
        llmContent: result.markdown,
        returnDisplay: `${String(frames.length)} stack frame(s) with analysis.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugGetStackTraceTool extends BaseDeclarativeTool<
  GetStackTraceParams,
  ToolResult
> {
  static readonly Name = DEBUG_GET_STACKTRACE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugGetStackTraceTool.Name,
      'Debug StackTrace',
      DEBUG_GET_STACKTRACE_DEFINITION.base.description!,
      Kind.Read,
      DEBUG_GET_STACKTRACE_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: GetStackTraceParams,
    messageBus: MessageBus,
  ) {
    return new DebugGetStackTraceInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_GET_STACKTRACE_DEFINITION, modelId);
  }
}
