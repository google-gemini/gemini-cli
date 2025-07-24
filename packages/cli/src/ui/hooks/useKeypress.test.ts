/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useKeypress, Key } from './useKeypress.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { BACKSLASH_ENTER_DETECTION_WINDOW_MS } from '../utils/platformConstants.js';

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
      // Ensure all required Key properties are present
      const fullKey: Key = {
        name: key.name ?? '',
        ctrl: key.ctrl ?? false,
        meta: key.meta ?? false,
        shift: key.shift ?? false,
        paste: key.paste ?? false,
        sequence: key.sequence ?? '',
        ...key,
      };
      this.emit('keypress', null, fullKey);
    }
  }
}

describe('useKeypress', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();
  const onKeypress = vi.fn();
  let originalNodeVersion: string;

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as vi.Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });

    originalNodeVersion = process.versions.node;
    delete process.env['PASTE_WORKAROUND'];
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
    renderHook(() => useKeypress(onKeypress, { isActive: false }));
    act(() => stdin.pressKey({ name: 'a' }));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('should listen for keypress when active', () => {
    renderHook(() => useKeypress(onKeypress, { isActive: true }));
    const key = { name: 'a', sequence: 'a' };
    act(() => stdin.pressKey(key));
    expect(onKeypress).toHaveBeenCalledWith(expect.objectContaining(key));
  });

  it('should set and release raw mode', () => {
    const { unmount } = renderHook(() =>
      useKeypress(onKeypress, { isActive: true }),
    );
    expect(mockSetRawMode).toHaveBeenCalledWith(true);
    unmount();
    expect(mockSetRawMode).toHaveBeenCalledWith(false);
  });

  it('should stop listening after being unmounted', () => {
    const { unmount } = renderHook(() =>
      useKeypress(onKeypress, { isActive: true }),
    );
    unmount();
    act(() => stdin.pressKey({ name: 'a' }));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('should correctly identify alt+enter (meta key)', () => {
    renderHook(() => useKeypress(onKeypress, { isActive: true }));
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
        process.env['PASTE_WORKAROUND'] = 'true';
      },
      isLegacy: true,
    },
  ])('Paste Handling in $description', ({ setup, isLegacy }) => {
    beforeEach(() => {
      setup();
      stdin.setLegacy(isLegacy);
    });

    it('should process a paste as a single event', () => {
      renderHook(() => useKeypress(onKeypress, { isActive: true }));
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
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

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
      const { unmount } = renderHook(() =>
        useKeypress(onKeypress, { isActive: true }),
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

  describe('Kitty Keyboard Protocol', () => {
    it('should parse Kitty protocol Shift+Enter sequence', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      act(() => {
        stdin.pressKey({ sequence: '\x1b[13;2u' });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'return',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: '\x1b[13;2u',
        kittyProtocol: true,
      });
    });

    it('should parse Kitty protocol Ctrl+Enter sequence', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      act(() => {
        stdin.pressKey({ sequence: '\x1b[13;5u' });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'return',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[13;5u',
        kittyProtocol: true,
      });
    });

    it('should parse Kitty protocol Ctrl+C sequence', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      act(() => {
        stdin.pressKey({ sequence: '\x1b[99;5u' });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'c',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[99;5u',
        kittyProtocol: true,
      });
    });

    it('should handle partial Kitty sequences by buffering', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      // Send partial sequence
      act(() => {
        stdin.pressKey({ sequence: '\x1b[13' });
      });
      expect(onKeypress).not.toHaveBeenCalled();

      // Complete the sequence
      act(() => {
        stdin.pressKey({ sequence: ';2u' });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'return',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
        sequence: '\x1b[13;2u',
        kittyProtocol: true,
      });
    });

    it('should pass through non-Kitty sequences when Kitty protocol is enabled', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      act(() => {
        stdin.pressKey({
          name: 'a',
          sequence: 'a',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'a',
        sequence: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });
    });

    it('should not parse Kitty sequences when protocol is disabled', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, {
          isActive: true,
          kittyProtocolEnabled: false,
        }),
      );

      act(() => {
        stdin.pressKey({ sequence: '\x1b[13;2u' });
      });

      // Should pass through as raw sequence
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({
          sequence: '\x1b[13;2u',
          paste: false,
        }),
      );
      expect(onKeypress).not.toHaveBeenCalledWith(
        expect.objectContaining({
          kittyProtocol: true,
        }),
      );
    });

    it('should handle Ctrl+C immediately in both standard and Kitty format', () => {
      const onKeypress = vi.fn();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true, kittyProtocolEnabled: true }),
      );

      // Standard Ctrl+C
      act(() => {
        stdin.pressKey({
          name: 'c',
          sequence: '\x03',
          ctrl: true,
          meta: false,
          shift: false,
        });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'c',
        sequence: '\x03',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
      });

      onKeypress.mockClear();

      // Kitty protocol Ctrl+C
      act(() => {
        stdin.pressKey({ sequence: '\x1b[99;5u' });
      });

      expect(onKeypress).toHaveBeenCalledWith({
        name: 'c',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[99;5u',
        kittyProtocol: true,
      });
    });
  });

  describe('VS Code Terminal Support', () => {
    it('should convert backslash+return to Shift+Enter', () => {
      const onKeypress = vi.fn();
      vi.useFakeTimers();
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      // First send backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Backslash should NOT be passed through immediately (held for detection)
      expect(onKeypress).not.toHaveBeenCalled();

      // Then send return within the detection window
      act(() => {
        stdin.pressKey({
          name: 'return',
          sequence: '\r',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Should be converted to Shift+Enter (only one call total)
      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: 'return',
        sequence: '\\\r',
        ctrl: false,
        meta: false,
        shift: true,
        paste: false,
      });

      vi.useRealTimers();
    });

    it('should not convert non-backslash+return sequences', () => {
      const onKeypress = vi.fn();
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      // Send 'a' then return
      act(() => {
        stdin.pressKey({
          name: 'a',
          sequence: 'a',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      onKeypress.mockClear();

      act(() => {
        stdin.pressKey({
          name: 'return',
          sequence: '\r',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Should not be converted
      expect(onKeypress).toHaveBeenCalledWith({
        name: 'return',
        sequence: '\r',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });
    });

    it('should pass through backslash when not followed by return', () => {
      const onKeypress = vi.fn();
      vi.useFakeTimers();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true }),
      );

      // Send backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Backslash should NOT be passed through immediately (held for detection)
      expect(onKeypress).not.toHaveBeenCalled();

      // Wait more than the detection window
      act(() => {
        vi.advanceTimersByTime(BACKSLASH_ENTER_DETECTION_WINDOW_MS + 5);
      });

      // After timeout, backslash should be passed through
      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: undefined,
        sequence: '\\',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      // Send 'a' after timeout
      act(() => {
        stdin.pressKey({
          name: 'a',
          sequence: 'a',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // 'a' should be passed through normally
      expect(onKeypress).toHaveBeenCalledTimes(2);
      expect(onKeypress).toHaveBeenNthCalledWith(2, {
        name: 'a',
        sequence: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      vi.useRealTimers();
    });

    it('should handle backslash without follow-up character gracefully', () => {
      const onKeypress = vi.fn();
      vi.useFakeTimers();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true }),
      );

      // Send backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Backslash should NOT be passed through immediately (held for detection)
      expect(onKeypress).not.toHaveBeenCalled();

      // Simulate a delay longer than the detection window (timeout scenario)
      act(() => {
        vi.advanceTimersByTime(BACKSLASH_ENTER_DETECTION_WINDOW_MS + 5);
      });

      // After timeout, backslash should be passed through
      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: undefined,
        sequence: '\\',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });
      
      // Send a different key after timeout
      act(() => {
        stdin.pressKey({
          name: 'x',
          sequence: 'x',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // 'x' should be passed through normally (not as Shift+Enter)
      expect(onKeypress).toHaveBeenCalledTimes(2);
      expect(onKeypress).toHaveBeenNthCalledWith(2, {
        name: 'x',
        sequence: 'x',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      vi.useRealTimers();
    });

    it('should handle multiple consecutive backslashes correctly', () => {
      const onKeypress = vi.fn();
      vi.useFakeTimers();
      renderHook(() =>
        useKeypress(onKeypress, { isActive: true }),
      );

      // Send first backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // First backslash should be passed through immediately
      expect(onKeypress).toHaveBeenCalledTimes(1);
      expect(onKeypress).toHaveBeenCalledWith({
        name: undefined,
        sequence: '\\',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      // Send second backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Second backslash should also be passed through immediately
      expect(onKeypress).toHaveBeenCalledTimes(2);
      expect(onKeypress).toHaveBeenNthCalledWith(2, {
        name: undefined,
        sequence: '\\',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      // Send a regular key
      act(() => {
        stdin.pressKey({
          name: 'a',
          sequence: 'a',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // 'a' should be passed through normally
      expect(onKeypress).toHaveBeenCalledTimes(3);
      expect(onKeypress).toHaveBeenNthCalledWith(3, {
        name: 'a',
        sequence: 'a',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });

      vi.useRealTimers();
    });

    it('should not convert backslash+return to Shift+Enter after timeout', () => {
      const onKeypress = vi.fn();
      vi.useFakeTimers();
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      // Send backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Backslash should NOT be passed through immediately (held for detection)
      expect(onKeypress).not.toHaveBeenCalled();

      // Wait more than the detection window
      act(() => {
        vi.advanceTimersByTime(BACKSLASH_ENTER_DETECTION_WINDOW_MS + 5);
      });

      // After timeout, backslash should be passed through
      expect(onKeypress).toHaveBeenCalledTimes(1);

      // Send return after timeout
      act(() => {
        stdin.pressKey({
          name: 'return',
          sequence: '\r',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Return should NOT be converted to Shift+Enter
      expect(onKeypress).toHaveBeenCalledTimes(2);
      expect(onKeypress).toHaveBeenNthCalledWith(2, {
        name: 'return',
        sequence: '\r',
        ctrl: false,
        meta: false,
        shift: false, // NOT shift: true
        paste: false,
      });

      vi.useRealTimers();
    });

    it('should pass through backslash when followed immediately by non-Enter key', () => {
      const onKeypress = vi.fn();
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      // Send backslash
      act(() => {
        stdin.pressKey({
          name: undefined,
          sequence: '\\',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Backslash should NOT be passed through immediately (held for detection)
      expect(onKeypress).not.toHaveBeenCalled();

      // Immediately send 'n' (not Enter)
      act(() => {
        stdin.pressKey({
          name: 'n',
          sequence: 'n',
          ctrl: false,
          meta: false,
          shift: false,
        });
      });

      // Both backslash and 'n' should be passed through
      expect(onKeypress).toHaveBeenCalledTimes(2);
      expect(onKeypress).toHaveBeenNthCalledWith(1, {
        name: '',
        sequence: '\\',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });
      expect(onKeypress).toHaveBeenNthCalledWith(2, {
        name: 'n',
        sequence: 'n',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
      });
    });
  });
});
