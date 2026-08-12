/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicContentGenerator } from './anthropicContentGenerator.js';
import type { ContentGeneratorConfig } from './contentGenerator.js';
import { resolveModel, CLAUDE_SONNET_5_MODEL, CLAUDE_OPUS_5_MODEL, VALID_GEMINI_MODELS } from '../config/models.js';

describe('AnthropicContentGenerator verification', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'eat-with-images');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'global');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('instantiates AnthropicVertex when GOOGLE_CLOUD_PROJECT is set', () => {
    const config: ContentGeneratorConfig = {
      apiKey: undefined,
      authType: undefined,
    };

    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');
    expect(generator).toBeDefined();
  });

  it('routes correctly with explicit model names', () => {
    const config: ContentGeneratorConfig = {
      apiKey: undefined,
      authType: undefined,
    };

    const sonnetGen = new AnthropicContentGenerator(config, 'claude-sonnet-5');
    const opusGen = new AnthropicContentGenerator(config, 'claude-opus-5');

    expect(sonnetGen).toBeDefined();
    expect(opusGen).toBeDefined();
  });

  it('resolves legacy and full Anthropic model IDs to canonical Claude models', () => {
    expect(resolveModel('claude-3-5-sonnet-v2@20241022')).toBe(CLAUDE_SONNET_5_MODEL);
    expect(resolveModel('claude-3-7-sonnet-20250219')).toBe(CLAUDE_SONNET_5_MODEL);
    expect(resolveModel('claude-3-opus-20240229')).toBe(CLAUDE_OPUS_5_MODEL);
    expect(resolveModel('claude-3-opus@20240229')).toBe(CLAUDE_OPUS_5_MODEL);
  });

  it('validates Claude model strings in VALID_GEMINI_MODELS set', () => {
    expect(VALID_GEMINI_MODELS.has('claude-3-5-sonnet-v2@20241022')).toBe(true);
    expect(VALID_GEMINI_MODELS.has('claude-3-opus-20240229')).toBe(true);
  });
});
