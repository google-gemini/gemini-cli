/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { CustomBaseUrlContentGenerator } from './customBaseUrlContentGenerator.js';
import { LlmRole } from '../telemetry/llmRole.js';
import type { ContentGenerator } from './contentGenerator.js';

describe('CustomBaseUrlContentGenerator', () => {
  it('adapts generateContent to a single-chunk stream', async () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'custom base url response' }],
          },
          finishReason: 'STOP',
        },
      ],
    } as unknown as GenerateContentResponse;
    const wrapped = {
      generateContent: vi.fn().mockResolvedValue(response),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    } as unknown as ContentGenerator;
    const generator = new CustomBaseUrlContentGenerator(wrapped);
    const request = {
      model: 'test-model',
      contents: 'test prompt',
    } as GenerateContentParameters;

    const stream = await generator.generateContentStream(
      request,
      'prompt-id',
      LlmRole.MAIN,
    );
    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(wrapped.generateContent).toHaveBeenCalledWith(
      request,
      'prompt-id',
      LlmRole.MAIN,
    );
    expect(wrapped.generateContentStream).not.toHaveBeenCalled();
    expect(chunks).toEqual([response]);
  });

  it('propagates upstream errors from generateContent', async () => {
    const error = new Error('Bad Request');
    const wrapped = {
      generateContent: vi.fn().mockRejectedValue(error),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    } as unknown as ContentGenerator;
    const generator = new CustomBaseUrlContentGenerator(wrapped);

    await expect(
      generator.generateContentStream(
        {
          model: 'bad-model',
          contents: 'test prompt',
        } as GenerateContentParameters,
        'prompt-id',
        LlmRole.MAIN,
      ),
    ).rejects.toThrow(error);
    expect(wrapped.generateContentStream).not.toHaveBeenCalled();
  });
});
