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

interface UpdateTopicParams {
  [TOPIC_PARAM_TITLE]?: string;
  [TOPIC_PARAM_SUMMARY]?: string;
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
    if (title) {
      return `Update topic to: "${title}"`;
    }
    return 'Update Topic';
  }

  async execute(): Promise<ToolResult> {
    const title = this.params[TOPIC_PARAM_TITLE];
    const summary = this.params[TOPIC_PARAM_SUMMARY];

    const activeTopic = this.config.topicState.getTopic();
    const isNewTopic = !!(
      title &&
      title.trim() !== '' &&
      title.trim() !== activeTopic
    );

    this.config.topicState.setTopic(title);

    const currentTopic = this.config.topicState.getTopic() || '...';

    debugLogger.log(
      `[TopicTool] Update: Topic="${currentTopic}", isNew=${isNewTopic}`,
    );

    let llmContent = '';
    let returnDisplay = '';

    if (isNewTopic) {
      // Handle New Topic Header & Summary
      llmContent = `Current topic: "${currentTopic}"\nTopic summary: ${summary || '...'}`;
      returnDisplay = `## 📂 Topic: **${currentTopic}**\n\n**Summary:**\n${summary || '...'}`;
    } else {
      // Fallback display if not a new topic (though mandate suggests only for new topics)
      llmContent = `Current topic: "${currentTopic}"`;
      returnDisplay = `## 📂 Topic: **${currentTopic}**`;
    }

    return {
      llmContent,
      returnDisplay,
    };
  }
}

/**
 * Tool to update semantic topic context for UI grouping and model focus.
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
