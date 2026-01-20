/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import type React from 'react';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import type { Mock } from 'vitest';
import { vi, afterAll, beforeAll } from 'vitest';
import type { Key } from './KeypressContext.js';
import {
  KeypressProvider,
  useKeypressContext,
  ESC_TIMEOUT,
  FAST_RETURN_TIMEOUT,
} from './KeypressContext.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';
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

const PASTE_START = '\x1B[200~';
const PASTE_END = '\x1B[201~';
// readline will not emit most incomplete kitty sequences but it will give
// up on sequences like this where the modifier (135) has more than two digits.
const INCOMPLETE_KITTY_SEQUENCE = '\x1b[97;135';

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

// Helper function to setup keypress test with standard configuration
const setupKeypressTest = () => {
  const keyHandler = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <KeypressProvider>{children}</KeypressProvider>
  );

  const { result } = renderHook(() => useKeypressContext(), { wrapper });
  act(() => result.current.subscribe(keyHandler));

  return { result, keyHandler };
};

describe('KeypressContext', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <KeypressProvider>{children}</KeypressProvider>
  );

  beforeAll(() => vi.useFakeTimers());
  afterAll(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  describe('Enter key handling', () => {
    it.each([
      {
        name: 'regular enter key (keycode 13)',
        sequence: '\x1b[13u',
      },
      {
        name: 'numpad enter key (keycode 57414)',
        sequence: '\x1b[57414u',
      },
    ])('should recognize $name in kitty protocol', async ({ sequence }) => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write(sequence));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should handle backslash return', async () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write('\\\r'));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          ctrl: false,
          meta: false,
          shift: true,
        }),
      );
    });

    it.each([
      {
        modifier: 'Shift',
        sequence: '\x1b[57414;2u',
        expected: { ctrl: false, meta: false, shift: true },
      },
      {
        modifier: 'Ctrl',
        sequence: '\x1b[57414;5u',
        expected: { ctrl: true, meta: false, shift: false },
      },
      {
        modifier: 'Alt',
        sequence: '\x1b[57414;3u',
        expected: { ctrl: false, meta: true, shift: false },
      },
    ])(
      'should handle numpad enter with $modifier modifier',
      async ({ sequence, expected }) => {
        const { keyHandler } = setupKeypressTest();

        act(() => stdin.write(sequence));

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'return',
            ...expected,
          }),
        );
      },
    );
  });

  describe('Fast return buffering', () => {
    let kittySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      kittySpy = vi
        .spyOn(terminalCapabilityManager, 'isKittyProtocolEnabled')
        .mockReturnValue(false);
    });

    afterEach(() => kittySpy.mockRestore());

    it('should buffer return key pressed quickly after another key', async () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write('a'));
      expect(keyHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'a' }),
      );

      act(() => stdin.write('\r'));

      expect(keyHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'return',
          sequence: '\r',
          insertable: true,
        }),
      );
    });

    it('should NOT buffer return key if delay is long enough', async () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write('a'));

      vi.advanceTimersByTime(FAST_RETURN_TIMEOUT + 1);

      act(() => stdin.write('\r'));

      expect(keyHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'return',
        }),
      );
    });
  });

  describe('Escape key handling', () => {
    it('should recognize escape key (keycode 27) in kitty protocol', async () => {
      const { keyHandler } = setupKeypressTest();

      // Send kitty protocol sequence for escape: ESC[27u
      act(() => {
        stdin.write('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'escape',
        }),
      );
    });

    it('should handle double Escape', async () => {
      const keyHandler = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider>{children}</KeypressProvider>
      );
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.write('\x1b');
        vi.advanceTimersByTime(10);
        stdin.write('\x1b');
        expect(keyHandler).not.toHaveBeenCalled();
        vi.advanceTimersByTime(ESC_TIMEOUT);

        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ name: 'escape', meta: true }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ name: 'escape', meta: true }),
        );
      });
    });

    it('should handle lone Escape key (keycode 27) with timeout when kitty protocol is enabled', async () => {
      // Use real timers for this test to avoid issues with stream/buffer timing
      const keyHandler = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider>{children}</KeypressProvider>
      );
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Send just ESC
      act(() => {
        stdin.write('\x1b');

        // Should be buffered initially
        expect(keyHandler).not.toHaveBeenCalled();

        vi.advanceTimersByTime(ESC_TIMEOUT + 10);

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'escape',
            meta: true,
          }),
        );
      });
    });
  });

  describe('Tab, Backspace, and Space handling', () => {
    it.each([
      {
        name: 'Tab key',
        inputSequence: '\x1b[9u',
        expected: { name: 'tab', shift: false },
      },
      {
        name: 'Shift+Tab',
        inputSequence: '\x1b[9;2u',
        expected: { name: 'tab', shift: true },
      },
      {
        name: 'Backspace',
        inputSequence: '\x1b[127u',
        expected: { name: 'backspace', meta: false },
      },
      {
        name: 'Option+Backspace',
        inputSequence: '\x1b[127;3u',
        expected: { name: 'backspace', meta: true },
      },
      {
        name: 'Ctrl+Backspace',
        inputSequence: '\x1b[127;5u',
        expected: { name: 'backspace', ctrl: true },
      },
      {
        name: 'Shift+Space',
        inputSequence: '\x1b[32;2u',
        expected: {
          name: 'space',
          shift: true,
          insertable: true,
          sequence: ' ',
        },
      },
      {
        name: 'Ctrl+Space',
        inputSequence: '\x1b[32;5u',
        expected: {
          name: 'space',
          ctrl: true,
          insertable: false,
          sequence: '\x1b[32;5u',
        },
      },
    ])(
      'should recognize $name in kitty protocol',
      async ({ inputSequence, expected }) => {
        const { keyHandler } = setupKeypressTest();

        act(() => {
          stdin.write(inputSequence);
        });

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            ...expected,
          }),
        );
      },
    );
  });

  describe('paste mode', () => {
    it.each([
      {
        name: 'handle multiline paste as a single event',
        pastedText: 'This \n is \n a \n multiline \n paste.',
        writeSequence: (text: string) => {
          stdin.write(PASTE_START);
          stdin.write(text);
          stdin.write(PASTE_END);
        },
      },
      {
        name: 'handle paste start code split over multiple writes',
        pastedText: 'pasted content',
        writeSequence: (text: string) => {
          stdin.write(PASTE_START.slice(0, 3));
          stdin.write(PASTE_START.slice(3));
          stdin.write(text);
          stdin.write(PASTE_END);
        },
      },
      {
        name: 'handle paste end code split over multiple writes',
        pastedText: 'pasted content',
        writeSequence: (text: string) => {
          stdin.write(PASTE_START);
          stdin.write(text);
          stdin.write(PASTE_END.slice(0, 3));
          stdin.write(PASTE_END.slice(3));
        },
      },
    ])('should $name', async ({ pastedText, writeSequence }) => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      act(() => writeSequence(pastedText));

      await waitFor(() => {
        expect(keyHandler).toHaveBeenCalledTimes(1);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'paste',
          sequence: pastedText,
        }),
      );
    });

    it('should parse valid OSC 52 response', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      const base64Data = Buffer.from('Hello OSC 52').toString('base64');
      const sequence = `\x1b]52;c;${base64Data}\x07`;

      act(() => stdin.write(sequence));

      await waitFor(() => {
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'paste',
            sequence: 'Hello OSC 52',
          }),
        );
      });
    });

    it('should handle split OSC 52 response', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      const base64Data = Buffer.from('Split Paste').toString('base64');
      const sequence = `\x1b]52;c;${base64Data}\x07`;

      // Split the sequence
      const part1 = sequence.slice(0, 5);
      const part2 = sequence.slice(5);

      act(() => stdin.write(part1));
      act(() => stdin.write(part2));

      await waitFor(() => {
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'paste',
            sequence: 'Split Paste',
          }),
        );
      });
    });

    it('should handle OSC 52 response terminated by ESC \\', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      const base64Data = Buffer.from('Terminated by ST').toString('base64');
      const sequence = `\x1b]52;c;${base64Data}\x1b\\`;

      act(() => stdin.write(sequence));

      await waitFor(() => {
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'paste',
            sequence: 'Terminated by ST',
          }),
        );
      });
    });

    it('should ignore unknown OSC sequences', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      const sequence = `\x1b]1337;File=name=Zm9vCg==\x07`;

      act(() => stdin.write(sequence));

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should ignore invalid OSC 52 format', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      const sequence = `\x1b]52;x;notbase64\x07`;

      act(() => stdin.write(sequence));

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });
  });

  describe('debug keystroke logging', () => {
    let debugLoggerSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      debugLoggerSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      debugLoggerSpy.mockRestore();
    });

    it('should not log keystrokes when debugKeystrokeLogging is false', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider debugKeystrokeLogging={false}>
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send a kitty sequence
      act(() => {
        stdin.write('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalled();
      expect(debugLoggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Kitty'),
      );
    });

    it('should log kitty buffer accumulation when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider debugKeystrokeLogging={true}>
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send a complete kitty sequence for escape
      act(() => stdin.write('\x1b[27u'));

      expect(debugLoggerSpy).toHaveBeenCalledWith(
        `[DEBUG] Raw StdIn: ${JSON.stringify('\x1b[27u')}`,
      );
    });

    it('should show char codes when debugKeystrokeLogging is true even without debug mode', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider debugKeystrokeLogging={true}>
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send incomplete kitty sequence
      act(() => stdin.write(INCOMPLETE_KITTY_SEQUENCE));

      // Verify debug logging for accumulation
      expect(debugLoggerSpy).toHaveBeenCalledWith(
        `[DEBUG] Raw StdIn: ${JSON.stringify(INCOMPLETE_KITTY_SEQUENCE)}`,
      );
    });
  });

  describe('Parameterized functional keys', () => {
    it.each([
      // ModifyOtherKeys
      { sequence: `\x1b[27;2;13~`, expected: { name: 'return', shift: true } },
      { sequence: `\x1b[27;5;13~`, expected: { name: 'return', ctrl: true } },
      { sequence: `\x1b[27;5;9~`, expected: { name: 'tab', ctrl: true } },
      {
        sequence: `\x1b[27;6;9~`,
        expected: { name: 'tab', ctrl: true, shift: true },
      },
      // XTerm Function Key
      { sequence: `\x1b[1;129A`, expected: { name: 'up' } },
      { sequence: `\x1b[1;2H`, expected: { name: 'home', shift: true } },
      { sequence: `\x1b[1;5F`, expected: { name: 'end', ctrl: true } },
      { sequence: `\x1b[1;1P`, expected: { name: 'f1' } },
      { sequence: `\x1b[1;3Q`, expected: { name: 'f2', meta: true } },
      // Tilde Function Keys
      { sequence: `\x1b[3~`, expected: { name: 'delete' } },
      { sequence: `\x1b[5~`, expected: { name: 'pageup' } },
      { sequence: `\x1b[6~`, expected: { name: 'pagedown' } },
      { sequence: `\x1b[1~`, expected: { name: 'home' } },
      { sequence: `\x1b[4~`, expected: { name: 'end' } },
      { sequence: `\x1b[2~`, expected: { name: 'insert' } },
      { sequence: `\x1b[11~`, expected: { name: 'f1' } },
      { sequence: `\x1b[17~`, expected: { name: 'f6' } },
      { sequence: `\x1b[23~`, expected: { name: 'f11' } },
      { sequence: `\x1b[24~`, expected: { name: 'f12' } },
      // Reverse tabs
      { sequence: `\x1b[Z`, expected: { name: 'tab', shift: true } },
      { sequence: `\x1b[1;2Z`, expected: { name: 'tab', shift: true } },
      // Legacy Arrows
      {
        sequence: `\x1b[A`,
        expected: { name: 'up', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[B`,
        expected: { name: 'down', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[C`,
        expected: { name: 'right', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[D`,
        expected: { name: 'left', ctrl: false, meta: false, shift: false },
      },

      // Legacy Home/End
      {
        sequence: `\x1b[H`,
        expected: { name: 'home', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[F`,
        expected: { name: 'end', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[5H`,
        expected: { name: 'home', ctrl: true, meta: false, shift: false },
      },
    ])(
      'should recognize sequence "$sequence" as $expected.name',
      ({ sequence, expected }) => {
        const keyHandler = vi.fn();
        const { result } = renderHook(() => useKeypressContext(), { wrapper });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.write(sequence));

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining(expected),
        );
      },
    );
  });

  describe('Double-tap and batching', () => {
    it('should emit two delete events for double-tap CSI[3~', async () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write(`\x1b[3~`));
      act(() => stdin.write(`\x1b[3~`));

      expect(keyHandler).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ name: 'delete' }),
      );
      expect(keyHandler).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ name: 'delete' }),
      );
    });

    it('should parse two concatenated tilde-coded sequences in one chunk', async () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write(`\x1b[3~\x1b[5~`));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'delete' }),
      );
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pageup' }),
      );
    });
  });

  describe('Cross-terminal Alt key handling (simulating macOS)', () => {
    let originalPlatform: NodeJS.Platform;

    beforeEach(() => {
      originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    // Terminals to test
    const terminals = ['iTerm2', 'Ghostty', 'MacTerminal', 'VSCodeTerminal'];

    // Key mappings: letter -> [keycode, accented character]
    const keys: Record<string, [number, string]> = {
      b: [98, '\u222B'],
      f: [102, '\u0192'],
      m: [109, '\u00B5'],
    };

    it.each(
      terminals.flatMap((terminal) =>
        Object.entries(keys).map(([key, [keycode, accentedChar]]) => {
          if (terminal === 'Ghostty') {
            // Ghostty uses kitty protocol sequences
            return {
              terminal,
              key,
              chunk: `\x1b[${keycode};3u`,
              expected: {
                name: key,
                ctrl: false,
                meta: true,
                shift: false,
              },
            };
          } else if (terminal === 'MacTerminal') {
            // Mac Terminal sends ESC + letter
            return {
              terminal,
              key,
              kitty: false,
              chunk: `\x1b${key}`,
              expected: {
                sequence: `\x1b${key}`,
                name: key,
                ctrl: false,
                meta: true,
                shift: false,
              },
            };
          } else {
            // iTerm2 and VSCode send accented characters (å, ø, µ)
            // Note: µ (mu) is sent with meta:false on iTerm2/VSCode but
            // gets converted to m with meta:true
            return {
              terminal,
              key,
              chunk: accentedChar,
              expected: {
                name: key,
                ctrl: false,
                meta: true, // Always expect meta:true after conversion
                shift: false,
                sequence: accentedChar,
              },
            };
          }
        }),
      ),
    )(
      'should handle Alt+$key in $terminal',
      ({ chunk, expected }: { chunk: string; expected: Partial<Key> }) => {
        const keyHandler = vi.fn();
        const testWrapper = ({ children }: { children: React.ReactNode }) => (
          <KeypressProvider>{children}</KeypressProvider>
        );
        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: testWrapper,
        });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.write(chunk));

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining(expected),
        );
      },
    );
  });

  describe('Backslash key handling', () => {
    it('should treat backslash as a regular keystroke', () => {
      const { keyHandler } = setupKeypressTest();

      act(() => stdin.write('\\'));

      // Advance timers to trigger the backslash timeout
      act(() => {
        vi.runAllTimers();
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sequence: '\\',
          meta: false,
        }),
      );
    });
  });

  it('should timeout and flush incomplete kitty sequences after 50ms', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    act(() => stdin.write(INCOMPLETE_KITTY_SEQUENCE));

    // Should not broadcast immediately
    expect(keyHandler).not.toHaveBeenCalled();

    // Advance time just before timeout
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.advanceTimersByTime(ESC_TIMEOUT - 5));

    // Still shouldn't broadcast
    expect(keyHandler).not.toHaveBeenCalled();

    // Advance past timeout
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.advanceTimersByTime(10));

    // Should now broadcast the incomplete sequence as regular input
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'undefined',
        sequence: INCOMPLETE_KITTY_SEQUENCE,
      }),
    );
  });

  it('should immediately flush non-kitty CSI sequences', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    // Send a CSI sequence that doesn't match kitty patterns
    // ESC[m is SGR reset, not a kitty sequence
    act(() => stdin.write('\x1b[m'));

    // Should broadcast immediately as it's not a valid kitty pattern
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: '\x1b[m',
      }),
    );
  });

  it('should parse valid kitty sequences immediately when complete', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    // Send complete kitty sequence for Ctrl+A
    act(() => stdin.write('\x1b[97;5u'));

    // Should parse and broadcast immediately
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        ctrl: true,
      }),
    );
  });

  it('should handle batched kitty sequences correctly', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    // Send Ctrl+a followed by Ctrl+b
    act(() => stdin.write('\x1b[97;5u\x1b[98;5u'));

    // Should parse both sequences
    expect(keyHandler).toHaveBeenCalledTimes(2);
    expect(keyHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'a',
        ctrl: true,
      }),
    );
    expect(keyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'b',
        ctrl: true,
      }),
    );
  });

  it('should handle mixed valid and invalid sequences', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    // Send valid kitty sequence followed by invalid CSI
    // Valid enter, then invalid sequence
    act(() => stdin.write('\x1b[13u\x1b[!'));

    // Should parse valid sequence and flush invalid immediately
    expect(keyHandler).toHaveBeenCalledTimes(2);
    expect(keyHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'return',
      }),
    );
    expect(keyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sequence: '\x1b[!',
      }),
    );
  });

  it.each([1, ESC_TIMEOUT - 1])(
    'should handle sequences arriving character by character with %s ms delay',
    async (delay) => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send kitty sequence character by character
      for (const char of '\x1b[27u') {
        act(() => stdin.write(char));
        // Advance time but not enough to timeout
        vi.advanceTimersByTime(delay);
      }

      // Should parse once complete
      await waitFor(() => {
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'escape',
          }),
        );
      });
    },
  );

  it('should reset timeout when new input arrives', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => result.current.subscribe(keyHandler));

    // Start incomplete sequence
    act(() => stdin.write('\x1b[97;13'));

    // Advance time partway
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.advanceTimersByTime(30));

    // Add more to sequence
    act(() => stdin.write('5'));

    // Advance time from the first timeout point
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    act(() => vi.advanceTimersByTime(25));

    // Should not have timed out yet (timeout restarted)
    expect(keyHandler).not.toHaveBeenCalled();

    // Complete the sequence
    act(() => stdin.write('u'));

    // Should now parse as complete enter key
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
      }),
    );
  });

  describe('SGR Mouse Handling', () => {
    it('should ignore SGR mouse sequences', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send various SGR mouse sequences
      act(() => {
        stdin.write('\x1b[<0;10;20M'); // Mouse press
        stdin.write('\x1b[<0;10;20m'); // Mouse release
        stdin.write('\x1b[<32;30;40M'); // Mouse drag
        stdin.write('\x1b[<64;5;5M'); // Scroll up
      });

      // Should not broadcast any of these as keystrokes
      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should handle mixed SGR mouse and key sequences', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send mouse event then a key press
      act(() => {
        stdin.write('\x1b[<0;10;20M');
        stdin.write('a');
      });

      // Should only broadcast 'a'
      expect(keyHandler).toHaveBeenCalledTimes(1);
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'a',
          sequence: 'a',
        }),
      );
    });

    it('should ignore X11 mouse sequences', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send X11 mouse sequence: ESC [ M followed by 3 bytes
      // Space is 32. 32+0=32 (button 0), 32+33=65 ('A', col 33), 32+34=66 ('B', row 34)
      const x11Seq = '\x1b[M AB';

      act(() => stdin.write(x11Seq));

      // Should not broadcast as keystrokes
      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should not flush slow SGR mouse sequences as garbage', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      // Send start of SGR sequence
      act(() => stdin.write('\x1b[<'));

      // Advance time past the normal kitty timeout (50ms)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      act(() => vi.advanceTimersByTime(ESC_TIMEOUT + 10));

      // Send the rest
      act(() => stdin.write('0;37;25M'));

      // Should NOT have flushed the prefix as garbage, and should have consumed the whole thing
      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should ignore specific SGR mouse sequence sandwiched between keystrokes', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.write('H');
        stdin.write('\x1b[<64;96;8M');
        stdin.write('I');
      });

      expect(keyHandler).toHaveBeenCalledTimes(2);
      expect(keyHandler).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ name: 'h', sequence: 'H', shift: true }),
      );
      expect(keyHandler).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ name: 'i', sequence: 'I', shift: true }),
      );
    });
  });

  describe('Ignored Sequences', () => {
    it.each([
      { name: 'Focus In', sequence: '\x1b[I' },
      { name: 'Focus Out', sequence: '\x1b[O' },
      { name: 'SGR Mouse Release', sequence: '\u001b[<0;44;18m' },
      { name: 'something mouse', sequence: '\u001b[<0;53;19M' },
      { name: 'another mouse', sequence: '\u001b[<0;29;19m' },
    ])('should ignore $name sequence', async ({ sequence }) => {
      const keyHandler = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider>{children}</KeypressProvider>
      );
      const { result } = renderHook(() => useKeypressContext(), {
        wrapper,
      });
      act(() => result.current.subscribe(keyHandler));

      for (const char of sequence) {
        act(() => stdin.write(char));

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        act(() => vi.advanceTimersByTime(0));
      }

      act(() => stdin.write('HI'));

      expect(keyHandler).toHaveBeenCalledTimes(2);
      expect(keyHandler).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ name: 'h', sequence: 'H', shift: true }),
      );
      expect(keyHandler).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ name: 'i', sequence: 'I', shift: true }),
      );
    });

    it('should handle F12', async () => {
      const keyHandler = vi.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider>{children}</KeypressProvider>
      );
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.write('\u001b[24~');
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'f12', sequence: '\u001b[24~' }),
      );
    });
  });

  describe('Individual Character Input', () => {
    it.each([
      'abc', // ASCII character
      '你好', // Chinese characters
      'こんにちは', // Japanese characters
      '안녕하세요', // Korean characters
      'A你B好C', // Mixed characters
    ])('should correctly handle string "%s"', async (inputString) => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.write(inputString));

      expect(keyHandler).toHaveBeenCalledTimes(inputString.length);
      for (const char of inputString) {
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({ sequence: char }),
        );
      }
    });
  });
});
