/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CREATE_NEW_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_PREVIOUS_SUMMARY,
  TOPIC_PARAM_CURRENT_SUMMARY,
} from './definitions/coreTools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getCreateNewTopicDeclaration } from './definitions/dynamic-declaration-helpers.js';
import type { Config } from '../config/config.js';

/**
 * Manages the current active topic title for a session.
 * Hosted within the Config instance for session-scoping.
 */
export class TopicState {
  private activeTopicTitle?: string;

  /**
   * Sanitizes and sets the topic title.
   * @returns true if the title was valid and set, false otherwise.
   */
  setTopic(title: string): boolean {
    if (!title) return false;

    // 1. Trim whitespace
    let sanitized = title.trim();

    // 2. Security: Strip newlines and carriage returns to prevent prompt injection/breakout
    sanitized = sanitized.replace(/[\r\n]+/g, ' ');

    // 3. Robustness check: Ensure it's not empty after sanitization
    if (sanitized.length === 0) {
      return false;
    }

    this.activeTopicTitle = sanitized;
    return true;
  }

  getTopic(): string | undefined {
    return this.activeTopicTitle;
  }

  reset(): void {
    this.activeTopicTitle = undefined;
  }
}

interface CreateNewTopicParams {
  [TOPIC_PARAM_TITLE]: string;
  [TOPIC_PARAM_PREVIOUS_SUMMARY]?: string;
  [TOPIC_PARAM_CURRENT_SUMMARY]: string;
}

class CreateNewTopicInvocation extends BaseToolInvocation<
  CreateNewTopicParams,
  ToolResult
> {
  constructor(
    params: CreateNewTopicParams,
    messageBus: MessageBus,
    toolName: string,
    private readonly config: Config,
  ) {
    super(params, messageBus, toolName);
  }

  getDescription(): string {
    const title = this.params[TOPIC_PARAM_TITLE];
    return `Create new topic: "${title}"`;
  }

  async execute(): Promise<ToolResult> {
    const title = this.params[TOPIC_PARAM_TITLE];
    const previousSummary = this.params[TOPIC_PARAM_PREVIOUS_SUMMARY];
    const currentSummary = this.params[TOPIC_PARAM_CURRENT_SUMMARY];

    const success = this.config.topicState.setTopic(title);

    if (!success) {
      return {
        llmContent: 'Error: A valid, non-empty topic title is required.',
        returnDisplay: 'Error: A valid, non-empty topic title is required.',
        error: {
          message: 'A valid topic title is required.',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const setTopic = this.config.topicState.getTopic()!;
    debugLogger.log(`[TopicTool] Changing topic to: "${setTopic}"`);

    let llmContent = `Current topic: "${setTopic}"\nTopic goal: ${currentSummary}`;
    let returnDisplay = `Current topic: **${setTopic}**\n\n**Topic Goal:**\n${currentSummary}`;

    if (previousSummary) {
      llmContent =
        `Previous topic summary: ${previousSummary}\n\n` + llmContent;
      returnDisplay =
        `**Previous Topic Summary:**\n${previousSummary}\n\n---\n\n` +
        returnDisplay;
    }

    return {
      llmContent,
      returnDisplay,
    };
  }
}

/**
 * Tool to create a new semantic topic (chapter) for UI grouping.
 */
export class CreateNewTopicTool extends BaseDeclarativeTool<
  CreateNewTopicParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const declaration = getCreateNewTopicDeclaration();
    super(
      CREATE_NEW_TOPIC_TOOL_NAME,
      'Create New Topic',
      declaration.description ?? '',
      Kind.Think,
      declaration.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: CreateNewTopicParams,
    messageBus: MessageBus,
  ): CreateNewTopicInvocation {
    return new CreateNewTopicInvocation(
      params,
      messageBus,
      this.name,
      this.config,
    );
  }
}
