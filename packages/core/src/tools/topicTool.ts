/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CREATE_NEW_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
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

/**
 * Singleton to manage the current active topic title.
 */
export class TopicManager {
  private static instance: TopicManager;
  private activeTopicTitle?: string;

  private constructor() {}

  static getInstance(): TopicManager {
    if (!TopicManager.instance) {
      TopicManager.instance = new TopicManager();
    }
    return TopicManager.instance;
  }

  setTopic(title: string): void {
    this.activeTopicTitle = title;
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
}

class CreateNewTopicInvocation extends BaseToolInvocation<
  CreateNewTopicParams,
  ToolResult
> {
  getDescription(): string {
    return `Create new topic: "${this.params[TOPIC_PARAM_TITLE]}"`;
  }

  async execute(): Promise<ToolResult> {
    const title = this.params[TOPIC_PARAM_TITLE];

    if (!title) {
      return {
        llmContent: 'Error: A valid topic title is required.',
        returnDisplay: 'Error: A valid topic title is required.',
        error: {
          message: 'A valid topic title is required.',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    debugLogger.log(`[TopicTool] Changing topic to: "${title.trim()}"`);
    TopicManager.getInstance().setTopic(title.trim());

    return {
      llmContent: `Topic changed to: "${title.trim()}"`,
      returnDisplay: `Topic changed to: **${title.trim()}**`,
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
  constructor(messageBus: MessageBus) {
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
    return new CreateNewTopicInvocation(params, messageBus, this.name);
  }
}
