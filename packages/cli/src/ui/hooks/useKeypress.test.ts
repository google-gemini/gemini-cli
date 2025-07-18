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
  let originalPlatform: string | undefined;
  let originalGeminiCtrlBackspaceEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as vi.Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });

    originalNodeVersion = process.versions.node;
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    originalGeminiCtrlBackspaceEnv = process.env.GEMINI_CLI_CTRL_BACKSPACE_MODE;
    delete process.env['PASTE_WORKAROUND'];
    delete process.env['GEMINI_CLI_CTRL_BACKSPACE_MODE'];
  });

  afterEach(() => {
    Object.defineProperty(process.versions, 'node', {
      value: originalNodeVersion,
      configurable: true,
    });

    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }

    delete process.env.GEMINI_CLI_CTRL_BACKSPACE_MODE;
    if (originalGeminiCtrlBackspaceEnv !== undefined) {
      process.env.GEMINI_CLI_CTRL_BACKSPACE_MODE =
        originalGeminiCtrlBackspaceEnv;
    }
  });

  const setNodeVersion = (version: string) => {
    Object.defineProperty(process.versions, 'node', {
      value: version,
      configurable: true,
    });
  };

  const setPlatform = (platform: string) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  };

  const setCtrlBackspaceMode = (value: string | undefined) => {
    if (value === undefined) {
      delete process.env.GEMINI_CLI_CTRL_BACKSPACE_MODE;
    } else {
      process.env.GEMINI_CLI_CTRL_BACKSPACE_MODE = value;
    }
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

  describe('Ctrl+Backspace Detection', () => {
    describe('when GEMINI_CLI_CTRL_BACKSPACE_MODE=true', () => {
      beforeEach(() => {
        setCtrlBackspaceMode('true');
      });

      it('should recognize byte sequence \\x08 on linux as ctrl modifier', () => {
        setPlatform('linux');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x08' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: true,
            sequence: '\x08',
          }),
        );
      });

      it('should recognize byte sequence \\x7f on windows as ctrl modifier', () => {
        setPlatform('win32');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x7f' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: true,
            sequence: '\x7f',
          }),
        );
      });

      it('should treat \\x08 as regular backspace on Windows', () => {
        setPlatform('win32');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x08' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: false,
            sequence: '\x08',
          }),
        );
      });

      it('should treat \\x7f as regular backspace on Linux', () => {
        setPlatform('linux');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x7f' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: false,
            sequence: '\x7f',
          }),
        );
      });
    });

    describe('when GEMINI_CLI_CTRL_BACKSPACE_MODE=false', () => {
      beforeEach(() => {
        setCtrlBackspaceMode('false');
      });

      it('should treat \\x7f as regular backspace on Windows', () => {
        setPlatform('win32');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x7f' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: false,
            sequence: '\x7f',
          }),
        );
      });

      it('should treat \\x08 as regular backspace on Linux', () => {
        setPlatform('linux');
        renderHook(() => useKeypress(onKeypress, { isActive: true }));

        const key = { name: 'backspace', ctrl: false, sequence: '\x08' };
        act(() => stdin.pressKey(key));

        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'backspace',
            ctrl: false,
            sequence: '\x08',
          }),
        );
      });
    });

    it('should treat sequences as regular backspace when GEMINI_CLI_CTRL_BACKSPACE_MODE is not set', () => {
      setCtrlBackspaceMode(undefined);
      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      const key1 = { name: 'backspace', ctrl: false, sequence: '\x08' };
      act(() => stdin.pressKey(key1));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          ctrl: false,
          sequence: '\x08',
        }),
      );

      const key2 = { name: 'backspace', ctrl: false, sequence: '\x7f' };
      act(() => stdin.pressKey(key2));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          ctrl: false,
          sequence: '\x7f',
        }),
      );
    });
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
});
