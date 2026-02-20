/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { HarnessSubagentInvocation } from './harness-invocation.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { AgentFactory } from './agent-factory.js';
import { type Turn } from '../core/turn.js';
import { type Config } from '../config/config.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import type { z } from 'zod';
import type { Part } from '@google/genai';
import { type LocalAgentDefinition } from './types.js';

vi.mock('../core/geminiChat.js', () => ({
  GeminiChat: vi.fn(),
}));

vi.mock('./agent-factory.js', () => ({
  AgentFactory: {
    createHarness: vi.fn(),
  },
}));

describe('HarnessSubagentInvocation', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let definition: LocalAgentDefinition<z.ZodUnknown>;

  beforeEach(() => {
    mockConfig = makeFakeConfig();
    mockMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as MessageBus;

    definition = {
      kind: 'local',
      name: 'test-agent',
      displayName: 'Test Agent',
      description: 'A test agent',
      inputConfig: {
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      modelConfig: { model: 'test-model' },
      runConfig: { maxTurns: 5 },
      promptConfig: { systemPrompt: 'Test' },
    };

    vi.clearAllMocks();
  });

  it('extracts result from complete_task tool call arguments', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn().mockReturnValue(
        (async function* () {
          // No intermediate events
          yield* [];
        })(),
      ),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'complete_task',
                args: { result: 'Extracted Finding' },
              },
            },
          ],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue(''), // Text is empty
      chat: mockChat,
    } as unknown as Turn;

    // Simulate the generator returning the final turn
    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Extracted Finding');
    expect((result.llmContent as Part[])?.[0]).toEqual({
      text: `Subagent 'test-agent' finished.
Termination Reason: goal
Result:
Extracted Finding`,
    });
    expect(result.returnDisplay).toContain('Extracted Finding');
  });

  it('prefers direct text response over complete_task arguments if available', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [{ text: 'Textual Result' }],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue('Textual Result'),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Textual Result');
    expect((result.llmContent as Part[])?.[0]).toEqual({
      text: `Subagent 'test-agent' finished.
Termination Reason: goal
Result:
Textual Result`,
    });
    expect(result.returnDisplay).toContain('Textual Result');
  });

  it('falls back to a default message if no result is found', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue(''),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Task completed.');
    expect(result.returnDisplay).toContain('Task completed.');
  });

  it('finds the LAST relevant model message if multiple exist', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [{ text: 'Old Result' }],
        },
        {
          role: 'user',
          parts: [{ text: 'Keep going' }],
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'complete_task',
                args: { result: 'Newest Result' },
              },
            },
          ],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue(''),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Newest Result');
    expect(result.returnDisplay).toContain('Newest Result');
  });

  it('handles model messages with only thoughts and no result-bearing parts', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { thought: true, text: 'Thinking about finishing...' } as any,
          ],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue(''),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Task completed.');
    expect(result.returnDisplay).toContain('Task completed.');
  });

  it('extracts result using the custom outputName from outputConfig', async () => {
    const customDefinition: LocalAgentDefinition = {
      ...definition,
      outputConfig: {
        outputName: 'report',
        description: 'A custom report',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: { type: 'string' } as any,
      },
    };

    const invocation = new HarnessSubagentInvocation(
      customDefinition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'complete_task',
                args: { report: 'The custom report content' },
              },
            },
          ],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue(''),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['report']).toBe('The custom report content');
    expect(result.returnDisplay).toContain('The custom report content');
  });

  it('prioritizes complete_task args over whitespace-only text', async () => {
    const invocation = new HarnessSubagentInvocation(
      definition,
      mockConfig,
      {},
      mockMessageBus,
    );

    const mockHarness = {
      run: vi.fn(),
    };
    (AgentFactory.createHarness as Mock).mockReturnValue(mockHarness);

    const mockChat = {
      getHistory: vi.fn().mockReturnValue([
        {
          role: 'model',
          parts: [
            { text: '   \n   ' },
            {
              functionCall: {
                name: 'complete_task',
                args: { result: 'Actual Result' },
              },
            },
          ],
        },
      ]),
    };

    const mockTurn = {
      getResponseText: vi.fn().mockReturnValue('   \n   '),
      chat: mockChat,
    } as unknown as Turn;

    mockHarness.run.mockReturnValue(
      (async function* () {
        yield* [];
        return mockTurn;
      })(),
    );

    const result = await invocation.execute(new AbortController().signal);

    expect(result.data?.['result']).toBe('Actual Result');
    expect(result.returnDisplay).toContain('Actual Result');
  });
});
