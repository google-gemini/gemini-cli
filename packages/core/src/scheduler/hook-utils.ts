/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { AnyDeclarativeTool, AnyToolInvocation } from '../tools/tools.js';
import type { ToolCallRequestInfo } from './types.js';
import { extractMcpContext } from '../core/coreToolHookTriggers.js';
import { BeforeToolHookOutput } from '../hooks/types.js';
import { ToolErrorType } from '../tools/tool-error.js';

export type HookEvaluationResult =
  | {
      status: 'continue';
      hookDecision?: 'ask' | 'block';
      hookSystemMessage?: string;
      modifiedArgs?: Record<string, unknown>;
      newInvocation?: AnyToolInvocation;
    }
  | {
      status: 'error';
      error: Error;
      errorType: ToolErrorType;
    };

export async function evaluateBeforeToolHook(
  config: Config,
  tool: AnyDeclarativeTool,
  request: ToolCallRequestInfo,
  invocation: AnyToolInvocation,
): Promise<HookEvaluationResult> {
  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return { status: 'continue' };
  }

  const params = invocation.params || {};
  const toolInput: Record<string, unknown> = { ...params };
  const mcpContext = extractMcpContext(invocation, config);

  const beforeOutput = await hookSystem.fireBeforeToolEvent(
    request.name,
    toolInput,
    mcpContext,
    request.originalRequestName,
  );

  if (!beforeOutput) {
    return { status: 'continue' };
  }

  if (beforeOutput.shouldStopExecution()) {
    return {
      status: 'error',
      error: new Error(
        `Agent execution stopped by hook: ${beforeOutput.getEffectiveReason()}`,
      ),
      errorType: ToolErrorType.STOP_EXECUTION,
    };
  }

  const blockingError = beforeOutput.getBlockingError();
  if (blockingError?.blocked) {
    return {
      status: 'error',
      error: new Error(`Tool execution blocked: ${blockingError.reason}`),
      errorType: ToolErrorType.POLICY_VIOLATION,
    };
  }

  let hookDecision: 'ask' | 'block' | undefined;
  let hookSystemMessage: string | undefined;

  if (beforeOutput.isAskDecision()) {
    hookDecision = 'ask';
    hookSystemMessage = beforeOutput.systemMessage;
  }

  let modifiedArgs: Record<string, unknown> | undefined;
  let newInvocation: AnyToolInvocation | undefined;

  if (beforeOutput instanceof BeforeToolHookOutput) {
    const modifiedInput = beforeOutput.getModifiedToolInput();
    if (modifiedInput) {
      modifiedArgs = modifiedInput;
      try {
        newInvocation = tool.build(modifiedInput);
      } catch (error) {
        return {
          status: 'error',
          error: new Error(
            `Tool parameter modification by hook failed validation: ${error instanceof Error ? error.message : String(error)}`,
          ),
          errorType: ToolErrorType.INVALID_TOOL_PARAMS,
        };
      }
    }
  }

  return {
    status: 'continue',
    hookDecision,
    hookSystemMessage,
    modifiedArgs,
    newInvocation,
  };
}
