/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GeminiChat } from './geminiChat.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import {
  type GenerateContentResponse,
  type GenerateContentParameters,
  type Part,
} from '@google/genai';

// Mock dependencies
vi.mock('../services/chatRecordingService.js', () => ({
  getProjectHash: vi.fn(() => 'mock-hash'),
  ChatRecordingService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    recordMessage: vi.fn(),
    recordThought: vi.fn(),
    recordMessageTokens: vi.fn(),
    updateMessagesFromHistory: vi.fn(),
  })),
}));

// Subclass to expose internal processStreamResponse for testing
class TestGeminiChat extends GeminiChat {
  async testProcessStream(
    model: string,
    stream: AsyncGenerator<GenerateContentResponse>,
    request: GenerateContentParameters,
  ) {
    // @ts-expect-error - access private method for testing
    const generator = this.processStreamResponse(model, stream, request);
    for await (const _ of generator) {
      // exhaust
    }
  }
}

describe('Thought Retention in Chat History', () => {
  it('should retain thought parts in chat history', async () => {
    const mockContext = {
      config: {
        getHookSystem: () => null,
        getMaxAttempts: () => 1,
        getProjectRoot: () => '/mock/root',
        getQuotaRemaining: () => undefined,
        modelConfigService: {
          getResolvedConfig: () => ({ model: 'gemini-3-pro-preview' }),
        },
      },
      toolRegistry: {
        getAllTools: () => [],
      },
      modelAvailabilityService: {
        reset: () => {},
      },
      promptId: 'test-session',
    } as unknown as AgentLoopContext;

    const chat = new TestGeminiChat(mockContext, '', [], []);

    const modelResponseChunks: GenerateContentResponse[] = [
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  thought: true,
                  text: 'Thinking about the problem...',
                } as unknown as Part,
              ],
            },
          },
        ],
      } as unknown as GenerateContentResponse,
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'The answer is 42.' }],
            },
            finishReason: 'STOP' as string,
          },
        ],
      } as unknown as GenerateContentResponse,
    ];

    async function* mockStream() {
      for (const chunk of modelResponseChunks) {
        yield chunk;
      }
    }

    await chat.testProcessStream(
      'gemini-3-pro-preview',
      mockStream(),
      {} as unknown as GenerateContentParameters,
    );

    const history = chat.getHistory();
    const modelTurn = history.find((h) => h.role === 'model');

    expect(modelTurn).toBeDefined();

    // Check if the thought part is present in history
    const hasThought = modelTurn!.parts!.some(
      (p) => (p as Part & { thought?: boolean }).thought,
    );

    // With our fix in geminiChat.ts, this should now be TRUE
    expect(hasThought).toBe(true);
    expect(modelTurn!.parts!.some((p) => p.text === 'The answer is 42.')).toBe(
      true,
    );
  });

  it('should retain thoughtSignature in text parts (even if empty)', async () => {
    const mockContext = {
      config: {
        getHookSystem: () => null,
        getMaxAttempts: () => 1,
        getProjectRoot: () => '/mock/root',
        getQuotaRemaining: () => undefined,
        modelConfigService: {
          getResolvedConfig: () => ({ model: 'gemini-3-pro-preview' }),
        },
      },
      toolRegistry: {
        getAllTools: () => [],
      },
      modelAvailabilityService: {
        reset: () => {},
      },
      promptId: 'test-session',
    } as unknown as AgentLoopContext;

    const chat = new TestGeminiChat(mockContext, '', [], []);

    const modelResponseChunks: GenerateContentResponse[] = [
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'The answer ' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse,
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: 'is 42.',
                  thoughtSignature: 'sig-123',
                } as unknown as Part,
              ],
            },
          },
        ],
      } as unknown as GenerateContentResponse,
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  text: '',
                  thoughtSignature: 'sig-456',
                } as unknown as Part,
              ],
            },
            finishReason: 'STOP' as string,
          },
        ],
      } as unknown as GenerateContentResponse,
    ];

    async function* mockStream() {
      for (const chunk of modelResponseChunks) {
        yield chunk;
      }
    }

    await chat.testProcessStream(
      'gemini-3-pro-preview',
      mockStream(),
      {} as unknown as GenerateContentParameters,
    );

    const history = chat.getHistory();
    const modelTurn = history.find((h) => h.role === 'model');

    expect(modelTurn).toBeDefined();
    // Consolidation should have merged the text and preserved the LATEST thoughtSignature
    expect(modelTurn!.parts![0].text).toBe('The answer is 42.');
    expect(modelTurn!.parts![0].thoughtSignature).toBe('sig-456');
  });
});
