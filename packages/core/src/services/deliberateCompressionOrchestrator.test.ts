/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliberateCompressionOrchestrator } from './deliberateCompressionOrchestrator.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { GeminiChat } from '../core/geminiChat.js';

describe('DeliberateCompressionOrchestrator', () => {
  let orchestrator: DeliberateCompressionOrchestrator;
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;
  let mockChat: GeminiChat;

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      isDeliberateCompressionEnabled: vi.fn().mockReturnValue(true),
      getDeliberateCompressionAutoSkip: vi.fn().mockResolvedValue(false),
    } as unknown as Config;

    mockChat = {
      getHistory: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(50000),
    } as unknown as GeminiChat;

    orchestrator = new DeliberateCompressionOrchestrator();
  });

  it('should extract goals and prompt user for selection', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Help me add OAuth' }] },
      { role: 'model', parts: [{ text: 'Sure!' }] },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);

    // Mock goal extraction
    const extractionResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: '<goals><goal>Implementing OAuth</goal></goals>' }],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      extractionResponse,
    );

    const result = await orchestrator.prepareDeliberateCompression(
      mockChat,
      mockConfig,
      'gemini-pro',
      'test-prompt-id',
      false, // not safety valve
    );

    expect(result.shouldPromptUser).toBe(true);
    expect(result.extractedGoals).toEqual(['Implementing OAuth']);
    expect(result.selectedGoal).toBeUndefined();
  });

  it('should skip prompt when safety valve triggers', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Add auth' }] },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);

    const result = await orchestrator.prepareDeliberateCompression(
      mockChat,
      mockConfig,
      'gemini-pro',
      'test-prompt-id',
      true, // safety valve
    );

    expect(result.shouldPromptUser).toBe(false);
    expect(result.skipReason).toBe('safety_valve');
    expect(result.useBasicCompression).toBe(true);
  });

  it('should skip prompt when no goals found', async () => {
    const history: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);

    // Mock empty goals
    const extractionResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: '<goals></goals>' }],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      extractionResponse,
    );

    const result = await orchestrator.prepareDeliberateCompression(
      mockChat,
      mockConfig,
      'gemini-pro',
      'test-prompt-id',
      false,
    );

    expect(result.shouldPromptUser).toBe(false);
    expect(result.skipReason).toBe('no_goals');
    expect(result.useBasicCompression).toBe(true);
  });

  it('should apply selected goal to compression options', () => {
    const selectedGoal = 'Implementing OAuth authentication';

    const options = orchestrator.createCompressionOptions(selectedGoal);

    expect(options.userGoal).toBe('Implementing OAuth authentication');
    expect(options.preserveStrategy).toBe('since-last-prompt');
  });

  it('should use percentage strategy when no goal selected', () => {
    const options = orchestrator.createCompressionOptions(null);

    expect(options.userGoal).toBeUndefined();
    expect(options.preserveStrategy).toBe('percentage');
  });

  it('should handle complete flow with goal selection', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Add JWT support' }] },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);

    // Mock goal extraction
    const extractionResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: '<goals><goal>Adding JWT support</goal></goals>' }],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      extractionResponse,
    );

    // Prepare compression
    const prepareResult = await orchestrator.prepareDeliberateCompression(
      mockChat,
      mockConfig,
      'gemini-pro',
      'test-prompt-id',
      false,
    );

    expect(prepareResult.shouldPromptUser).toBe(true);

    // User selects goal
    const selectedGoal = prepareResult.extractedGoals![0];

    // Create compression options
    const options = orchestrator.createCompressionOptions(selectedGoal);

    expect(options.userGoal).toBe('Adding JWT support');
    expect(options.preserveStrategy).toBe('since-last-prompt');
  });

  it('should handle complete flow with skip selection', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Add OAuth' }] },
    ];

    vi.mocked(mockChat.getHistory).mockReturnValue(history);

    // Mock goal extraction
    const extractionResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: '<goals><goal>Adding OAuth</goal></goals>' }],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      extractionResponse,
    );

    // Prepare compression
    const prepareResult = await orchestrator.prepareDeliberateCompression(
      mockChat,
      mockConfig,
      'gemini-pro',
      'test-prompt-id',
      false,
    );

    expect(prepareResult.shouldPromptUser).toBe(true);

    // User skips
    const options = orchestrator.createCompressionOptions(null);

    expect(options.userGoal).toBeUndefined();
    expect(options.preserveStrategy).toBe('percentage');
  });
});
