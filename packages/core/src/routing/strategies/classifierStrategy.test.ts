/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { ClassifierStrategy } from './classifierStrategy.js';
import { GeminiClient } from '../../core/client.js';
import { RoutingContext } from '../routingStrategy.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import { Content, createUserContent } from '@google/genai';
import { Config } from '../../config/config.js';

vi.mock('../../core/client.js');

describe('ClassifierStrategy', () => {
  let strategy: ClassifierStrategy;
  let mockClient: GeminiClient;
  let mockContext: RoutingContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new GeminiClient({} as Config);
    strategy = new ClassifierStrategy();

    mockContext = {
      history: [],
      request: [{ text: 'test prompt' }],
      promptId: 'test-id',
      signal: new AbortController().signal,
    };
  });

  it('should call generateJson with the correct parameters (Model, Config)', async () => {
    const mockResponse = { model_choice: 'flash', reasoning: 'Simple task' };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    await strategy.route(mockContext, mockClient);

    expect(mockClient.generateJson).toHaveBeenCalledWith(
      expect.any(Array), // History + Request
      expect.any(Object), // RESPONSE_SCHEMA
      mockContext.signal,
      DEFAULT_GEMINI_FLASH_LITE_MODEL, // Must use Flash Lite for classification
      expect.objectContaining({
        systemInstruction: expect.any(Object),
        temperature: 0,
        maxOutputTokens: 200,
        thinkingConfig: { thinkingBudget: 0 },
      }),
    );
  });

  it('should return Pro model when classifier chooses Pro', async () => {
    const reasoning = 'Complex reasoning required';
    const mockResponse = { model_choice: 'pro', reasoning };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    const decision = await strategy.route(mockContext, mockClient);

    expect(decision.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(decision.metadata.source).toBe('Classifier');
    expect(decision.metadata.reasoning).toBe(reasoning);
    expect(decision.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return Flash model when classifier chooses Flash (and history is long enough)', async () => {
    // Set history length >= 5
    mockContext.history = new Array(5).fill({
      role: 'user',
      parts: [{ text: 'hi' }],
    });
    const reasoning = 'Simple task';
    const mockResponse = { model_choice: 'flash', reasoning };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    const decision = await strategy.route(mockContext, mockClient);

    expect(decision.model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });

  it('should return Flash Lite model when classifier chooses Flash (and history is too short)', async () => {
    // Set history length < 5 (e.g., 4)
    mockContext.history = new Array(4).fill({
      role: 'user',
      parts: [{ text: 'hi' }],
    });
    const reasoning = 'Simple task, short history';
    const mockResponse = { model_choice: 'flash', reasoning };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    const decision = await strategy.route(mockContext, mockClient);

    expect(decision.model).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });

  it('should filter tool calls and responses from history before calling LLM', async () => {
    const historyWithTools: Content[] = [
      { role: 'user', parts: [{ text: 'User message 1' }] },
      { role: 'model', parts: [{ functionCall: { name: 'ls', args: {} } }] }, // Should be filtered
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'ls', response: { output: 'files' } } },
        ],
      }, // Should be filtered
      { role: 'model', parts: [{ text: 'Model message 1' }] },
    ];
    mockContext.history = historyWithTools;

    const mockResponse = { model_choice: 'flash', reasoning: 'Simple' };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    await strategy.route(mockContext, mockClient);

    // Calculate the expected history structure passed to the LLM
    const expectedHistoryPassedToLLM = [
      { role: 'user', parts: [{ text: 'User message 1' }] },
      { role: 'model', parts: [{ text: 'Model message 1' }] },
      createUserContent(mockContext.request), // The current request is appended
    ];

    // Check the first argument of the generateJson call
    expect(mockClient.generateJson).toHaveBeenCalledWith(
      expectedHistoryPassedToLLM,
      expect.any(Object),
      expect.any(Object),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should respect HISTORY_SEARCH_WINDOW and HISTORY_TURNS_FOR_CONTEXT when filtering history', async () => {
    // Create a long history with intermittent tool calls
    const longHistory: Content[] = [];
    for (let i = 0; i < 30; i++) {
      longHistory.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
      if (i % 3 === 0) {
        longHistory.push({
          role: 'model',
          parts: [{ functionCall: { name: 'noise', args: {} } }],
        });
      }
    }
    mockContext.history = longHistory;

    const mockResponse = { model_choice: 'flash', reasoning: 'Simple' };
    vi.spyOn(mockClient, 'generateJson').mockResolvedValue(mockResponse);

    await strategy.route(mockContext, mockClient);

    // Manually apply the logic from the strategy to determine expected inputs
    // This tests the complex slicing logic.
    const HISTORY_SEARCH_WINDOW = 20;
    const HISTORY_TURNS_FOR_CONTEXT = 4;

    const historySlice = longHistory.slice(-HISTORY_SEARCH_WINDOW);
    const cleanHistory = historySlice.filter(
      (c) => !(c.parts && c.parts[0] && c.parts[0].functionCall),
    );
    const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    const historyPassedToLLM = (
      mockClient.generateJson as MockedFunction<typeof mockClient.generateJson>
    ).mock.calls[0][0];

    // Expect 4 history items + 1 current request = 5
    expect(historyPassedToLLM.length).toBe(5);
    // Verify the content matches the calculated final history
    expect(historyPassedToLLM[0]).toEqual(finalHistory[0]);
    expect(historyPassedToLLM[1]).toEqual(finalHistory[1]);
    expect(historyPassedToLLM[2]).toEqual(finalHistory[2]);
    expect(historyPassedToLLM[3]).toEqual(finalHistory[3]);
  });
});
