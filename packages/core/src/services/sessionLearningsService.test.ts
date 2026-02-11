/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionLearningsService } from './sessionLearningsService.js';
import type { Config } from '../config/config.js';
import type { GenerateContentResponse } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('SessionLearningsService', () => {
  let service: SessionLearningsService;
  let mockConfig: unknown;
  let mockRecordingService: any;
  let mockGeminiClient: any;
  let mockContentGenerator: any;
  let mockGenerateContent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '# Session Learnings\nSummary text here.' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    mockContentGenerator = {
      generateContent: mockGenerateContent,
    };

    mockRecordingService = {
      getConversation: vi.fn().mockReturnValue({
        messages: [
          { type: 'user', content: [{ text: 'Question' }] },
          { type: 'gemini', content: [{ text: 'Answer' }] },
        ],
      }),
    };

    mockGeminiClient = {
      getChatRecordingService: () => mockRecordingService,
    };

    mockConfig = {
      isSessionLearningsEnabled: vi.fn().mockReturnValue(true),
      getGeminiClient: () => mockGeminiClient,
      getContentGenerator: () => mockContentGenerator,
      getWorkingDir: () => '/mock/cwd',
      getActiveModel: () => 'gemini-1.5-flash',
      getModel: () => 'gemini-1.5-flash',
      isInteractive: () => true,
      setActiveModel: vi.fn(),
      getUserTier: () => 'free',
      getContentGeneratorConfig: () => ({ authType: 'apiKey' }),
      getModelAvailabilityService: () => ({
        selectFirstAvailable: (models: string[]) => ({
          selectedModel: models[0],
        }),
        consumeStickyAttempt: vi.fn(),
        markHealthy: vi.fn(),
      }),
      modelConfigService: {
        getResolvedConfig: vi
          .fn()
          .mockReturnValue({ model: 'gemini-1.5-flash', config: {} }),
      },
    };

    service = new SessionLearningsService(mockConfig as Config);

    vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate and save learnings when enabled and enough messages exist', async () => {
    await service.generateAndSaveLearnings();

    expect(mockGenerateContent).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join('/mock/cwd', 'session-learnings.md'),
      '# Session Learnings\nSummary text here.',
      'utf-8',
    );
  });

  it('should not generate learnings if disabled', async () => {
     
    (mockConfig as any).isSessionLearningsEnabled.mockReturnValue(false);

    await service.generateAndSaveLearnings();

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should not generate learnings if not enough messages', async () => {
     
    mockRecordingService.getConversation.mockReturnValue({
      messages: [{ type: 'user', content: [{ text: 'Single message' }] }],
    });

    await service.generateAndSaveLearnings();

    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockGenerateContent.mockRejectedValue(new Error('LLM Error'));

    // Should not throw
    await expect(service.generateAndSaveLearnings()).resolves.not.toThrow();
  });
});
