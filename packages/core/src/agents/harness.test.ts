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
import { AgentTerminateMode, type LocalAgentDefinition } from './types.js';
import { scheduleAgentTools } from './agent-scheduler.js';
import { logAgentFinish } from '../telemetry/loggers.js';
import { type Config } from '../config/config.js';
import { MainAgentBehavior, SubagentBehavior } from './behavior.js';

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
      registerTool: vi.fn(),
      sortTools: vi.fn(),
    });
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue({
      getAllDefinitions: vi.fn().mockReturnValue([]),
    });
    mockConfig.getEnableHooks = vi.fn().mockReturnValue(false);
    mockConfig.getHookSystem = vi.fn().mockReturnValue(null);
    mockConfig.getIdeMode = vi.fn().mockReturnValue(false);
    mockConfig.getBaseLlmClient = vi.fn().mockReturnValue({});
    mockConfig.getModelRouterService = vi.fn().mockReturnValue({
      route: vi
        .fn()
        .mockResolvedValue({
          model: 'gemini-test-model',
          metadata: { source: 'test' },
        }),
    });

    vi.clearAllMocks();
  });

  describe('SubagentBehavior', () => {
    it('executes a subagent and finishes when complete_task is called', async () => {
      const definition: LocalAgentDefinition<z.ZodUnknown> = {
        kind: 'local',
        name: 'test-agent',
        displayName: 'Test Agent',
        description: 'A test agent',
        inputConfig: {
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        modelConfig: { model: 'gemini-test-model' },
        runConfig: { maxTurns: 5, maxTimeMinutes: 5 },
        promptConfig: { systemPrompt: 'You are a test agent.' },
        outputConfig: {
          outputName: 'result',
          description: 'The final result.',
          schema: z.unknown(),
        },
      };

      const behavior = new SubagentBehavior(mockConfig, definition);
      const harness = new AgentHarness({
        config: mockConfig,
        behavior,
        isolatedTools: true,
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
                {
                  content: { parts: [{ text: 'Done!' }] },
                  finishReason: 'STOP',
                },
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
      const run = harness.run(
        [{ text: 'Start' }],
        new AbortController().signal,
      );

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
      expect(vi.mocked(logAgentFinish)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ terminate_reason: AgentTerminateMode.GOAL }),
      );
    });
  });

  describe('MainAgentBehavior', () => {
    it('fires BeforeAgent hooks and handles blocking', async () => {
      const behavior = new MainAgentBehavior(mockConfig);
      const harness = new AgentHarness({ config: mockConfig, behavior });

      const mockHookSystem = {
        fireBeforeAgentEvent: vi.fn().mockResolvedValue({
          shouldStopExecution: () => true,
          isBlockingDecision: () => true,
          getEffectiveReason: () => 'Blocked by hook',
          systemMessage: 'Access denied',
          getAdditionalContext: () => undefined,
        }),
      };
      mockConfig.getHookSystem = vi.fn().mockReturnValue(mockHookSystem);
      mockConfig.getEnableHooks = vi.fn().mockReturnValue(true);

      const events: ServerGeminiStreamEvent[] = [];
      const run = harness.run(
        [{ text: 'Hello' }],
        new AbortController().signal,
      );

      while (true) {
        const { value, done } = await run.next();
        if (done) break;
        events.push(value);
      }

      expect(
        events.some(
          (e) =>
            e.type === GeminiEventType.Error &&
            e.value.error.message === 'Access denied',
        ),
      ).toBe(true);
      expect(vi.mocked(logAgentFinish)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          terminate_reason: AgentTerminateMode.ABORTED,
        }),
      );
    });

    it('syncs IDE context when IDE mode is enabled', async () => {
      const behavior = new MainAgentBehavior(mockConfig);
      const harness = new AgentHarness({ config: mockConfig, behavior });

      mockConfig.getIdeMode = vi.fn().mockReturnValue(true);

      const mockChat = {
        sendMessageStream: vi.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: StreamEventType.CHUNK,
              value: {
                candidates: [
                  {
                    content: { parts: [{ text: 'Response' }] },
                    finishReason: 'STOP',
                  },
                ],
              },
            };
          })(),
        ),
        setTools: vi.fn(),
        getHistory: vi.fn().mockReturnValue([]),
        addHistory: vi.fn(),
        setSystemInstruction: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(0),
      } as unknown as GeminiChat;
      (GeminiChat as unknown as Mock).mockReturnValue(mockChat);

      const syncSpy = vi.spyOn(behavior, 'syncEnvironment');

      const run = harness.run(
        [{ text: 'Hello' }],
        new AbortController().signal,
      );
      while (true) {
        const { done } = await run.next();
        if (done) break;
      }

      expect(syncSpy).toHaveBeenCalled();
    });
  });
});
