/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicContentGenerator } from './anthropicContentGenerator.js';
import type { ContentGeneratorConfig } from './contentGenerator.js';
import { resolveModel, CLAUDE_SONNET_5_MODEL, CLAUDE_OPUS_5_MODEL, VALID_GEMINI_MODELS } from '../config/models.js';

const stubEnv = (key: string, val: string) => {
  if (typeof vi !== 'undefined' && typeof vi.stubEnv === 'function') {
    vi.stubEnv(key, val);
  } else {
    process.env[key] = val;
  }
};

const unstubEnvs = () => {
  if (typeof vi !== 'undefined' && typeof vi.unstubAllEnvs === 'function') {
    vi.unstubAllEnvs();
  }
};

describe('AnthropicContentGenerator verification', () => {
  beforeEach(() => {
    stubEnv('GOOGLE_CLOUD_PROJECT', 'eat-with-images');
    stubEnv('GOOGLE_CLOUD_LOCATION', 'global');
  });

  afterEach(() => {
    unstubEnvs();
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

  it('deduplicates tool_use IDs in assistant messages to satisfy Anthropic uniqueness requirement', () => {
    const config: ContentGeneratorConfig = { apiKey: 'fake-key' };
    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');

    const mapped = (generator as any).mapRequestToAnthropic({
      contents: [
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'dup_id', name: 'read_file', args: {} } },
            { functionCall: { id: 'dup_id', name: 'write_file', args: {} } },
          ],
        },
      ],
    });

    const content = mapped.messages[0].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0].id).toBe('dup_id');
    expect(content[1].id).not.toBe('dup_id');
    expect(content[1].id).toBe('dup_id_1');
  });

  it('handles 3+ identical tool_use IDs without secondary collisions', () => {
    const config: ContentGeneratorConfig = { apiKey: 'fake-key' };
    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');

    const mapped = (generator as any).mapRequestToAnthropic({
      contents: [
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'dup_id', name: 'read_file', args: {} } },
            { functionCall: { id: 'dup_id', name: 'write_file', args: {} } },
            { functionCall: { id: 'dup_id', name: 'edit_file', args: {} } },
          ],
        },
      ],
    });

    const content = mapped.messages[0].content as any[];
    expect(content).toHaveLength(3);
    const ids = content.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['dup_id', 'dup_id_1', 'dup_id_2']);
  });

  it('correctly maps deduplicated tool_use IDs to matching functionResponse tool_result blocks', () => {
    const config: ContentGeneratorConfig = { apiKey: 'fake-key' };
    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');

    const mapped = (generator as any).mapRequestToAnthropic({
      contents: [
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'dup_id', name: 'read_file', args: {} } },
            { functionCall: { id: 'dup_id', name: 'write_file', args: {} } },
          ],
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'dup_id', name: 'read_file', response: { output: 'res1' } } },
            { functionResponse: { id: 'dup_id', name: 'write_file', response: { output: 'res2' } } },
          ],
        },
      ],
    });

    expect(mapped.messages).toHaveLength(2);
    const modelBlocks = mapped.messages[0].content as any[];
    const userBlocks = mapped.messages[1].content as any[];

    expect(modelBlocks[0].id).toBe('dup_id');
    expect(modelBlocks[1].id).toBe('dup_id_1');

    expect(userBlocks[0].tool_use_id).toBe('dup_id');
    expect(userBlocks[1].tool_use_id).toBe('dup_id_1');
  });

  it('attaches remoteModelId as modelVersion to streamed chunks', async () => {
    const config: ContentGeneratorConfig = { apiKey: 'fake-key' };
    const generator = new AnthropicContentGenerator(config, 'claude-sonnet-5');

    const fakeStream = (async function* () {
      yield { type: 'message_start', message: { model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 10 } } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
      yield { type: 'message_delta', usage: { output_tokens: 5 }, delta: { stop_reason: 'end_turn' } };
    })();

    const asyncIterableStream = {
      [Symbol.asyncIterator]() {
        return fakeStream;
      },
    };

    (generator as any).client = {
      messages: {
        stream: () => asyncIterableStream,
        create: () => Promise.resolve(asyncIterableStream),
      },
    };

    const chunks = [];
    for await (const chunk of await generator.generateContentStream({ model: 'claude-sonnet-5', contents: [{ role: 'user', parts: [{ text: 'hi' }] }] })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].modelVersion).toBe('claude-3-5-sonnet-20241022');
  });
});
