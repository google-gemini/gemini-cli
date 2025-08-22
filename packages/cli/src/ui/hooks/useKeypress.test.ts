/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useKeypress, Key } from './useKeypress.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Mock the 'ink' module to control stdin
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

// Mock the 'readline' module
vi.mock('readline', () => {
  const mockedReadline = {
    createInterface: vi.fn().mockReturnValue({ close: vi.fn() }),
    // The paste workaround involves replacing stdin with a PassThrough stream.
    // This mock ensures that when emitKeypressEvents is called on that
    // stream, we simulate the 'keypress' events that the hook expects.
    emitKeypressEvents: vi.fn((stream: EventEmitter) => {
      if (stream instanceof PassThrough) {
        stream.on('data', (data) => {
          const str = data.toString();
          for (const char of str) {
            stream.emit('keypress', null, {
              name: char,
              sequence: char,
              ctrl: false,
              meta: false,
              shift: false,
            });
          }
        });
      }
    }),
  };
  return {
    ...mockedReadline,
    default: mockedReadline,
  };
});

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  on = this.addListener;
  removeListener = this.removeListener;
  write = vi.fn();
  resume = vi.fn();

  private isLegacy = false;

  setLegacy(isLegacy: boolean) {
    this.isLegacy = isLegacy;
  }

  // Helper to simulate a full paste event.
  paste(text: string) {
    if (this.isLegacy) {
      const PASTE_START = '\x1B[200~';
      const PASTE_END = '\x1B[201~';
      this.emit('data', Buffer.from(`${PASTE_START}${text}${PASTE_END}`));
    } else {
      this.emit('keypress', null, { name: 'paste-start' });
      this.emit('keypress', null, { sequence: text });
      this.emit('keypress', null, { name: 'paste-end' });
    }
  }

  // Helper to simulate the start of a paste, without the end.
  startPaste(text: string) {
    if (this.isLegacy) {
      this.emit('data', Buffer.from('\x1B[200~' + text));
    } else {
      this.emit('keypress', null, { name: 'paste-start' });
      this.emit('keypress', null, { sequence: text });
    }
  }

  // Helper to simulate a single keypress event.
  pressKey(key: Partial<Key>) {
    if (this.isLegacy) {
      this.emit('data', Buffer.from(key.sequence ?? ''));
    } else {
      this.emit('keypress', null, key);
    }
  }
}

describe('useKeypress', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();
  const onKeypress = vi.fn();
  let originalNodeVersion: string;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(KeypressProvider, null, children);

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as vi.Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });

    originalNodeVersion = process.versions.node;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    Object.defineProperty(process.versions, 'node', {
      value: originalNodeVersion,
      configurable: true,
    });
  });

  const setNodeVersion = (version: string) => {
    Object.defineProperty(process.versions, 'node', {
      value: version,
      configurable: true,
    });
  };

  it('should not listen if isActive is false', () => {
    renderHook(() => useKeypress(onKeypress, { isActive: false }), {
      wrapper,
    });
    act(() => stdin.pressKey({ name: 'a' }));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it.each([
    { key: { name: 'a', sequence: 'a' } },
    { key: { name: 'left', sequence: '\x1b[D' } },
    { key: { name: 'right', sequence: '\x1b[C' } },
    { key: { name: 'up', sequence: '\x1b[A' } },
    { key: { name: 'down', sequence: '\x1b[B' } },
  ])('should listen for keypress when active for key $key.name', ({ key }) => {
    renderHook(() => useKeypress(onKeypress, { isActive: true }), { wrapper });
    act(() => stdin.pressKey(key));
    expect(onKeypress).toHaveBeenCalledWith(expect.objectContaining(key));
  });

  it('should set and release raw mode', () => {
    const { unmount } = renderHook(
      () => useKeypress(onKeypress, { isActive: true }),
      { wrapper },
    );
    expect(mockSetRawMode).toHaveBeenCalledWith(true);
    unmount();
    expect(mockSetRawMode).toHaveBeenCalledWith(false);
  });

  it('should stop listening after being unmounted', () => {
    const { unmount } = renderHook(
      () => useKeypress(onKeypress, { isActive: true }),
      { wrapper },
    );
    unmount();
    act(() => stdin.pressKey({ name: 'a' }));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('should correctly identify alt+enter (meta key)', () => {
    renderHook(() => useKeypress(onKeypress, { isActive: true }), { wrapper });
    const key = { name: 'return', sequence: '\x1B\r' };
    act(() => stdin.pressKey(key));
    expect(onKeypress).toHaveBeenCalledWith(
      expect.objectContaining({ ...key, meta: true, paste: false }),
    );
  });

  describe.each([
    {
      description: 'Modern Node (>= v20)',
      setup: () => setNodeVersion('20.0.0'),
      isLegacy: false,
    },
    {
      description: 'Legacy Node (< v20)',
      setup: () => setNodeVersion('18.0.0'),
      isLegacy: true,
    },
    {
      description: 'Workaround Env Var',
      setup: () => {
        setNodeVersion('20.0.0');
        vi.stubEnv('PASTE_WORKAROUND', 'true');
      },
      isLegacy: true,
    },
  ])('in $description', ({ setup, isLegacy }) => {
    beforeEach(() => {
      setup();
      stdin.setLegacy(isLegacy);
    });

    it('should process a paste as a single event', () => {
      renderHook(() => useKeypress(onKeypress, { isActive: true }), {
        wrapper,
      });
      const pasteText = 'hello world';
      act(() => stdin.paste(pasteText));

      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: pasteText,
      });
    });

    it('should handle keypress interspersed with pastes', () => {
      renderHook(() => useKeypress(onKeypress, { isActive: true }), {
        wrapper,
      });

      const keyA = { name: 'a', sequence: 'a' };
      act(() => stdin.pressKey(keyA));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ ...keyA, paste: false }),
      );

      const pasteText = 'pasted';
      act(() => stdin.paste(pasteText));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText }),
      );

      const keyB = { name: 'b', sequence: 'b' };
      act(() => stdin.pressKey(keyB));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ ...keyB, paste: false }),
      );

      expect(onKeypress).toHaveBeenCalledTimes(3);
    });

    it('should emit partial paste content if unmounted mid-paste', () => {
      const { unmount } = renderHook(
        () => useKeypress(onKeypress, { isActive: true }),
        { wrapper },
      );
      const pasteText = 'incomplete paste';

      act(() => stdin.startPaste(pasteText));

      // No event should be fired yet.
      expect(onKeypress).not.toHaveBeenCalled();

      // Unmounting should trigger the flush.
      unmount();

      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: pasteText,
      });
    });
  });
});
