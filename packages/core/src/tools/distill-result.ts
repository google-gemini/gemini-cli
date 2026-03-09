/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolLiveOutput,
  type ToolResult,
} from './tools.js';
import { DISTILL_RESULT_TOOL_NAME } from './tool-names.js';
import { DISTILL_RESULT_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { debugLogger } from '../utils/debugLogger.js';
import { saveTruncatedToolOutput } from '../utils/fileUtils.js';

interface DistillResultParams {
  revised_text: string;
}

class DistillResultInvocation extends BaseToolInvocation<
  DistillResultParams,
  ToolResult
> {
  constructor(
    params: DistillResultParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private readonly config: Config,
    private readonly chat: GeminiChat,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  override getDescription(): string {
    return 'Distills the most recent tool output in the history.';
  }

  override async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: ToolLiveOutput) => void,
    _shellExecutionConfig?: any,
    ownCallId?: string,
  ): Promise<ToolResult> {
    if (!ownCallId) {
      throw new Error('Critical error: callId is required for distill result.');
    }
    const revisedText = this.params.revised_text;

    debugLogger.debug(
      `[PROJECT CLARITY] Executing DistillResultTool (ownCallId: ${ownCallId})`,
    );

    // 1. Find the target: the last function response in history.
    const history = this.chat.getHistory();
    let lastToolResponseIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].parts?.some((p) => p.functionResponse)) {
        lastToolResponseIndex = i;
        break;
      }
    }

    if (lastToolResponseIndex === -1) {
      throw new Error('No tool response found in history to distill.');
    }

    const lastToolResponse = history[lastToolResponseIndex];
    const functionResponsePart = lastToolResponse.parts?.find(
      (p) => p.functionResponse,
    );
    if (!functionResponsePart?.functionResponse) {
      throw new Error(
        'Critical error: Tool response missing functionResponse part.',
      );
    }

    const targetCallId = functionResponsePart.functionResponse.id;
    if (!targetCallId) {
      throw new Error('Target call ID missing from tool response.');
    }

    debugLogger.debug(
      `[PROJECT CLARITY] Distill target identified: ${targetCallId} at index ${lastToolResponseIndex}`,
    );

    const sideEffects = this.config.getSideEffectService();

    // 2. Elide all turns between that tool response and the current turn.
    sideEffects.elideBetween(targetCallId, ownCallId);
    sideEffects.elideCall(ownCallId);

    // 3. Save the raw output to a temp file for safety (to avoid "self-gaslighting")
    const toolName =
      functionResponsePart.functionResponse.name || 'unknown_tool';
    const originalResponse = JSON.stringify(
      functionResponsePart.functionResponse.response,
      null,
      2,
    );

    const { outputFile } = await saveTruncatedToolOutput(
      originalResponse,
      toolName,
      targetCallId,
      this.config.storage.getProjectTempDir(),
      this.config.getSessionId(),
    );

    // 4. Perform the rewrite (Add to distilledResults map via SideEffectService)
    const distilledResponse = {
      distilled: true,
      distilled_output: revisedText,
      original_output_file: outputFile,
    };

    sideEffects.distillResult(targetCallId, distilledResponse);

    return {
      llmContent: 'Result distilled successfully.',
      returnDisplay: '',
    };
  }
}

/**
 * A tool that allows the agent to surgically distill the most recent tool output in its history.
 * This is the ultimate weapon against "Head Entropy".
 */
export class DistillResultTool extends BaseDeclarativeTool<
  DistillResultParams,
  ToolResult
> {
  static readonly Name = DISTILL_RESULT_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DISTILL_RESULT_TOOL_NAME,
      'DistillResult',
      DISTILL_RESULT_DEFINITION.base.description ?? '',
      Kind.Think,
      DISTILL_RESULT_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  override createInvocation(
    params: DistillResultParams,
  ): ToolInvocation<DistillResultParams, ToolResult> {
    const chat = this.config.getGeminiClient().getChat();

    return new DistillResultInvocation(
      params,
      this.messageBus,
      this.name,
      this.displayName,
      this.config,
      chat,
    );
  }
}
