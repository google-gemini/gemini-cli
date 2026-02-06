/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalGeminiClient } from './localGeminiClient.js';
import type { Config } from '../config/config.js';
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  const GoogleGenAI = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  }));
  return { GoogleGenAI };
});

describe('LocalGeminiClient', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockClear();

    mockConfig = {
      getGemmaModelRouterSettings: vi.fn().mockReturnValue({
        classifier: {
          host: 'http://test-host:1234',
          model: 'gemma:latest',
        },
      }),
    } as unknown as Config;
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
