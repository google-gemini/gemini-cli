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
  TOPIC_PARAM_STRATEGIC_INTENT,
} from './definitions/base-declarations.js';
import type { Config } from '../config/config.js';

describe('TopicState', () => {
  let state: TopicState;

  beforeEach(() => {
    state = new TopicState();
  });

  it('should store and retrieve topic title and intent', () => {
    expect(state.getTopic()).toBeUndefined();
    expect(state.getIntent()).toBeUndefined();
    const success = state.setTopic('Test Topic', 'Test Intent');
    expect(success).toBe(true);
    expect(state.getTopic()).toBe('Test Topic');
    expect(state.getIntent()).toBe('Test Intent');
  });

  it('should sanitize newlines and carriage returns', () => {
    state.setTopic('Topic\nWith\r\nLines', 'Intent\nWith\r\nLines');
    expect(state.getTopic()).toBe('Topic With Lines');
    expect(state.getIntent()).toBe('Intent With Lines');
  });

  it('should trim whitespace', () => {
    state.setTopic('  Spaced Topic   ', '  Spaced Intent   ');
    expect(state.getTopic()).toBe('Spaced Topic');
    expect(state.getIntent()).toBe('Spaced Intent');
  });

  it('should reject empty or whitespace-only inputs', () => {
    expect(state.setTopic('', '')).toBe(false);
  });

  it('should reset topic and intent', () => {
    state.setTopic('Test Topic', 'Test Intent');
    state.reset();
    expect(state.getTopic()).toBeUndefined();
    expect(state.getIntent()).toBeUndefined();
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

  it('should update TopicState and include strategic intent on execute', async () => {
    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
      [TOPIC_PARAM_SUMMARY]: 'The goal is to implement X. Previously we did Y.',
      [TOPIC_PARAM_STRATEGIC_INTENT]: 'Initial Move',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Current topic: "New Chapter"');
    expect(result.llmContent).toContain(
      'Topic summary: The goal is to implement X. Previously we did Y.',
    );
    expect(result.llmContent).toContain('Strategic Intent: Initial Move');
    expect(mockConfig.topicState.getTopic()).toBe('New Chapter');
    expect(mockConfig.topicState.getIntent()).toBe('Initial Move');
    expect(result.returnDisplay).toContain('## 📂 Topic: **New Chapter**');
    expect(result.returnDisplay).toContain('**Summary:**');
    expect(result.returnDisplay).toContain(
      '> [!STRATEGY]\n> **Intent:** Initial Move',
    );
  });

  it('should render only intent for tactical updates (same topic)', async () => {
    mockConfig.topicState.setTopic('New Chapter');

    const invocation = tool.build({
      [TOPIC_PARAM_TITLE]: 'New Chapter',
      [TOPIC_PARAM_STRATEGIC_INTENT]: 'Subsequent Move',
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.returnDisplay).not.toContain('## 📂 Topic:');
    expect(result.returnDisplay).toBe(
      '> [!STRATEGY]\n> **Intent:** Subsequent Move',
    );
    expect(result.llmContent).toBe('Strategic Intent: Subsequent Move');
  });

  it('should return error if strategic_intent is missing', async () => {
    try {
      tool.build({
        [TOPIC_PARAM_TITLE]: 'Title',
      });
      expect.fail('Should have thrown validation error');
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e.message).toContain(
          "must have required property 'strategic_intent'",
        );
      } else {
        expect.fail('Expected Error instance');
      }
    }
    expect(mockConfig.topicState.getTopic()).toBeUndefined();
  });
});
