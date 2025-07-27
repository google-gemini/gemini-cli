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

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    // Restore original Node version
    if (originalNodeVersion) {
      Object.defineProperty(process.versions, 'node', {
        value: originalNodeVersion,
        configurable: true,
      });
    }
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
    act(() => {
      stdin.pressKey(key);
      // Advance timer past the RAPID_INPUT_THRESHOLD (30ms)
      vi.advanceTimersByTime(35);
    });
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
    act(() => {
      stdin.pressKey(key);
      // Advance timer past the RAPID_INPUT_THRESHOLD (30ms)
      vi.advanceTimersByTime(35);
    });
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
      act(() => {
        stdin.paste(pasteText);
        // For legacy mode, advance timers to handle any buffering
        if (isLegacy) {
          vi.advanceTimersByTime(35);
        }
      });

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
      act(() => {
        stdin.pressKey(keyA);
        // Advance timer for individual keystroke
        vi.advanceTimersByTime(35);
      });
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ ...keyA, paste: false }),
      );

      const pasteText = 'pasted';
      act(() => {
        stdin.paste(pasteText);
        // For legacy mode, advance timers
        if (isLegacy) {
          vi.advanceTimersByTime(35);
        }
      });
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText }),
      );

      const keyB = { name: 'b', sequence: 'b' };
      act(() => {
        stdin.pressKey(keyB);
        // Advance timer for individual keystroke
        vi.advanceTimersByTime(35);
      });
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
      act(() => unmount());

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

    it('flushes the entire legacy buffer on non-paste data and does not drop earlier chunks', () => {
      if (!isLegacy) return; // Only meaningful for legacy path

      renderHook(() => useKeypress(onKeypress, { isActive: true }));

      act(() => {
        // First two chunks arrive separately; both are buffered
        stdin.emit('data', Buffer.from('ab'));
        stdin.emit('data', Buffer.from('c'));
        // Allow handleLegacyData to flush
        vi.advanceTimersByTime(35);
      });

      // We should get three individual key events: a, b, c
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'a', sequence: 'a', paste: false }),
      );
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'b', sequence: 'b', paste: false }),
      );
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'c', sequence: 'c', paste: false }),
      );
      expect(onKeypress).toHaveBeenCalledTimes(3);

      // Now push another chunk; buffer should have been cleared, so we only get 'd'
      act(() => {
        stdin.emit('data', Buffer.from('d'));
        vi.advanceTimersByTime(35);
      });

      expect(onKeypress).toHaveBeenCalledTimes(4);
      expect(onKeypress).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'd', sequence: 'd', paste: false }),
      );
    });


    it('should handle data before paste marker', () => {
      // This test only applies to legacy mode where raw data is processed
      if (!isLegacy) {
        return; // Skip for modern mode
      }
      
      renderHook(() => useKeypress(onKeypress, { isActive: true }));
      
      act(() => {
        // Simulate "abc" followed by paste start marker in same data chunk
        // In legacy mode, this gets sent as raw data containing both regular chars and paste markers
        const dataWithPasteMarker = 'abc\x1B[200~pasted content\x1B[201~';
        stdin.emit('data', Buffer.from(dataWithPasteMarker));
        
        // For legacy mode, advance timers to handle any buffering
        vi.advanceTimersByTime(35);
      });

      // Should have received individual keystrokes for "abc" and then a paste event
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'a', sequence: 'a', paste: false })
      );
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'b', sequence: 'b', paste: false })
      );
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'c', sequence: 'c', paste: false })
      );
      expect(onKeypress).toHaveBeenCalledWith({
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: 'pasted content',
      });

      expect(onKeypress).toHaveBeenCalledTimes(4);
    });
  });
});

