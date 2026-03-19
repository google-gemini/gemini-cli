/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TopicManager, CreateNewTopicTool } from './topicTool.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import {
  CREATE_NEW_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
} from './definitions/base-declarations.js';

describe('TopicManager', () => {
  beforeEach(() => {
    TopicManager.getInstance().reset();
  });

  it('should store and retrieve topic title', () => {
    const manager = TopicManager.getInstance();
    expect(manager.getTopic()).toBeUndefined();

    manager.setTopic('Test Topic');
    expect(manager.getTopic()).toBe('Test Topic');
  });

  it('should reset topic', () => {
    const manager = TopicManager.getInstance();
    manager.setTopic('Test Topic');
    manager.reset();
    expect(manager.getTopic()).toBeUndefined();
  });

  it('should be a singleton', () => {
    const manager1 = TopicManager.getInstance();
    const manager2 = TopicManager.getInstance();
    expect(manager1).toBe(manager2);
  });
});

describe('CreateNewTopicTool', () => {
  let tool: CreateNewTopicTool;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockMessageBus = new MessageBus(vi.mocked({} as PolicyEngine));
    tool = new CreateNewTopicTool(mockMessageBus);
    TopicManager.getInstance().reset();
  });

  it('should have correct name and display name', () => {
    expect(tool.name).toBe(CREATE_NEW_TOPIC_TOOL_NAME);
    expect(tool.displayName).toBe('Create New Topic');
  });

  it('should update TopicManager on execute', async () => {
    const invocation = tool.build({ [TOPIC_PARAM_TITLE]: 'New Chapter' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('New Chapter');
    expect(TopicManager.getInstance().getTopic()).toBe('New Chapter');
  });

  it('should return error if title is missing', async () => {
    const invocation = tool.build({ [TOPIC_PARAM_TITLE]: '' } as {
      [TOPIC_PARAM_TITLE]: string;
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(TopicManager.getInstance().getTopic()).toBeUndefined();
  });
});
