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
import { ToolErrorType } from './tool-error.js';
import { COMPRESS_TOOL_NAME } from './tool-names.js';
import { COMPRESS_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { CompressionStatus } from '../core/compression-status.js';
import type { ShellExecutionConfig } from 'src/services/shellExecutionService.js';
import { debugLogger } from '../utils/debugLogger.js';

class CompressInvocation extends BaseToolInvocation<
  Record<string, never>,
  ToolResult
> {
  constructor(
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private readonly config: Config,
    private readonly chat: GeminiChat,
    private readonly promptId: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  override getDescription(): string {
    return 'Manually triggers a context compression event.';
  }

  override async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: ToolLiveOutput) => void,
    _shellExecutionConfig?: ShellExecutionConfig,
    callId?: string,
  ): Promise<ToolResult> {
    if (!callId) {
      throw new Error(
        'Critical error: callId is required for context compression elision.',
      );
    }
    debugLogger.debug(
      `[PROJECT CLARITY] Executing CompressTool (callId: ${callId})`,
    );
    try {
      const continuityService = this.config.getContinuityCompressionService();
      const snapshot = await continuityService.generateSnapshot(
        this.chat.getHistory(),
        this.config.getModel(),
        this.promptId,
      );

      // Queue the history replacement via SideEffectService
      const sideEffects = this.config.getSideEffectService();
      sideEffects.replaceHistory([]);
      sideEffects.setContinuityAnchor(snapshot);
      sideEffects.elideCall(callId);

      return {
        llmContent: `Compression successful.`,
        returnDisplay: '',
        compressionInfo: {
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        },
      };
    } catch (error) {
      return {
        llmContent: `Compression failed: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `Context compression failed.`,
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * A tool that allows the agent to manually trigger a context compression event.
 */
export class CompressTool extends BaseDeclarativeTool<
  Record<string, never>,
  ToolResult
> {
  static readonly Name = COMPRESS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      COMPRESS_TOOL_NAME,
      'Compress',
      COMPRESS_DEFINITION.base.description ?? '',
      Kind.Think,
      COMPRESS_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  override createInvocation(
    params: Record<string, never>,
  ): ToolInvocation<Record<string, never>, ToolResult> {
    const chat = this.config.getGeminiClient().getChat();
    const promptId = this.config.getSessionId(); // Best guess for current promptId in this context

    return new CompressInvocation(
      params,
      this.messageBus,
      this.name,
      this.displayName,
      this.config,
      chat,
      promptId,
    );
  }
}