describe('Timing-based paste detection (Windows-style)', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();
  const onKeypress = vi.fn();
  let capturedInput = '';
  let onSubmit = vi.fn();
  let originalNodeVersion: string;

  // Mock a simplified input handler that tracks input and submissions
  const mockInputHandler = (key: Key) => {
    if (key.paste) {
      capturedInput += key.sequence;
    } else if (key.name === 'return' && !key.paste) {
      onSubmit(capturedInput);
      capturedInput = '';
    } else if (key.sequence && key.sequence !== '\n') {
      capturedInput += key.sequence;
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    
    // Save original Node version
    originalNodeVersion = process.versions.node;
    
    // Helper function to set Node version
    const setNodeVersion = (version: string) => {
      Object.defineProperty(process.versions, 'node', {
        value: version,
        configurable: true,
      });
    };
    
    // Ensure we're in modern mode (Node 20+) for timing-based detection
    setNodeVersion('20.0.0');
    delete process.env['PASTE_WORKAROUND'];
    
    stdin = new MockStdin();
    (useStdin as vi.Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });

    capturedInput = '';
    onSubmit = vi.fn();
    
    // Create a keypress handler that simulates input buffering behavior
    onKeypress.mockImplementation(mockInputHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original Node version
    if (originalNodeVersion) {
      Object.defineProperty(process.versions, 'node', {
        value: originalNodeVersion,
        configurable: true,
      });
    }
  });

  it('should buffer multi-line paste without premature sends', () => {
    // Mock Date.now to control timing for rapid input detection
    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
    
    renderHook(() => useKeypress(onKeypress, { isActive: true }));
    
    const pasteContent = 'function test() {\n  console.log("hello");\n}';
    
    act(() => {
      // Simulate rapid keypress events (< 30ms apart)
      for (let i = 0; i < pasteContent.length; i++) {
        const char = pasteContent[i];
        mockTime += 5; // 5ms between each character (rapid)
        
        stdin.pressKey({
          name: char === '\n' ? 'return' : char,
          sequence: char,
          ctrl: false,
          meta: false,
          shift: false,
        });
      }
      
      // Advance timers past the MULTILINE_FLUSH_DELAY (100ms)
      vi.advanceTimersByTime(150);
    });
    
    // VERIFY CORE PR FUNCTIONALITY:
    expect(capturedInput).toBe(pasteContent); // Full content buffered as paste
    expect(onSubmit).not.toHaveBeenCalled(); // No premature sends
  });

  it('should treat slow newlines as manual Enter presses', () => {
    // Mock Date.now to control timing
    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
    
    renderHook(() => useKeypress(onKeypress, { isActive: true }));
    
    act(() => {
      // Type "hello" with human-like timing (> 30ms between characters)
      const text = 'hello';
      for (let i = 0; i < text.length; i++) {
        mockTime += 100; // 100ms between characters (slow/human)
        stdin.pressKey({
          name: text[i],
          sequence: text[i],
          ctrl: false,
          meta: false,
          shift: false,
        });
        
        // Advance timer to process each keystroke individually
        vi.advanceTimersByTime(50);
      }
      
      // Press Enter with human timing
      mockTime += 100;
      stdin.pressKey({
        name: 'return',
        sequence: '\n',
        ctrl: false,
        meta: false,
        shift: false,
      });
      
      vi.advanceTimersByTime(50);
    });
    
    // Should trigger submit
    expect(capturedInput).toBe('');
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('should handle paste with mid-paste editing', () => {
    // Mock Date.now to control timing
    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
    
    renderHook(() => useKeypress(onKeypress, { isActive: true }));
    
    act(() => {
      // Paste first part rapidly
      const firstPart = 'const x = ';
      for (let i = 0; i < firstPart.length; i++) {
        mockTime += 5; // Rapid input
        stdin.pressKey({
          name: firstPart[i],
          sequence: firstPart[i],
          ctrl: false,
          meta: false,
          shift: false,
        });
      }
      
      // Pause (simulate user thinking/editing)
      mockTime += 200; // Long pause breaks rapid input sequence
      
      // User manually types "5"
      stdin.pressKey({
        name: '5',
        sequence: '5',
        ctrl: false,
        meta: false,
        shift: false,
      });
      
      // Allow processing of individual keystroke
      vi.advanceTimersByTime(50);
      
      // Paste continues rapidly
      mockTime += 5;
      const secondPart = '; console.log(x)';
      for (let i = 0; i < secondPart.length; i++) {
        mockTime += 5; // Rapid input again
        stdin.pressKey({
          name: secondPart[i],
          sequence: secondPart[i],
          ctrl: false,
          meta: false,
          shift: false,
        });
      }
      
      // Advance past buffer threshold
      vi.advanceTimersByTime(150);
    });
    
    // Should combine all input
    expect(capturedInput).toBe('const x = 5; console.log(x)');
  });
});