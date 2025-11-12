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

// Mock the 'ink' module to control stdin
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

  describe('SGR Mouse Events', () => {
    it.each([
      {
        sequence: '\x1b[<0;10;20M',
        expected: {
          name: 'left-press',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<0;10;20m',
        expected: {
          name: 'left-release',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<2;10;20M',
        expected: {
          name: 'right-press',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<1;10;20M',
        expected: {
          name: 'middle-press',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<64;10;20M',
        expected: {
          name: 'scroll-up',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<65;10;20M',
        expected: {
          name: 'scroll-down',
          ctrl: false,
          meta: false,
          shift: false,
        },
      },
      {
        sequence: '\x1b[<32;10;20M',
        expected: {
          name: 'move',
          ctrl: false,
          meta: false,
          shift: false,
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
        expected: { name: 'left-press', ctrl: true, shift: true },
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
});
