/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalGeminiClient } from './localGeminiClient.js';
import type { Config } from '../config/config.js';
import { GoogleGenAI } from '@google/genai';
import type { Models } from '@google/genai';

vi.mock('@google/genai');

describe('LocalGeminiClient', () => {
  let mockConfig: Config;
  let mockGenerateContent: vi.Mock; // Declare it as a vi.Mock

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize mockGenerateContent for each test
    mockGenerateContent = vi.fn();

    // Set up the mock for GoogleGenAI constructor to return an instance
    // with our mocked generateContent method.
    // We need to cast the partial `models` object to `Models` and the full instance to `GoogleGenAI`.
    (GoogleGenAI as vi.Mock).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      } as Models, // Cast the partial mock to Models
    }));

    mockConfig = {
      getGemmaModelRouterSettings: vi.fn().mockReturnValue({
        classifier: {
          host: 'http://test-host:1234',
          model: 'gemma:latest',
        },
      }),
    } as unknown as Config;
  });

  it('should throw an error if the model name does not start with "Gemma"', () => {
    vi.mocked(mockConfig.getGemmaModelRouterSettings).mockReturnValue({
      classifier: {
        model: 'invalid-model',
      },
    });
    expect(() => new LocalGeminiClient(mockConfig)).toThrow(
      'Invalid model name: invalid-model. Model name must start with "Gemma" (case-insensitive).',
    );
  });

  it('should successfully call generateJson and return parsed JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: `\`\`\`json
{"key": "value"}
\`\`\``,
    });

    const client = new LocalGeminiClient(mockConfig);
    const result = await client.generateJson([], 'test-instruction');

    expect(result).toEqual({ key: 'value' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemma:latest',
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          temperature: 0,
        }),
      }),
    );
  });

  it('should throw an error if the API response has no text', async () => {
    mockGenerateContent.mockResolvedValue({
      text: null,
    });

    const client = new LocalGeminiClient(mockConfig);
    await expect(client.generateJson([], 'test-instruction')).rejects.toThrow(
      'Invalid response from Local Gemini API: No text found',
    );
  });

  it('should clean and repair malformed JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: `{
  “key”: ‘value’,
}`, // Smart quotes, trailing comma
    });

    const client = new LocalGeminiClient(mockConfig);
    const result = await client.generateJson([], 'test-instruction');

    expect(result).toEqual({ key: 'value' });
  });

  it('should add reminder to the last user message', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"key": "value"}',
    });

    const client = new LocalGeminiClient(mockConfig);
    await client.generateJson(
      [{ role: 'user', parts: [{ text: 'initial prompt' }] }],
      'test-instruction',
      'test-reminder',
    );

    const calledContents =
      vi.mocked(mockGenerateContent).mock.calls[0][0].contents;
    expect(calledContents.at(-1)?.parts[0].text).toBe(
      `initial prompt

test-reminder`,
    );
  });
});
