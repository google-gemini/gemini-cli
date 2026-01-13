/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { ApiError } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { GeminiChat, StreamEventType, type StreamEvent } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { setSimulate429 } from '../utils/testUtils.js';
import { HookSystem } from '../hooks/hookSystem.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => {
      const error = new Error('ENOENT');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }),
    existsSync: vi.fn(() => false),
  },
}));

const { mockRetryWithBackoff } = vi.hoisted(() => ({
  mockRetryWithBackoff: vi.fn(),
}));

vi.mock('../utils/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/retry.js')>();
  return {
    ...actual,
    retryWithBackoff: mockRetryWithBackoff,
  };
});

// Mock loggers
const { mockLogContentRetry, mockLogContentRetryFailure } = vi.hoisted(() => ({
  mockLogContentRetry: vi.fn(),
  mockLogContentRetryFailure: vi.fn(),
}));

vi.mock('../telemetry/loggers.js', () => ({
  logContentRetry: mockLogContentRetry,
  logContentRetryFailure: mockLogContentRetryFailure,
}));

describe('GeminiChat Network Retries', () => {
  let mockContentGenerator: ContentGenerator;
  let chat: GeminiChat;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    } as unknown as ContentGenerator;

    // Default mock implementation: execute the function immediately
    mockRetryWithBackoff.mockImplementation(async (apiCall) => apiCall());

    mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getPreviewFeatures: () => false,
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'oauth-personal',
        model: 'test-model',
      }),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      setActiveModel: vi.fn(),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getToolRegistry: vi.fn().mockReturnValue({ getTool: vi.fn() }),
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getRetryFetchErrors: vi.fn().mockReturnValue(false), // Default false
      modelConfigService: {
        getResolvedConfig: vi.fn().mockImplementation((modelConfigKey) => ({
          model: modelConfigKey.model,
          generateContentConfig: { temperature: 0 },
        })),
      },
      getEnableHooks: vi.fn().mockReturnValue(false),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;

    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    setSimulate429(false);
    chat = new GeminiChat(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should retry when a 503 ApiError occurs during stream iteration', async () => {
    // 1. Mock the API to yield one chunk, then throw a 503 error.
    const error503 = new ApiError({
      message: 'Service Unavailable',
      status: 503,
    });

    vi.mocked(mockContentGenerator.generateContentStream)
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            candidates: [{ content: { parts: [{ text: 'First part' }] } }],
          } as unknown as GenerateContentResponse;
          throw error503;
        })(),
      )
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'Retry success' }] },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

    // 2. Execute sendMessageStream
    const stream = await chat.sendMessageStream(
      { model: 'test-model' },
      'test message',
      'prompt-id-retry-network',
      new AbortController().signal,
    );

    const events: StreamEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    // 3. Assertions
    // Expected sequence: CHUNK('First part') -> RETRY -> CHUNK('Retry success')
    expect(events.length).toBeGreaterThanOrEqual(3);

    const firstChunk = events.find(
      (e) =>
        e.type === StreamEventType.CHUNK &&
        e.value.candidates?.[0]?.content?.parts?.[0]?.text === 'First part',
    );
    expect(firstChunk).toBeDefined();

    const retryEvent = events.find((e) => e.type === StreamEventType.RETRY);
    expect(retryEvent).toBeDefined();

    const successChunk = events.find(
      (e) =>
        e.type === StreamEventType.CHUNK &&
        e.value.candidates?.[0]?.content?.parts?.[0]?.text === 'Retry success',
    );
    expect(successChunk).toBeDefined();

    // Verify retry logging
    expect(mockLogContentRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        error_type: 'NETWORK_ERROR',
      }),
    );
  });

  it('should retry on generic network error if retryFetchErrors is true', async () => {
    vi.mocked(mockConfig.getRetryFetchErrors).mockReturnValue(true);

    const fetchError = new Error('fetch failed: socket hang up');

    vi.mocked(mockContentGenerator.generateContentStream)
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            candidates: [{ content: { parts: [{ text: '' }] } }],
          } as GenerateContentResponse; // Dummy yield
          throw fetchError;
        })(),
      )
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'Success' }] },
                finishReason: 'STOP',
              },
            ],
          } as unknown as GenerateContentResponse;
        })(),
      );

    const stream = await chat.sendMessageStream(
      { model: 'test-model' },
      'test message',
      'prompt-id-retry-fetch',
      new AbortController().signal,
    );

    const events: StreamEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    const retryEvent = events.find((e) => e.type === StreamEventType.RETRY);
    expect(retryEvent).toBeDefined();

    const successChunk = events.find(
      (e) =>
        e.type === StreamEventType.CHUNK &&
        e.value.candidates?.[0]?.content?.parts?.[0]?.text === 'Success',
    );
    expect(successChunk).toBeDefined();
  });

  it('should NOT retry on 400 ApiError', async () => {
    const error400 = new ApiError({
      message: 'Bad Request',
      status: 400,
    });

    vi.mocked(
      mockContentGenerator.generateContentStream,
    ).mockImplementationOnce(async () =>
      (async function* () {
        yield {
          candidates: [{ content: { parts: [{ text: '' }] } }],
        } as GenerateContentResponse; // Dummy yield
        throw error400;
      })(),
    );

    const stream = await chat.sendMessageStream(
      { model: 'test-model' },
      'test message',
      'prompt-id-no-retry',
      new AbortController().signal,
    );

    await expect(async () => {
      for await (const _ of stream) {
        // consume
      }
    }).rejects.toThrow(error400);

    expect(mockLogContentRetry).not.toHaveBeenCalled();
  });
});
