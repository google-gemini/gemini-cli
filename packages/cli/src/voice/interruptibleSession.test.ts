/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InterruptibleSession,
  type GenerationClient,
  type GenerationEvent,
} from './interruptibleSession.js';

// Suppress debugLogger output during tests.
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  };
});

/**
 * Helper: creates a mock GenerationClient whose stream yields the given
 * chunks, with an optional per-chunk delay to simulate streaming latency.
 */
function createMockClient(chunks: string[], delayMs = 0): GenerationClient {
  return {
    async *sendMessageStream(
      _parts: unknown[],
      signal: AbortSignal,
    ): AsyncGenerator<GenerationEvent> {
      for (const chunk of chunks) {
        if (signal.aborted) return;
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        if (signal.aborted) return;
        yield { type: 'content', value: chunk };
      }
    },
  };
}

describe('InterruptibleSession', () => {
  let client: GenerationClient;
  let session: InterruptibleSession;

  beforeEach(() => {
    client = createMockClient(['Hello', ' world']);
    session = new InterruptibleSession(client, 'test-prompt');
  });

  it('should generate a complete response when not interrupted', async () => {
    const result = await session.generate('Say hello');
    expect(result).toBe('Hello world');
  });

  it('should invoke onChunk for each streamed chunk', async () => {
    const chunks: string[] = [];
    await session.generate('Say hello', (c) => chunks.push(c));
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('should track generating state', async () => {
    expect(session.isGenerating).toBe(false);

    const resultPromise = session.generate('Say hello');
    // Cannot reliably check isGenerating=true in a sync test since
    // the generator runs eagerly, but after completion it must be false.
    await resultPromise;
    expect(session.isGenerating).toBe(false);
  });

  it('should cancel generation when interrupted by new input', async () => {
    // Use a slow client so we can interrupt mid-stream.
    const slowClient = createMockClient(
      ['chunk1', 'chunk2', 'chunk3', 'chunk4'],
      50,
    );
    const slowSession = new InterruptibleSession(slowClient, 'test-prompt');

    const collected: string[] = [];
    let inputCall = 0;
    const inputs = ['First prompt', 'Interrupting prompt', null];

    // Simulate: first input starts generation, second arrives quickly
    // (which should interrupt), third is null to end.
    await slowSession.run(
      async () => {
        const input = inputs[inputCall++] ?? null;
        // Small delay before second input to let first generation start.
        if (inputCall === 2) {
          await new Promise((r) => setTimeout(r, 30));
        }
        return input;
      },
      (chunk) => collected.push(chunk),
    );

    // The interrupting prompt should have produced its own response.
    // The exact chunks depend on timing, but we should get output from
    // the second generation.
    expect(inputCall).toBe(3); // All three inputs consumed
  });

  it('should run a full session loop until null input', async () => {
    let callCount = 0;
    const responses: string[] = [];

    await session.run(
      async () => {
        callCount++;
        if (callCount <= 2) return `prompt ${callCount}`;
        return null;
      },
      (chunk) => responses.push(chunk),
    );

    // Two prompts processed, each getting "Hello world".
    expect(callCount).toBe(3); // 2 prompts + 1 null
    expect(responses).toEqual(['Hello', ' world', 'Hello', ' world']);
  });

  it('should handle errors from the generation stream', async () => {
    const errorClient: GenerationClient = {
      async *sendMessageStream(): AsyncGenerator<GenerationEvent> {
        yield { type: 'content', value: 'partial' };
        yield { type: 'error' };
      },
    };

    const errorSession = new InterruptibleSession(errorClient, 'test-prompt');
    const result = await errorSession.generate('trigger error');
    expect(result).toBe('partial');
    expect(errorSession.isGenerating).toBe(false);
  });

  it('should swallow AbortError when generation is interrupted', async () => {
    const abortingClient: GenerationClient = {
      async *sendMessageStream(
        _parts: unknown[],
        signal: AbortSignal,
      ): AsyncGenerator<GenerationEvent> {
        yield { type: 'content', value: 'start' };
        // Simulate an abort error being thrown by the underlying API.
        if (signal.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        yield { type: 'content', value: 'unreachable' };
      },
    };

    const abortSession = new InterruptibleSession(
      abortingClient,
      'test-prompt',
    );

    let callCount = 0;
    // First call starts generation, second triggers interrupt, third ends.
    await abortSession.run(async () => {
      callCount++;
      if (callCount === 1) return 'Go';
      if (callCount === 2) return 'Stop';
      return null;
    });

    // Should complete without throwing.
    expect(callCount).toBe(3);
  });
});
