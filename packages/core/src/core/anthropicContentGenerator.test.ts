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

  it('deduplicates and merges tool_result blocks with identical tool_use_id in mapRequestToAnthropic', () => {
    const config: ContentGeneratorConfig = {
      apiKey: undefined,
      authType: undefined,
    };
    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');

    const mapped = (generator as any).mapRequestToAnthropic({
      contents: [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'synth_test_123',
                name: 'read_file',
                response: { output: 'Part 1' },
              },
            },
            {
              functionResponse: {
                id: 'synth_test_123',
                name: 'read_file',
                response: { output: 'Part 2' },
              },
            },
          ],
        },
      ],
    });

    expect(mapped.max_tokens).toBe(8192);
    expect(mapped.messages).toHaveLength(1);
    const content = mapped.messages[0].content as any[];
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('synth_test_123');
    expect(content[0].content).toContain('Part 1');
    expect(content[0].content).toContain('Part 2');
  });
});
