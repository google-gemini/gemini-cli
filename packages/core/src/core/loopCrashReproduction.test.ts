/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from './client.js';
import { GeminiEventType } from './turn.js';
import { createGeminiConfigMock } from '../test-utils/configMock.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

describe('GeminiClient', () => {
  let client: GeminiClient;
  let config: any;
  let mockChat: any;

  beforeEach(() => {
    config = createGeminiConfigMock();

    const baseChat = {
      getHistory: vi.fn().mockReturnValue([]),
      getLastPromptTokenCount: vi.fn().mockReturnValue(0),
      sendMessageStream: vi.fn(),
      addHistory: vi.fn(),
      setTools: vi.fn(),
      maybeIncludeSchemaDepthContext: vi.fn().mockResolvedValue(undefined),
    };

    mockChat = new Proxy(baseChat, {
      get: (target, prop) => (prop in target ? (target as any)[prop] : vi.fn()),
    });

    client = new GeminiClient(config);
    (client as any).chat = mockChat;
    (client as any).loopDetector = new LoopDetectionService(config);
  });

  const createAbortError = () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  };

  describe('loop and abort handling', () => {
    it('should stop the turn when a content loop is detected', async () => {
      const controller = new AbortController();
      // Increase repetition to ensure it exceeds the threshold (10 chunks of 50 chars)
      const repetitiveText =
        'I am stuck in a loop. I am stuck in a loop. '.repeat(100);
      const repetitiveChunks: string[] = [];
      for (let i = 0; i < repetitiveText.length; i += 10) {
        repetitiveChunks.push(repetitiveText.slice(i, i + 10));
      }

      async function* mockStream(signal: AbortSignal) {
        // Mimic the SDK's vulnerable behavior: synchronous throw on abort signal propagation.
        signal.addEventListener(
          'abort',
          () => {
            throw createAbortError();
          },
          { once: true },
        );

        for (const chunk of repetitiveChunks) {
          if (signal.aborted) throw createAbortError();
          yield {
            type: 'chunk',
            value: { candidates: [{ content: { parts: [{ text: chunk }] } }] },
          };
        }
      }

      mockChat.sendMessageStream.mockImplementation(
        (_c: any, _r: any, _p: any, signal: AbortSignal) => mockStream(signal),
      );

      const events: any[] = [];
      for await (const event of client.sendMessageStream(
        [{ text: 'Trigger loop' }],
        controller.signal,
        'loop-id',
      )) {
        events.push(event);
      }

      expect(events.some((e) => e.type === GeminiEventType.LoopDetected)).toBe(
        true,
      );
    });

    it('should not call sendMessageStream if the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const stream = client.sendMessageStream(
        [{ text: 'Hello' }],
        controller.signal,
        'pre-abort-id',
      );
      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(mockChat.sendMessageStream).not.toHaveBeenCalled();
      expect(events.length).toBe(0);
    });

    it('should handle manual cancellation gracefully without process instability', async () => {
      const controller = new AbortController();

      async function* mockStream(signal: AbortSignal) {
        signal.addEventListener(
          'abort',
          () => {
            // This mimicking of SDK behavior is what used to cause the crash!
            throw createAbortError();
          },
          { once: true },
        );

        yield {
          type: 'chunk',
          value: {
            candidates: [{ content: { parts: [{ text: 'Chunk 1' }] } }],
          },
        };

        // Simulating some async work
        await new Promise((r) => setTimeout(r, 10));

        if (signal.aborted) throw createAbortError();
        yield {
          type: 'chunk',
          value: {
            candidates: [{ content: { parts: [{ text: 'Chunk 2' }] } }],
          },
        };
      }

      mockChat.sendMessageStream.mockImplementation(
        (_c: any, _r: any, _p: any, signal: AbortSignal) => mockStream(signal),
      );

      // We just need to prove that we can consume the stream and abort without an unhandled exception crashing the test runner.
      const events: any[] = [];
      const stream = client.sendMessageStream(
        [{ text: 'Hello' }],
        controller.signal,
        'manual-cancel-id',
      );
      for await (const event of stream) {
        events.push(event);
        controller.abort(); // Trigger the 'explosion'! 💣
      }

      // The fact that we reached here means the process didn't crash.
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
