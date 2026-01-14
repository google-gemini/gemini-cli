/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { applyGlobalGenerationConfig } from './generateContentConfig.js';
import type { Config } from '../config/config.js';
import { ThinkingLevel, type GenerateContentConfig } from '@google/genai';

describe('applyGlobalGenerationConfig', () => {
  const createMockConfig = (
    overrides: Partial<Record<keyof Config, unknown>> = {},
  ): Config =>
    ({
      getModelSeed: vi.fn().mockReturnValue(undefined),
      getModelTemperature: vi.fn().mockReturnValue(undefined),
      getModelTopK: vi.fn().mockReturnValue(undefined),
      getModelTopP: vi.fn().mockReturnValue(undefined),
      getModelThinkingLevel: vi.fn().mockReturnValue(undefined),
      getModelIncludeThoughts: vi.fn().mockReturnValue(undefined),
      getModelThinkingBudget: vi.fn().mockReturnValue(undefined),
      ...overrides,
    }) as unknown as Config;

  it('should return original config when global config returns undefined', () => {
    const originalConfig: GenerateContentConfig = { temperature: 0.1 };
    const mockConfig = createMockConfig();

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual(originalConfig);
    // should not mutate
    expect(result).not.toBe(originalConfig);
  });

  it('should apply seed, temperature, topK, topP from global config', () => {
    const originalConfig: GenerateContentConfig = { temperature: 0.1 };
    const mockConfig = createMockConfig({
      getModelSeed: vi.fn().mockReturnValue(42),
      getModelTemperature: vi.fn().mockReturnValue(0.7),
      getModelTopK: vi.fn().mockReturnValue(40),
      getModelTopP: vi.fn().mockReturnValue(0.9),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      seed: 42,
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
    });
  });

  it('should apply thinking level', () => {
    const originalConfig: GenerateContentConfig = {};
    const mockConfig = createMockConfig({
      getModelThinkingLevel: vi.fn().mockReturnValue('HIGH'),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    });
  });

  it('should apply include thoughts', () => {
    const originalConfig: GenerateContentConfig = {};
    const mockConfig = createMockConfig({
      getModelIncludeThoughts: vi.fn().mockReturnValue(true),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      thinkingConfig: {
        includeThoughts: true,
      },
    });
  });

  it('should apply thinking budget', () => {
    const originalConfig: GenerateContentConfig = {};
    const mockConfig = createMockConfig({
      getModelThinkingBudget: vi.fn().mockReturnValue(1024),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      thinkingConfig: {
        thinkingBudget: 1024,
      },
    });
  });

  it('should merge thinkingConfig if it already exists', () => {
    const originalConfig: GenerateContentConfig = {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
        includeThoughts: false,
      },
    };
    const mockConfig = createMockConfig({
      getModelIncludeThoughts: vi.fn().mockReturnValue(true),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
        includeThoughts: true, // Overridden
      },
    });
  });

  it('should preserve properties not overwritten by global config', () => {
    const originalConfig: GenerateContentConfig = {
      temperature: 0.1, // this will be overridden
      maxOutputTokens: 2000, // this will be preserved
    };
    const mockConfig = createMockConfig({
      getModelTemperature: vi.fn().mockReturnValue(0.9),
    });

    const result = applyGlobalGenerationConfig(originalConfig, mockConfig);

    expect(result).toEqual({
      temperature: 0.9,
      maxOutputTokens: 2000,
    });
  });
});
