/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type GenerateContentResponse, FinishReason } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { GeminiChat, StreamEventType, type StreamEvent } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { HookSystem } from '../hooks/hookSystem.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import { LlmRole } from '../telemetry/types.js';

describe('Issue #25253 Regression Test', () => {
  let mockContentGenerator: ContentGenerator;
  let chat: GeminiChat;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    } as unknown as ContentGenerator;

    const mockToolRegistry = { getTool: vi.fn() };
    const testMessageBus = { publish: vi.fn(), subscribe: vi.fn() };

    mockConfig = {
      getRequestTimeoutMs: vi.fn().mockReturnValue(undefined),
      get config() {
        return this;
      },
      get toolRegistry() {
        return mockToolRegistry;
      },
      get messageBus() {
        return testMessageBus;
      },
      getProjectRoot: vi.fn().mockReturnValue('/test/root'),
      promptId: 'test-session-id',
      getSessionId: () => 'test-session-id',
      getTelemetryLogPromptsEnabled: () => true,
      getTelemetryTracesEnabled: () => false,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'oauth-personal',
        model: 'test-model',
      }),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      setActiveModel: vi.fn(),
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/test/temp'),
      },
      getToolRegistry: vi.fn().mockReturnValue({ getTool: vi.fn() }),
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getRetryFetchErrors: vi.fn().mockReturnValue(true),
      getMaxAttempts: vi.fn().mockReturnValue(3),
      modelConfigService: {
        getResolvedConfig: vi.fn().mockImplementation((modelConfigKey) => ({
          model: modelConfigKey.model,
          generateContentConfig: { temperature: 0 },
        })),
      },
      isContextManagementEnabled: vi.fn().mockReturnValue(false),
      getEnableHooks: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
    } as unknown as Config;

    const mockMessageBus = createMockMessageBus();
    mockConfig.getMessageBus = vi.fn().mockReturnValue(mockMessageBus);
    mockConfig.getHookSystem = vi
      .fn()
      .mockReturnValue(new HookSystem(mockConfig));

    const mockContext = {
      config: mockConfig,
      promptId: 'test-session-id',
    };

    chat = new GeminiChat(mockContext as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully retry when ERR_STREAM_PREMATURE_CLOSE occurs mid-stream', async () => {
    const prematureCloseError = new Error('Premature close');
    (prematureCloseError as any).code = 'ERR_STREAM_PREMATURE_CLOSE';

    const chunk1 = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Part 1' }] },
          finishReason: FinishReason.STOP,
        },
      ],
    } as unknown as GenerateContentResponse;
    const chunk2 = {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Part 2' }] },
          finishReason: FinishReason.STOP,
        },
      ],
    } as unknown as GenerateContentResponse;

    let callCount = 0;
    vi.mocked(mockContentGenerator.generateContentStream).mockImplementation(
      async function* () {
        callCount++;
        if (callCount === 1) {
          yield chunk1;
          throw prematureCloseError;
        }
        yield chunk2;
      } as any,
    );

    const events: StreamEvent[] = [];
    const stream = await chat.sendMessageStream(
      { model: 'test-model', isRetry: false },
      'hello',
      'test-prompt-id',
      new AbortController().signal,
      LlmRole.MAIN,
      LlmRole.MAIN,
    );
    for await (const event of stream) {
      events.push(event);
    }

    expect(callCount).toBe(2);
    expect(events.some((e) => e.type === StreamEventType.RETRY)).toBe(true);
    expect(
      events.filter((e) => e.type === StreamEventType.CHUNK),
    ).toHaveLength(2);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'error' }),
    );
  });
});
