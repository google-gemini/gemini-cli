/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AdaptiveBudgetService,
  ComplexityLevel,
} from './adaptiveBudgetService.js';
import type { Config } from '../config/config.js';

describe('AdaptiveBudgetService', () => {
  it('should map complexity levels to correct V2 budgets', () => {
    const service = new AdaptiveBudgetService({} as Config);
    expect(service.getThinkingBudgetV2(ComplexityLevel.SIMPLE)).toBe(1024);
    expect(service.getThinkingBudgetV2(ComplexityLevel.MODERATE)).toBe(4096);
    expect(service.getThinkingBudgetV2(ComplexityLevel.HIGH)).toBe(16384);
    expect(service.getThinkingBudgetV2(ComplexityLevel.EXTREME)).toBe(32768);
  });

  it('should map complexity levels to correct V3 levels', () => {
    const service = new AdaptiveBudgetService({} as Config);
    expect(service.getThinkingLevelV3(ComplexityLevel.SIMPLE)).toBe('LOW');
    expect(service.getThinkingLevelV3(ComplexityLevel.MODERATE)).toBe('LOW');
    expect(service.getThinkingLevelV3(ComplexityLevel.HIGH)).toBe('HIGH');
    expect(service.getThinkingLevelV3(ComplexityLevel.EXTREME)).toBe('HIGH');
  });

  it('should determine adaptive config based on LLM response', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: '3' }] } }],
    });

    const mockConfig = {
      getBaseLlmClient: () => ({
        generateContent: mockGenerateContent,
      }),
      getAdaptiveThinkingConfig: () => ({
        enabled: true,
        classifierModel: 'gemini-2.0-flash',
      }),
    } as unknown as Config;

    const service = new AdaptiveBudgetService(mockConfig);
    const result = await service.determineAdaptiveConfig(
      'Complex task',
      'gemini-2.5-pro',
      [],
    );

    expect(result?.complexity).toBe(ComplexityLevel.HIGH);
    expect(result?.thinkingBudget).toBe(16384);
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('should handle Gemini 3 models with thinkingLevel', async () => {
    const mockConfig = {
      getBaseLlmClient: () => ({
        generateContent: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: '1' }] } }],
        }),
      }),
      getAdaptiveThinkingConfig: () => ({
        enabled: true,
        classifierModel: 'gemini-2.0-flash',
      }),
    } as unknown as Config;

    const service = new AdaptiveBudgetService(mockConfig);
    const result = await service.determineAdaptiveConfig(
      'Hi',
      'gemini-3-pro-preview',
      [],
    );

    expect(result?.complexity).toBe(ComplexityLevel.SIMPLE);
    expect(result?.thinkingLevel).toBe('LOW');
    expect(result?.thinkingBudget).toBeUndefined();
  });
});
