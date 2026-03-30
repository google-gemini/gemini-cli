/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateTopicTool } from './topicTool.js';
import { TopicState } from '../config/topicState.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import {
  UPDATE_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
} from './definitions/base-declarations.js';
import type { Config } from '../config/config.js';

describe('TopicState', () => {
  let state: TopicState;

  beforeEach(() => {
    state = new TopicState();
  });

  it('should store and retrieve topic title', () => {
    expect(state.getTopic()).toBeUndefined();
    const success = state.setTopic('Test Topic');
    expect(success).toBe(true);
    expect(state.getTopic()).toBe('Test Topic');
  });

  it('should sanitize newlines and carriage returns', () => {
    state.setTopic('Topic\nWith\r\nLines');
    expect(state.getTopic()).toBe('Topic With Lines');
  });

  it('should trim whitespace', () => {
    state.setTopic('  Spaced Topic   ');
    expect(state.getTopic()).toBe('Spaced Topic');
  });

  it('should reject empty or whitespace-only inputs', () => {
    expect(state.setTopic('')).toBe(false);
  });

  it('should reset topic', () => {
    state.setTopic('Test Topic');
    state.reset();
    expect(state.getTopic()).toBeUndefined();
  });
});

describe('UpdateTopicTool', () => {
  let tool: UpdateTopicTool;
  let mockMessageBus: MessageBus;
  let mockConfig: Config;

  beforeEach(() => {
    mockMessageBus = new MessageBus(vi.mocked({} as PolicyEngine));
    // Mock enough of Config to satisfy the tool
    mockConfig = {
      topicState: new TopicState(),
    } as unknown as Config;
    tool = new UpdateTopicTool(mockConfig, mockMessageBus);
  });

  it('should have correct name and display name', () => {
    expect(tool.name).toBe(UPDATE_TOPIC_TOOL_NAME);
    expect(tool.displayName).toBe('Update Topic Context');
  });

  it('should update TopicState on execute', async () => {
    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
      [TOPIC_PARAM_SUMMARY]: 'The goal is to implement X. Previously we did Y.',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Current topic: "New Chapter"');
    expect(result.llmContent).toContain(
      'Topic summary: The goal is to implement X. Previously we did Y.',
    );
    expect(mockConfig.topicState.getTopic()).toBe('New Chapter');
    expect(result.returnDisplay).toContain('## 📂 Topic: **New Chapter**');
    expect(result.returnDisplay).toContain('**Summary:**');
  });

  it('should render only topic title for same topic updates', async () => {
    mockConfig.topicState.setTopic('New Chapter');

    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.returnDisplay).toBe('## 📂 Topic: **New Chapter**');
    expect(result.llmContent).toBe('Current topic: "New Chapter"');
  });
});
