/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ModelMappingContentGenerator } from './modelMappingContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';
import { LlmRole } from '../telemetry/llmRole.js';
import type { GenerateContentParameters } from '@google/genai';

describe('ModelMappingContentGenerator', () => {
  const mockMappings = {
    'gemini-3.5-flash': 'gemini-3-flash',
    'gemini-pro': 'gemini-1.5-pro',
  };

  it('delegates userTier, userTierName, and paidTier properties', () => {
    const mockWrapped = {
      userTier: 'free',
      userTierName: 'Free Tier',
      paidTier: { id: 'paid' },
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );

    expect(generator.userTier).toBe('free');
    expect(generator.userTierName).toBe('Free Tier');
    expect(generator.paidTier).toEqual({ id: 'paid' });
  });

  it('maps matching model without prefix', async () => {
    const mockWrapped = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );
    const req = { model: 'gemini-3.5-flash', contents: [] };

    await generator.generateContent(req, 'prompt-id', LlmRole.MAIN);

    expect(mockWrapped.generateContent).toHaveBeenCalledWith(
      { model: 'gemini-3-flash', contents: [] },
      'prompt-id',
      LlmRole.MAIN,
    );
  });

  it('maps matching model with models/ prefix', async () => {
    const mockWrapped = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );
    const req = { model: 'models/gemini-3.5-flash', contents: [] };

    await generator.generateContent(req, 'prompt-id', LlmRole.MAIN);

    expect(mockWrapped.generateContent).toHaveBeenCalledWith(
      { model: 'models/gemini-3-flash', contents: [] },
      'prompt-id',
      LlmRole.MAIN,
    );
  });

  it('leaves unmapped model unchanged', async () => {
    const mockWrapped = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );
    const req = { model: 'unknown-model', contents: [] };

    await generator.generateContent(req, 'prompt-id', LlmRole.MAIN);

    expect(mockWrapped.generateContent).toHaveBeenCalledWith(
      { model: 'unknown-model', contents: [] },
      'prompt-id',
      LlmRole.MAIN,
    );
  });

  it('leaves model with prefix unchanged if no match after normalization', async () => {
    const mockWrapped = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );
    const req = { model: 'models/unknown-model', contents: [] };

    await generator.generateContent(req, 'prompt-id', LlmRole.MAIN);

    expect(mockWrapped.generateContent).toHaveBeenCalledWith(
      { model: 'models/unknown-model', contents: [] },
      'prompt-id',
      LlmRole.MAIN,
    );
  });

  it('handles missing/undefined model property safely', async () => {
    const mockWrapped = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as ContentGenerator;

    const generator = new ModelMappingContentGenerator(
      mockWrapped,
      mockMappings,
    );
    const req = { contents: [] } as unknown as GenerateContentParameters;

    await generator.generateContent(req, 'prompt-id', LlmRole.MAIN);

    expect(mockWrapped.generateContent).toHaveBeenCalledWith(
      { contents: [] },
      'prompt-id',
      LlmRole.MAIN,
    );
  });
});
