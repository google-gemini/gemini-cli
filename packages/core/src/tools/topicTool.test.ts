/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TopicState, CreateNewTopicTool } from './topicTool.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import {
  CREATE_NEW_TOPIC_TOOL_NAME,
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_PREVIOUS_SUMMARY,
  TOPIC_PARAM_CURRENT_SUMMARY,
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

  it('should reject empty or whitespace-only titles', () => {
    expect(state.setTopic('')).toBe(false);
    expect(state.setTopic('   ')).toBe(false);
    expect(state.setTopic('\n\n')).toBe(false);
  });

  it('should reset topic', () => {
    state.setTopic('Test Topic');
    state.reset();
    expect(state.getTopic()).toBeUndefined();
  });

  it('should be independent across instances', () => {
    const state1 = new TopicState();
    const state2 = new TopicState();
    state1.setTopic('Topic 1');
    state2.setTopic('Topic 2');
    expect(state1.getTopic()).toBe('Topic 1');
    expect(state2.getTopic()).toBe('Topic 2');
  });
});

describe('CreateNewTopicTool', () => {
  let tool: CreateNewTopicTool;
  let mockMessageBus: MessageBus;
  let mockConfig: Config;

  beforeEach(() => {
    mockMessageBus = new MessageBus(vi.mocked({} as PolicyEngine));
    // Mock enough of Config to satisfy the tool
    mockConfig = {
      topicState: new TopicState(),
    } as unknown as Config;
    tool = new CreateNewTopicTool(mockConfig, mockMessageBus);
  });

  it('should have correct name and display name', () => {
    expect(tool.name).toBe(CREATE_NEW_TOPIC_TOOL_NAME);
    expect(tool.displayName).toBe('Create New Topic');
  });

  it('should update TopicState and include current goal on execute', async () => {
    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
      [TOPIC_PARAM_CURRENT_SUMMARY]: 'The goal is to implement X',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Current topic: "New Chapter"');
    expect(result.llmContent).toContain(
      'Topic goal: The goal is to implement X',
    );
    expect(mockConfig.topicState.getTopic()).toBe('New Chapter');
  });

  it('should include previous summary if provided', async () => {
    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
      [TOPIC_PARAM_CURRENT_SUMMARY]: 'The goal is to implement X',
      [TOPIC_PARAM_PREVIOUS_SUMMARY]: 'Finished Y',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Previous topic summary: Finished Y');
    expect(result.llmContent).toContain('Current topic: "New Chapter"');
  });

  it('should return error if title is invalid after sanitization', async () => {
    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: '  \n  ',
      [TOPIC_PARAM_CURRENT_SUMMARY]: 'Goal',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(mockConfig.topicState.getTopic()).toBeUndefined();
  });
});
