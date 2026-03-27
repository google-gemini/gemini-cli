/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useBtw } from './useBtw.js';
import { type GeminiClient, GeminiEventType } from '@google/gemini-cli-core';

describe('useBtw', () => {
  let mockGeminiClient: {
    sendBtwStream: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGeminiClient = {
      sendBtwStream: vi.fn(),
    };
  });

  it('should initialize with inactive state', async () => {
    const { result } = await renderHook(() =>
      useBtw(mockGeminiClient as unknown as GeminiClient),
    );
    expect(result.current.isActive).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.response).toBe('');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should update state during streaming', async () => {
    let resolveStream: (value: void) => void;
    const streamGate = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    const mockStream = (async function* () {
      yield { type: GeminiEventType.Content, value: 'Hello' };
      await streamGate;
      yield { type: GeminiEventType.Content, value: ' world' };
      yield { type: GeminiEventType.Finished, value: { reason: 'STOP' } };
    })();
    mockGeminiClient.sendBtwStream.mockReturnValue(mockStream);

    const { result } = await renderHook(() =>
      useBtw(mockGeminiClient as unknown as GeminiClient),
    );

    let submitPromise!: Promise<void>;
    await act(async () => {
      submitPromise = result.current.submitBtw('test query');
    });

    // Check immediate state (it should be streaming because of streamGate)
    expect(result.current.isActive).toBe(true);
    expect(result.current.query).toBe('test query');
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.response).toBe('Hello');

    await act(async () => {
      resolveStream();
      await submitPromise;
    });

    // Check final state
    expect(result.current.response).toBe('Hello world');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle errors', async () => {
    const mockStream = (async function* () {
      yield {
        type: GeminiEventType.Error,
        value: { error: { message: 'API Error' } },
      };
    })();
    mockGeminiClient.sendBtwStream.mockReturnValue(mockStream);

    const { result } = await renderHook(() =>
      useBtw(mockGeminiClient as unknown as GeminiClient),
    );

    await act(async () => {
      await result.current.submitBtw('test query');
    });

    expect(result.current.error).toBe('API Error');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should reset state on dismiss', async () => {
    const mockStream = (async function* () {
      yield { type: GeminiEventType.Content, value: 'partial' };
      // Hang
      await new Promise(() => {});
    })();
    mockGeminiClient.sendBtwStream.mockReturnValue(mockStream);

    const { result } = await renderHook(() =>
      useBtw(mockGeminiClient as unknown as GeminiClient),
    );

    act(() => {
      void result.current.submitBtw('test query');
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.dismissBtw();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.response).toBe('');
  });
});
