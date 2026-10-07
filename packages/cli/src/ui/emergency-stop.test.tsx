/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act } from 'react';
import { EventEmitter } from 'node:events';
import { useStdin } from 'ink';
import { renderHookWithProviders } from '../test-utils/render.js';
import {
  useKeypressContext,
  ESC_TIMEOUT,
  KeypressPriority,
  type Key,
} from './contexts/KeypressContext.js';

// Mock ink's useStdin to feed custom stdin bytes
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  override on = this.addListener;
  override removeListener = super.removeListener;
  resume = vi.fn();
  pause = vi.fn();

  write(text: string) {
    this.emit('data', text);
  }
}

describe('Emergency Stop & Input Handling Fixes (b/561556027)', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  describe('Fix 1: SGR Mouse Hijack & Stdin Race Condition Traps Emergency Ctrl+C', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('reliably emits Ctrl+C when an incomplete SGR mouse sequence was received prior to timeout', async () => {
      const keyHandler = vi.fn();
      const { result } = await renderHookWithProviders(() =>
        useKeypressContext(),
      );
      act(() => result.current.subscribe(keyHandler, KeypressPriority.High));

      // 1. Terminal or touch event sends a fragmented SGR mouse sequence:
      // \x1b[<0;10; (missing the row coordinate and terminator 'M' or 'm')
      act(() => {
        stdin.write('\x1b[<0;10;');
      });

      // 2. Timeout expires (ESC_TIMEOUT = 50ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ESC_TIMEOUT);
      });

      // 3. User attempts Emergency Stop by pressing Ctrl+C (\x03)
      act(() => {
        stdin.write('\x03');
      });

      // The application MUST receive a valid Ctrl+C key event to abort the agent.
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'c',
          ctrl: true,
        }),
      );
    });
  });

  describe('Fix 2: Runaway Agent "No Brakes" - Ctrl+C propagation during generation', () => {
    it('allows Ctrl+C to propagate to cancellation handlers when generating even if text buffer has input', async () => {
      const { result: contextResult } = await renderHookWithProviders(() =>
        useKeypressContext(),
      );

      const cancelOngoingRequestMock = vi.fn();
      let isGenerating = true;

      // Outer handler (simulating AppContainer or stream cancellation hook)
      act(() => {
        contextResult.current.subscribe((key: Key) => {
          if (key.ctrl && key.name === 'c') {
            cancelOngoingRequestMock();
            return true;
          }
          return false;
        }, KeypressPriority.High);
      });

      // Inner handler (simulating InputPrompt mounted after AppContainer)
      act(() => {
        contextResult.current.subscribe((key: Key) => {
          // If generating, do not swallow Ctrl+C into local input buffer
          if (isGenerating && key.ctrl && key.name === 'c') {
            return false;
          }
          // Otherwise consume locally (simulating CLEAR_INPUT)
          return true;
        }, KeypressPriority.High);
      });

      // Press Ctrl+C while generating
      act(() => {
        stdin.write('\x03');
      });

      // cancelOngoingRequestMock MUST be called!
      expect(cancelOngoingRequestMock).toHaveBeenCalledTimes(1);

      // Now simulate generation finished (idle)
      isGenerating = false;
      cancelOngoingRequestMock.mockClear();

      // Press Ctrl+C when idle: consumed locally by buffer handler
      act(() => {
        stdin.write('\x03');
      });

      expect(cancelOngoingRequestMock).not.toHaveBeenCalled();
    });
  });
});
