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
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { COMPRESS_TOOL_NAME, COMPRESS_PARAM_FORCE } from './tool-names.js';
import { COMPRESS_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { CompressionStatus } from '../core/compression-status.js';

interface CompressParams {
  [COMPRESS_PARAM_FORCE]?: boolean;
}

class CompressInvocation extends BaseToolInvocation<
  CompressParams,
  ToolResult
> {
  constructor(
    params: CompressParams,
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

  override async execute(): Promise<ToolResult> {
    const force = this.params[COMPRESS_PARAM_FORCE] !== false;

    if (this.config.getContinuousSessionEnabled()) {
      const continuityService = await this.config.getContinuityCompressionService();
      const snapshot = await continuityService.generateSnapshot(
        this.chat.getHistory(),
        this.config.getModel(),
        this.promptId,
      );

      const newHistory = [
        {
          role: 'user',
          parts: [{ text: snapshot }],
        },
        {
          role: 'model',
          parts: [{ text: 'Got it. Thanks for the additional context!' }],
        },
      ];

      this.chat.setContinuityAnchor('');

      return {
        llmContent: `Compression completed. Status: 1`,
        returnDisplay: '',
        newHistory,
        compressionInfo: {
          originalTokenCount: 0,
          newTokenCount: 0,
          compressionStatus: CompressionStatus.COMPRESSED,
        },
      };
    }

    const { newHistory, info } = await this.config.getChatCompressionService().compress(
      this.chat,
      this.promptId,
      force,
      this.config.getModel(),
      this.config,
      false, // Manual compression
    );

    if (newHistory) {
      return {
        llmContent: `Compression completed. Status: ${info.compressionStatus}`,
        returnDisplay: '',
        newHistory,
        compressionInfo: info,
      };
    }

    return {
      llmContent: `Compression failed. Status: ${info.compressionStatus}`,
      returnDisplay: `Context compression failed: ${info.compressionStatus}`,
      error: {
        message: `Context compression failed: ${info.compressionStatus}`,
        type: ToolErrorType.EXECUTION_FAILED,
      },
    };
  }
}

/**
 * A tool that allows the agent to manually trigger a context compression event.
 */
export class CompressTool extends BaseDeclarativeTool<
  CompressParams,
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
    params: CompressParams,
  ): ToolInvocation<CompressParams, ToolResult> {
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
