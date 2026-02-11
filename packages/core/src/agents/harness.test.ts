/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AgentHarness } from './harness.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { GeminiChat, StreamEventType } from '../core/geminiChat.js';
import { GeminiEventType, type ServerGeminiStreamEvent } from '../core/turn.js';
import { z } from 'zod';
import { type LocalAgentDefinition, AgentTerminateMode } from './types.js';
import { scheduleAgentTools } from './agent-scheduler.js';
import { logAgentFinish } from '../telemetry/loggers.js';
import { type Config } from '../config/config.js';

vi.mock('../telemetry/loggers.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../telemetry/loggers.js')>();
  return {
    ...actual,
    logAgentStart: vi.fn(),
    logAgentFinish: vi.fn(),
  };
});

vi.mock('../core/geminiChat.js', () => ({
  GeminiChat: vi.fn(),
  StreamEventType: {
    CHUNK: 'chunk',
  },
}));

vi.mock('./agent-scheduler.js', () => ({
  scheduleAgentTools: vi.fn(),
}));

describe('AgentHarness', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig();
    mockConfig.getToolRegistry = vi.fn().mockReturnValue({
      getTool: vi.fn(),
      getAllToolNames: vi.fn().mockReturnValue([]),
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
    });
    vi.clearAllMocks();
  });

  it('executes a subagent and finishes when complete_task is called', async () => {
    const definition: LocalAgentDefinition<z.ZodString> = {
      kind: 'local',
      name: 'test-agent',
      displayName: 'Test Agent',
      description: 'A test agent',
      inputConfig: {
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      modelConfig: {
        model: 'gemini-test-model',
      },
      runConfig: { maxTurns: 5, maxTimeMinutes: 5 },
      promptConfig: { systemPrompt: 'You are a test agent.' },
      outputConfig: {
        outputName: 'result',
        description: 'The final result.',
        schema: z.string(),
      },
    };

    const harness = new AgentHarness({
      config: mockConfig,
       
      definition: definition as unknown as AgentDefinition,
      inputs: {},
    });

    const mockChat = {
      sendMessageStream: vi.fn(),
      setTools: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
      addHistory: vi.fn(),
      setSystemInstruction: vi.fn(),
      maybeIncludeSchemaDepthContext: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(0),
    } as unknown as GeminiChat;
    (GeminiChat as unknown as Mock).mockReturnValue(mockChat);

    // Mock model response with complete_task call
    (mockChat.sendMessageStream as Mock).mockResolvedValue(
      (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              { content: { parts: [{ text: 'Done!' }] }, finishReason: 'STOP' },
            ],
            functionCalls: [
              {
                name: 'complete_task',
                args: { result: 'Success' },
                id: 'call_1',
              },
            ],
          },
        };
      })(),
    );

    // Mock tool execution
    (scheduleAgentTools as unknown as Mock).mockResolvedValue([
      {
        request: {
          name: 'complete_task',
          args: { result: 'Success' },
          callId: 'call_1',
        },
        status: 'success',
        response: {
          responseParts: [
            {
              functionResponse: {
                name: 'complete_task',
                response: { status: 'OK' },
                id: 'call_1',
              },
            },
          ],
        },
      },
    ]);

    const events: ServerGeminiStreamEvent[] = [];
    const run = harness.run([{ text: 'Start' }], new AbortController().signal);

    while (true) {
      const { value, done } = await run.next();
      if (done) break;
      events.push(value);
    }

    expect(
      events.some(
        (e) =>
          e.type === GeminiEventType.ToolCallRequest &&
          e.value.name === 'complete_task',
      ),
    ).toBe(true);
    expect(mockChat.sendMessageStream).toHaveBeenCalled();

    expect(vi.mocked(logAgentFinish)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        terminate_reason: AgentTerminateMode.GOAL,
      }),
    );
  });
});
