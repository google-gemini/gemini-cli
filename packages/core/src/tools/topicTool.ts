/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UPDATE_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
  TOPIC_PARAM_STRATEGIC_INTENT,
} from './definitions/coreTools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getUpdateTopicDeclaration } from './definitions/dynamic-declaration-helpers.js';
import type { Config } from '../config/config.js';

/**
 * Manages the current active topic title and tactical intent for a session.
 * Hosted within the Config instance for session-scoping.
 */
export class TopicState {
  private activeTopicTitle?: string;
  private activeIntent?: string;

  /**
   * Sanitizes and sets the topic title and/or intent.
   * @returns true if the input was valid and set, false otherwise.
   */
  setTopic(title?: string, intent?: string): boolean {
    const sanitizedTitle = title?.trim().replace(/[\r\n]+/g, ' ');
    const sanitizedIntent = intent?.trim().replace(/[\r\n]+/g, ' ');

    if (!sanitizedTitle && !sanitizedIntent) return false;

    if (sanitizedTitle) {
      this.activeTopicTitle = sanitizedTitle;
    }

    if (sanitizedIntent) {
      this.activeIntent = sanitizedIntent;
    }

    return true;
  }

  getTopic(): string | undefined {
    return this.activeTopicTitle;
  }

  getIntent(): string | undefined {
    return this.activeIntent;
  }

  reset(): void {
    this.activeTopicTitle = undefined;
    this.activeIntent = undefined;
  }
}

interface UpdateTopicParams {
  [TOPIC_PARAM_TITLE]?: string;
  [TOPIC_PARAM_SUMMARY]?: string;
  [TOPIC_PARAM_STRATEGIC_INTENT]?: string;
}

class UpdateTopicInvocation extends BaseToolInvocation<
  UpdateTopicParams,
  ToolResult
> {
  constructor(
    params: UpdateTopicParams,
    messageBus: MessageBus,
    toolName: string,
    private readonly config: Config,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    const title = this.params[TOPIC_PARAM_TITLE];
    const intent = this.params[TOPIC_PARAM_STRATEGIC_INTENT];
    if (title) {
      return `Update topic to: "${title}"`;
    }
    return `Update tactical intent: "${intent || '...'}"`;
  }

  async execute(): Promise<ToolResult> {
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
      'Update Topic Context',
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
