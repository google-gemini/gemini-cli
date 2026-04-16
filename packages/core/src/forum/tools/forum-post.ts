/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ExecuteOptions,
  type ToolCallConfirmationDetails,
  type ToolResult,
} from '../../tools/tools.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';

export const FORUM_POST_TOOL_NAME = 'forum_post';
export const FORUM_POST_DISPLAY_NAME = 'Forum Post';

export class ForumPostTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      FORUM_POST_TOOL_NAME,
      FORUM_POST_DISPLAY_NAME,
      'Post your current round findings to the shared forum so the other members can read them in the next round.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description:
              'Your public post for the forum. Keep it focused on your findings, disagreements, and recommendations.',
          },
          readyToConclude: {
            type: 'boolean',
            description:
              'Set to true when you believe the discussion is ready for final synthesis.',
          },
        },
        required: ['message'],
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: Record<string, unknown>,
  ): string | null {
    const message = params['message'];
    if (typeof message !== 'string' || message.trim() === '') {
      return 'Missing required "message" argument. You must provide a forum post.';
    }
    const readyToConclude = params['readyToConclude'];
    if (readyToConclude !== undefined && typeof readyToConclude !== 'boolean') {
      return '"readyToConclude" must be a boolean when provided.';
    }
    return null;
  }

  protected createInvocation(
    params: Record<string, unknown>,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): ForumPostInvocation {
    return new ForumPostInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}

class ForumPostInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  getDescription(): string {
    return 'Posting findings to the forum.';
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  async execute({ abortSignal: _signal }: ExecuteOptions): Promise<ToolResult> {
    const message = String(this.params['message']).trim();
    const readyToConclude = this.params['readyToConclude'] === true;

    return {
      llmContent: 'Forum post submitted.',
      returnDisplay: 'Forum post submitted.',
      data: {
        pauseAgent: true,
        forumPost: message,
        readyToConclude,
      },
    };
  }
}
