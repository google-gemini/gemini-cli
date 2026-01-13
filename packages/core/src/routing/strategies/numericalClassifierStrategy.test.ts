/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NumericalClassifierStrategy } from './numericalClassifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { ExperimentFlags } from '../../code_assist/experiments/flagNames.js';

vi.mock('../../core/baseLlmClient.js');
vi.mock('../../utils/promptIdContext.js');

describe('NumericalClassifierStrategy', () => {
  let strategy: NumericalClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockResolvedConfig: ResolvedModelConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new NumericalClassifierStrategy();
    mockContext = {
      history: [],
      request: [{ text: 'simple task' }],
      signal: new AbortController().signal,
    };

    mockResolvedConfig = {
      model: 'classifier',
      generateContentConfig: {},
    } as unknown as ResolvedModelConfig;
    mockConfig = {
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue(mockResolvedConfig),
      },
      getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      getPreviewFeatures: () => false,
      getSessionId: vi.fn().mockReturnValue('control-group-id'), // Default to Control Group (Hash 71 >= 50)
      getExperimentsAsync: vi
        .fn()
        .mockResolvedValue({ flags: {}, experimentIds: [] }),
    } as unknown as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;

    vi.mocked(promptIdContext.getStore).mockReturnValue('test-prompt-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call generateJson with the correct parameters and wrapped user content', async () => {
    const mockApiResponse = {
      reasoning: 'Simple task',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall).toMatchObject({
      modelConfigKey: { model: mockResolvedConfig.model },
      promptId: 'test-prompt-id',
    });

    // Verify user content wrapping for security
    const userContent =
      generateJsonCall.contents[generateJsonCall.contents.length - 1];
    const textPart = userContent.parts?.[0];
    expect(textPart?.text).toContain('<user_request>');
    expect(textPart?.text).toContain('simple task');
    expect(textPart?.text).toContain('</user_request>');
  });

  describe('A/B Testing Logic (Deterministic)', () => {
    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 40 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Hash 71 -> Control
      const mockApiResponse = {
        reasoning: 'Standard task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 60 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 60 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1'); // Hash 35 -> Strict
      const mockApiResponse = {
        reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Routed to Flash because 60 < 80
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 80'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 90 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1');
      const mockApiResponse = {
        reasoning: 'Extreme task',
        complexity_score: 90,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 90 / Threshold: 80'),
        },
      });
    });
  });

  describe('Remote Threshold Logic', () => {
    it('should use the remote CLASSIFIER_THRESHOLD if provided (int value)', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            intValue: '70',
          },
        },
        experimentIds: [],
      });
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 60 < Threshold 70
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 70'),
        },
      });
    });

    it('should use the remote CLASSIFIER_THRESHOLD if provided (float value)', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            floatValue: 45.5,
          },
        },
        experimentIds: [],
      });
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 40 < Threshold 45.5
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 45.5'),
        },
      });
    });

    it('should use PRO model if score >= remote CLASSIFIER_THRESHOLD', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            intValue: '30',
          },
        },
        experimentIds: [],
      });
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 35,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL, // Score 35 >= Threshold 30
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 35 / Threshold: 30'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is not present in experiments', async () => {
      // Mock getExperimentsAsync to return no CLASSIFIER_THRESHOLD flag
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {},
        experimentIds: [],
      });
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Should resolve to Control (50)
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 40 < Default A/B Threshold 50
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is malformed', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            stringValue: 'not-a-number', // Malformed value
          },
        },
        experimentIds: [],
      });
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1'); // Should resolve to Strict (80)
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 70,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 70 < Default A/B Threshold 80
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 70 / Threshold: 80'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (less than 0)', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            intValue: '-10',
          },
        },
        experimentIds: [],
      });
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (greater than 100)', async () => {
      vi.mocked(mockConfig.getExperimentsAsync).mockResolvedValue({
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: {
            flagId: ExperimentFlags.CLASSIFIER_THRESHOLD,
            intValue: '110',
          },
        },
        experimentIds: [],
      });
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        reasoning: 'Test task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });
  });

  it('should return null if the classifier API call fails', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const testError = new Error('API Failure');
    vi.mocked(mockBaseLlmClient.generateJson).mockRejectedValue(testError);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should return null if the classifier returns a malformed JSON object', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      reasoning: 'This is a simple task.',
      // complexity_score is missing
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      malformedApiResponse,
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should filter out tool-related history before sending to classifier', async () => {
    mockContext.history = [
      { role: 'user', parts: [{ text: 'call a tool' }] },
      { role: 'model', parts: [{ functionCall: { name: 'test_tool' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'test_tool', response: { ok: true } } },
        ],
      },
      { role: 'user', parts: [{ text: 'another user turn' }] },
    ];
    const mockApiResponse = {
      reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    const expectedContents = [
      { role: 'user', parts: [{ text: 'call a tool' }] },
      { role: 'user', parts: [{ text: 'another user turn' }] },
      // The last user turn is wrapped
      {
        role: 'user',
        parts: [{ text: '<user_request>\nsimple task\n</user_request>' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should respect HISTORY_SEARCH_WINDOW and HISTORY_TURNS_FOR_CONTEXT', async () => {
    const longHistory: Content[] = [];
    for (let i = 0; i < 30; i++) {
      longHistory.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
      // Add noise that should be filtered
      if (i % 2 === 0) {
        longHistory.push({
          role: 'model',
          parts: [{ functionCall: { name: 'noise', args: {} } }],
        });
      }
    }
    mockContext.history = longHistory;
    const mockApiResponse = {
      reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Manually calculate what the history should be
    const HISTORY_SEARCH_WINDOW = 20;
    const HISTORY_TURNS_FOR_CONTEXT = 4;
    const historySlice = longHistory.slice(-HISTORY_SEARCH_WINDOW);
    const cleanHistory = historySlice.filter(
      (content) => !isFunctionCall(content) && !isFunctionResponse(content),
    );
    const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    // Last part is the wrapped request
    const requestPart = {
      role: 'user',
      parts: [{ text: '<user_request>\nsimple task\n</user_request>' }],
    };

    expect(contents).toEqual([...finalHistory, requestPart]);
    expect(contents).toHaveLength(5);
  });

  it('should use a fallback promptId if not found in context', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    vi.mocked(promptIdContext.getStore).mockReturnValue(undefined);
    const mockApiResponse = {
      reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall.promptId).toMatch(
      /^classifier-router-fallback-\d+-\w+$/,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context. This is unexpected. Using a fallback ID:',
      ),
    );
  });
});
