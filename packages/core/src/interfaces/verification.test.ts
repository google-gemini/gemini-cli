/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Agent, AgentEvent, AgentRunOptions } from './agent.js';
import type { Model, ModelEvent, ModelGenerationOptions } from './model.js';
import type { GenerateContentResponse, PartListUnion } from '@google/genai';

// --- Mock Implementations ---

class MockModel implements Model {
  async generate(
    _input: PartListUnion,
    _options?: ModelGenerationOptions,
  ): Promise<GenerateContentResponse> {
    return {
      candidates: [{ content: { parts: [{ text: 'Mock response' }] } }],
    } as GenerateContentResponse;
  }

  async *generateStream(
    _input: PartListUnion,
    _options?: ModelGenerationOptions,
  ): AsyncGenerator<ModelEvent, void, void> {
    yield { type: 'thought', content: 'Thinking...' };
    yield {
      type: 'chunk',
      content: {
        candidates: [{ content: { parts: [{ text: 'Mock' }] } }],
      } as GenerateContentResponse,
    };
    yield {
      type: 'chunk',
      content: {
        candidates: [{ content: { parts: [{ text: ' Response' }] } }],
      } as GenerateContentResponse,
    };
    yield { type: 'finished', reason: 'mock_finish' };
  }
}

class MockAgent implements Agent<string, string> {
  name = 'MockAgent';
  description = 'A test agent';

  constructor(private model: Model) {}

  async *runAsync(
    input: string,
    _options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, string> {
    const stream = this.model.generateStream(input);
    for await (const event of stream) {
      if (event.type === 'thought') {
        yield { type: 'thought', content: event.content };
      } else if (event.type === 'chunk') {
        const text =
          event.content.candidates?.[0]?.content?.parts?.[0]?.text || '';
        yield { type: 'content', content: text };
      }
    }

    yield {
      type: 'tool_call',
      call: {
        callId: '1',
        name: 'test_tool',
        args: {},
        prompt_id: 'test',
        isClientInitiated: false,
      },
    };

    yield {
      type: 'tool_result',
      result: {
        callId: '1',
        responseParts: [{ text: 'Tool Result' }],
        error: undefined,
        errorType: undefined,
        resultDisplay: undefined,
      },
    };

    return 'Final Result';
  }

  async *runEphemeral(
    input: string,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, string> {
    return yield* this.runAsync(input, options);
  }
}

// --- Verification Tests ---

describe('Interface Verification', () => {
  it('should allow implementing a Model', async () => {
    const model = new MockModel();
    const result = await model.generate('test');
    expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'Mock response',
    );
  });

  it('should allow implementing an Agent that uses a Model', async () => {
    const model = new MockModel();
    const agent = new MockAgent(model);
    const events: AgentEvent[] = [];

    const iterator = agent.runAsync('start');
    let result = await iterator.next();

    while (!result.done) {
      events.push(result.value);
      result = await iterator.next();
    }

    const finalOutput = result.value;

    expect(finalOutput).toBe('Final Result');
    expect(events).toHaveLength(5);
    expect(events[0]).toEqual({ type: 'thought', content: 'Thinking...' });
    expect(events[1]).toEqual({ type: 'content', content: 'Mock' });
    expect(events[2]).toEqual({ type: 'content', content: ' Response' });
    expect(events[3].type).toBe('tool_call');
    expect(events[4].type).toBe('tool_result');
  });

  it('should handle async iteration correctly', async () => {
    const agent = new MockAgent(new MockModel());
    const events: AgentEvent[] = [];

    for await (const event of agent.runAsync('test')) {
      events.push(event);
    }

    expect(events.length).toBe(5);
  });

  it('should allow ephemeral runs', async () => {
    const agent = new MockAgent(new MockModel());
    const events: AgentEvent[] = [];

    for await (const event of agent.runEphemeral('test')) {
      events.push(event);
    }

    expect(events.length).toBe(5);
  });
});
