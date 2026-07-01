/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UPDATE_TOPIC_TOOL_NAME,
  UPDATE_TOPIC_DISPLAY_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
  TOPIC_PARAM_STRATEGIC_INTENT,
} from './definitions/coreTools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getUpdateTopicDeclaration } from './definitions/dynamic-declaration-helpers.js';
import type { Config } from '../config/config.js';

interface UpdateTopicParams {
  [TOPIC_PARAM_TITLE]?: string;
  [TOPIC_PARAM_SUMMARY]?: string;
  [TOPIC_PARAM_STRATEGIC_INTENT]?: string;
}

class UpdateTopicInvocation extends BaseToolInvocation<
  UpdateTopicParams,
  ToolResult
> {
  /**
   * The session id this tool call was scheduled in. If the session is reset
   * (e.g. via /clear) before this call executes, applying the update would
   * write the previous session's topic into the fresh one. See issue #26402.
   */
  private readonly scheduledSessionId: string;

  constructor(
    params: UpdateTopicParams,
    messageBus: MessageBus,
    toolName: string,
    private readonly config: Config,
  ) {
    super(params, messageBus, toolName);
    this.scheduledSessionId = config.getSessionId();
  }

  getDescription(): string {
    const title = this.params[TOPIC_PARAM_TITLE];
    const intent = this.params[TOPIC_PARAM_STRATEGIC_INTENT];
    if (title) {
      return `Update topic to: "${title}"`;
    }
    return `Update tactical intent: "${intent || '...'}"`;
  }

  async execute(options: ExecuteOptions): Promise<ToolResult> {
    // Guard against orphaned/stale calls. If this call was cancelled, or the
    // session was reset (e.g. via /clear) after it was scheduled, do not touch
    // the shared topicState — otherwise the previous session's topic would be
    // re-injected into the new session's system prompt. See issue #26402.
    if (
      options.abortSignal?.aborted ||
      this.config.getSessionId() !== this.scheduledSessionId
    ) {
      const message =
        'Topic update skipped: the session was reset before it could be applied.';
      return { llmContent: message, returnDisplay: '' };
    }

    const title = this.params[TOPIC_PARAM_TITLE];
    const summary = this.params[TOPIC_PARAM_SUMMARY];
    const strategicIntent = this.params[TOPIC_PARAM_STRATEGIC_INTENT];

    const activeTopic = this.config.topicState.getTopic();
    const isNewTopic = !!(
      title &&
      title.trim() !== '' &&
      title.trim() !== activeTopic
    );

    this.config.topicState.setTopic(title, strategicIntent);

    const currentTopic = this.config.topicState.getTopic() || '...';
    const currentIntent =
      strategicIntent || this.config.topicState.getIntent() || '...';

    debugLogger.log(
      `[TopicTool] Update: Topic="${currentTopic}", Intent="${currentIntent}", isNew=${isNewTopic}`,
    );

    let llmContent = '';
    let returnDisplay = '';

    if (isNewTopic) {
      // Handle New Topic Header & Summary
      llmContent = `Current topic: "${currentTopic}"\nTopic summary: ${summary || '...'}`;
      returnDisplay = `## 📂 Topic: **${currentTopic}**\n\n**Summary:**\n${summary || '...'}`;

      if (strategicIntent && strategicIntent.trim()) {
        llmContent += `\n\nStrategic Intent: ${strategicIntent.trim()}`;
        returnDisplay += `\n\n> [!STRATEGY]\n> **Intent:** ${strategicIntent.trim()}`;
      }
    } else {
      // Tactical update only
      llmContent = `Strategic Intent: ${currentIntent}`;
      returnDisplay = `> [!STRATEGY]\n> **Intent:** ${currentIntent}`;
    }

    return {
      llmContent,
      display: {
        format: 'notice',
        name: title || UPDATE_TOPIC_DISPLAY_NAME,
        description: this.getDescription(),
      },
      returnDisplay,
    };
  }
}

/**
 * Tool to update semantic topic context and tactical intent for UI grouping and model focus.
 */
export class UpdateTopicTool extends BaseDeclarativeTool<
  UpdateTopicParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const declaration = getUpdateTopicDeclaration();
    super(
      UPDATE_TOPIC_TOOL_NAME,
      UPDATE_TOPIC_DISPLAY_NAME,
      declaration.description ?? '',
      Kind.Think,
      declaration.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: UpdateTopicParams,
    messageBus: MessageBus,
  ): UpdateTopicInvocation {
    return new UpdateTopicInvocation(
      params,
      messageBus,
      this.name,
      this.config,
    );
  }
}
