/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { GeminiClient } from '../core/client.js';
import {
  DEFAULT_FLASH_LITE_MODEL_CONFIG_KEY,
  generateFlashLiteText,
  truncateFlashLiteInput,
  generateSteeringAckMessage,
} from './flashLiteHelper.js';

describe('truncateFlashLiteInput', () => {
  it('returns input as-is when below limit', () => {
    expect(truncateFlashLiteInput('hello', 10)).toBe('hello');
  });

  it('truncates and appends suffix when above limit', () => {
    const input = 'abcdefghijklmnopqrstuvwxyz';
    const result = truncateFlashLiteInput(input, 20);
    expect(result.length).toBe(20);
    expect(result).toContain('...[truncated]');
  });
});

describe('generateFlashLiteText', () => {
  const abortSignal = new AbortController().signal;

  it('uses the default flash-lite helper model config and returns response text', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ text: '  Got it. Skipping #2.  ' }] } },
        ],
      }),
    } as unknown as GeminiClient;

    const result = await generateFlashLiteText(geminiClient, {
      instruction: 'Write a short acknowledgement sentence.',
      input: 'skip #2',
      fallbackText: 'Got it.',
      abortSignal,
    });

    expect(result).toBe('Got it. Skipping #2.');
    expect(geminiClient.generateContent).toHaveBeenCalledWith(
      DEFAULT_FLASH_LITE_MODEL_CONFIG_KEY,
      expect.any(Array),
      abortSignal,
    );
  });

  it('returns fallback text when response text is empty', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockResolvedValue({}),
    } as unknown as GeminiClient;

    const result = await generateFlashLiteText(geminiClient, {
      instruction: 'Return one sentence.',
      input: 'cancel task 2',
      fallbackText: 'Understood. Cancelling task 2.',
      abortSignal,
    });

    expect(result).toBe('Understood. Cancelling task 2.');
  });

  it('returns fallback text when generation throws', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as GeminiClient;

    const result = await generateFlashLiteText(geminiClient, {
      instruction: 'Return one sentence.',
      input: 'cancel task 2',
      fallbackText: 'Understood.',
      abortSignal,
    });

    expect(result).toBe('Understood.');
  });

  it('truncates the input before sending to the model', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Ack.' }] } }],
      }),
    } as unknown as GeminiClient;

    const longInput = 'x'.repeat(200);
    await generateFlashLiteText(geminiClient, {
      instruction: 'Return one sentence.',
      input: longInput,
      fallbackText: 'Understood.',
      abortSignal,
      maxInputChars: 64,
    });

    const [, contents] = (
      geminiClient.generateContent as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    const promptText = contents[0].parts[0].text as string;
    expect(promptText).toContain('...[truncated]');
  });
});

describe('generateSteeringAckMessage', () => {
  it('returns a shortened acknowledgement using flash-lite-helper', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Got it. I will focus on the tests now.' }],
            },
          },
        ],
      }),
    } as unknown as GeminiClient;

    const result = await generateSteeringAckMessage(
      geminiClient,
      'focus on tests',
    );
    expect(result).toBe('Got it. I will focus on the tests now.');
  });

  it('returns a fallback message if the model fails', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as GeminiClient;

    const result = await generateSteeringAckMessage(
      geminiClient,
      'a very long hint that should be truncated in the fallback message if it was longer but it is not',
    );
    expect(result).toContain('Understood. a very long hint');
  });

  it('returns a very simple fallback if hint is empty', async () => {
    const geminiClient = {
      generateContent: vi.fn().mockRejectedValue(new Error('error')),
    } as unknown as GeminiClient;

    const result = await generateSteeringAckMessage(geminiClient, '   ');
    expect(result).toBe('Understood. Adjusting the plan.');
  });
});
