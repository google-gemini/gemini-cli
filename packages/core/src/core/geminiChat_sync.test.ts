/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { LlmRole } from '../telemetry/types.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { Tool } from '@google/genai';
import type { ToolRegistry } from '../tools/tool-registry.js';

// Mock retryWithBackoff
vi.mock('../utils/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/retry.js')>();
  return {
    ...actual,
    retryWithBackoff: vi.fn().mockImplementation(async (apiCall) => apiCall()),
  };
});

describe('GeminiChat Tool Synchronization', () => {
  let mockContentGenerator: ContentGenerator;
  let mockConfig: Config;

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: { parts: [{ text: 'response' }] },
            finishReason: 'STOP',
          },
        ],
      }),
      generateContentStream: vi.fn(),
    } as unknown as ContentGenerator;

    mockConfig = {
      getDisableStreaming: vi.fn().mockReturnValue(true),
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getGemini31Launched: vi.fn().mockResolvedValue(false),
      getGemini31FlashLiteLaunched: vi.fn().mockResolvedValue(false),
      getHasAccessToPreviewModel: vi.fn().mockReturnValue(false),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getMaxAttempts: vi.fn().mockReturnValue(1),
      getRetryFetchErrors: vi.fn().mockReturnValue(false),
      getHookSystem: vi.fn().mockReturnValue(undefined),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue(undefined),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ model: 'gemini-pro' }),
      getProjectRoot: vi.fn().mockReturnValue('/test/project/root'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(true),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
      getDebugMode: vi.fn().mockReturnValue(false),
      getValidationHandler: vi.fn().mockReturnValue(undefined),
      getModelAvailabilityService: vi.fn().mockReturnValue({
        selectFirstAvailable: vi.fn().mockImplementation((models) => ({
          model: models[0],
          config: {},
        })),
        markHealthy: vi.fn(),
      }),
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue({
          model: 'gemini-pro',
          generateContentConfig: {},
        }),
      },
    } as unknown as Config;
  });

  it('should update config.tools when this.tools is updated via onModelChanged', async () => {
    const initialTools = [{ functionDeclarations: [{ name: 'tool1' }] }];
    const updatedTools = [{ functionDeclarations: [{ name: 'tool2' }] }];

    const onModelChanged = vi.fn().mockResolvedValue(updatedTools);

    const chat = new GeminiChat(
      {
        config: mockConfig,
        toolRegistry: {
          getMessageBus: () => createMockMessageBus(),
        } as unknown as ToolRegistry,
      } as unknown as AgentLoopContext,
      'system instruction',
      initialTools as unknown as Tool[],
      [], // history
      undefined, // resumedSessionData
      onModelChanged,
    );

    const stream = await chat.sendMessageStream(
      { model: 'gemini-pro' },
      [{ text: 'user prompt' }],
      'prompt-id',
      new AbortController().signal,
      LlmRole.UTILITY_TOOL,
    );
     
    for await (const _ of stream) {
      // consume stream
    }

    // Verify onModelChanged was called
    expect(onModelChanged).toHaveBeenCalled();

    // Verify generateContent was called with updated tools
    expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          tools: updatedTools,
        }),
      }),
      expect.any(String),
      LlmRole.UTILITY_TOOL,
    );
  });
});
