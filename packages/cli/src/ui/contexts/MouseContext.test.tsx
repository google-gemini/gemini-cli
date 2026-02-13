/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { MouseProvider, useMouseContext, useMouse } from './MouseContext.js';
import { vi, type Mock } from 'vitest';
import type React from 'react';
import { useStdin } from 'ink';
import { EventEmitter } from 'node:events';
import { appEvents, AppEvent } from '../../utils/events.js';

// Mock the 'ink' module to control stdin
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

// Mock appEvents
vi.mock('../../utils/events.js', () => ({
  appEvents: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  AppEvent: {
    SelectionWarning: 'selection-warning',
  },
}));

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

describe('MouseContext', () => {
  let stdin: MockStdin;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: vi.fn(),
    });
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <MouseProvider mouseEventsEnabled={true}>{children}</MouseProvider>
    );
    vi.mocked(appEvents.emit).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should subscribe and unsubscribe a handler', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      result.current.subscribe(handler);
    });

    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    expect(handler).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.unsubscribe(handler);
    });

    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not call handler if not active', () => {
    const handler = vi.fn();
    renderHook(() => useMouse(handler, { isActive: false }), {
      wrapper,
    });

    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should emit SelectionWarning when move event is unhandled and has coordinates', () => {
    renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      // Move event (32) at 10, 20
      stdin.write('\x1b[<32;10;20M');
    });

    expect(appEvents.emit).toHaveBeenCalledWith(AppEvent.SelectionWarning);
  });

  it('should not emit SelectionWarning when move event is handled', () => {
    const handler = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      result.current.subscribe(handler);
    });

    act(() => {
      // Move event (32) at 10, 20
      stdin.write('\x1b[<32;10;20M');
    });

    expect(handler).toHaveBeenCalled();
    expect(appEvents.emit).not.toHaveBeenCalled();
  });

  describe('SGR Mouse Events', () => {
    it.each([
      {
        sequence: '\x1b[<0;10;20M',
        expected: {
          name: 'left-press',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<0;10;20m',
        expected: {
          name: 'left-release',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<2;10;20M',
        expected: {
          name: 'right-press',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<1;10;20M',
        expected: {
          name: 'middle-press',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<64;10;20M',
        expected: {
          name: 'scroll-up',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<65;10;20M',
        expected: {
          name: 'scroll-down',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<32;10;20M',
        expected: {
          name: 'move',
          shift: false,
          ctrl: false,
          meta: false,
        },
      },
      {
        sequence: '\x1b[<4;10;20M',
        expected: { name: 'left-press', shift: true },
      }, // Shift + left press
      {
        sequence: '\x1b[<8;10;20M',
        expected: { name: 'left-press', meta: true },
      }, // Alt + left press
      {
        sequence: '\x1b[<20;10;20M',
        expected: { name: 'left-press', shift: true, ctrl: true },
      }, // Ctrl + Shift + left press
      {
        sequence: '\x1b[<68;10;20M',
        expected: { name: 'scroll-up', shift: true },
      }, // Shift + scroll up
    ])(
      'should recognize sequence "$sequence" as $expected.name',
      ({ sequence, expected }) => {
        const mouseHandler = vi.fn();
        const { result } = renderHook(() => useMouseContext(), { wrapper });
        act(() => result.current.subscribe(mouseHandler));

        act(() => stdin.write(sequence));

        expect(mouseHandler).toHaveBeenCalledWith(
          expect.objectContaining({ ...expected }),
        );
      },
    );
  });

  it('should emit a double-click event when two left-presses occur quickly at the same position', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      result.current.subscribe(handler);
    });

    // First click
    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'left-press', col: 10, row: 20 }),
    );

    // Second click (within threshold)
    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    // Should have called for the second left-press AND the double-click
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'double-click', col: 10, row: 20 }),
    );
  });

  it('should NOT emit a double-click event if clicks are too far apart', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      result.current.subscribe(handler);
    });

    // First click
    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    // Second click (too far)
    act(() => {
      stdin.write('\x1b[<0;15;25M');
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'double-click' }),
    );
  });

  it('should NOT emit a double-click event if too much time passes', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const { result } = renderHook(() => useMouseContext(), { wrapper });

    act(() => {
      result.current.subscribe(handler);
    });

    // First click
    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    await act(async () => {
      vi.advanceTimersByTime(500); // Threshold is 400ms
    });

    // Second click
    act(() => {
      stdin.write('\x1b[<0;10;20M');
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'double-click' }),
    );
    vi.useRealTimers();
  });
});
