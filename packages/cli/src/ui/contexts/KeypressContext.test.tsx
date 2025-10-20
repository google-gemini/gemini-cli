/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { Key } from './KeypressContext.js';
import {
  KeypressProvider,
  useKeypressContext,
  DRAG_COMPLETION_TIMEOUT_MS,
  KITTY_SEQUENCE_TIMEOUT_MS,
  // CSI_END_O,
  // SS3_END,
  SINGLE_QUOTE,
  DOUBLE_QUOTE,
} from './KeypressContext.js';
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
  write = vi.fn();
  resume = vi.fn();
  pause = vi.fn();

  // Helper to simulate a keypress event
  pressKey(key: Partial<Key>) {
    this.emit('keypress', null, key);
  }

  // Helper to simulate a kitty protocol sequence
  sendKittySequence(sequence: string) {
    this.emit('data', Buffer.from(sequence));
  }

  // Helper to simulate a paste event
  sendPaste(text: string) {
    const PASTE_MODE_PREFIX = `\x1b[200~`;
    const PASTE_MODE_SUFFIX = `\x1b[201~`;
    this.emit('data', Buffer.from(PASTE_MODE_PREFIX));
    this.emit('data', Buffer.from(text));
    this.emit('data', Buffer.from(PASTE_MODE_SUFFIX));
  }
}

describe('KeypressContext - Kitty Protocol', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({
    children,
    kittyProtocolEnabled = true,
  }: {
    children: React.ReactNode;
    kittyProtocolEnabled?: boolean;
  }) => (
    <KeypressProvider kittyProtocolEnabled={kittyProtocolEnabled ?? false}>
      {children}
    </KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  describe('Enter key handling', () => {
    it('should recognize regular enter key (keycode 13) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for regular enter: ESC[13u
      act(() => {
        stdin.sendKittySequence(`\x1b[13u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should recognize numpad enter key (keycode 57414) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter: ESC[57414u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should handle numpad enter with modifiers', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Shift (modifier 2): ESC[57414;2u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;2u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: true,
        }),
      );
    });

    it('should handle numpad enter with Ctrl modifier', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Ctrl (modifier 5): ESC[57414;5u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;5u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: true,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should handle numpad enter with Alt modifier', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Alt (modifier 3): ESC[57414;3u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;3u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: true,
          shift: false,
        }),
      );
    });

    it('should not process kitty sequences when kitty protocol is disabled', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: false }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter
      act(() => {
        stdin.sendKittySequence(`\x1b[57414u`);
      });

      // When kitty protocol is disabled, the sequence should be passed through
      // as individual keypresses, not recognized as a single enter key
      expect(keyHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
        }),
      );
    });
  });

  describe('Escape key handling', () => {
    it('should recognize escape key (keycode 27) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for escape: ESC[27u
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'escape',
          kittyProtocol: true,
        }),
      );
    });
  });

  describe('Tab and Backspace handling', () => {
    it('should recognize Tab key in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.sendKittySequence(`\x1b[9u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tab',
          kittyProtocol: true,
          shift: false,
        }),
      );
    });

    it('should recognize Shift+Tab in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 2 is Shift
      act(() => {
        stdin.sendKittySequence(`\x1b[9;2u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tab',
          kittyProtocol: true,
          shift: true,
        }),
      );
    });

    it('should recognize Backspace key in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.sendKittySequence(`\x1b[127u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          meta: false,
        }),
      );
    });

    it('should recognize Option+Backspace in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 3 is Alt/Option
      act(() => {
        stdin.sendKittySequence(`\x1b[127;3u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          meta: true,
        }),
      );
    });

    it('should recognize Ctrl+Backspace in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 5 is Ctrl
      act(() => {
        stdin.sendKittySequence(`\x1b[127;5u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          ctrl: true,
        }),
      );
    });
  });

  describe('paste mode', () => {
    it('should handle multiline paste as a single event', async () => {
      const keyHandler = vi.fn();
      const pastedText = 'This \n is \n a \n multiline \n paste.';

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper,
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Simulate a bracketed paste event
      act(() => {
        stdin.sendPaste(pastedText);
      });

      await waitFor(() => {
        // Expect the handler to be called exactly once for the entire paste
        expect(keyHandler).toHaveBeenCalledTimes(1);
      });

      // Verify the single event contains the full pasted text
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          paste: true,
          sequence: pastedText,
        }),
      );
    });
  });

  describe('debug keystroke logging', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should not log keystrokes when debugKeystrokeLogging is false', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={false}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send a kitty sequence
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Kitty'),
      );
    });

    it('should log kitty buffer accumulation when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send a complete kitty sequence for escape
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer accumulating:',
        expect.stringContaining('"\\u001b[27u"'),
      );
      const parsedCall = consoleLogSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('[DEBUG] Kitty sequence parsed successfully'),
      );
      expect(parsedCall).toBeTruthy();
      expect(parsedCall?.[1]).toEqual(expect.stringContaining('\\u001b[27u'));
    });

    it('should log kitty buffer overflow when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send a long sequence starting with a valid kitty prefix to trigger overflow
      const longSequence = '\x1b[1;' + '1'.repeat(100);
      act(() => {
        stdin.sendKittySequence(longSequence);
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer overflow, clearing:',
        expect.any(String),
      );
    });

    it('should log kitty buffer clear on Ctrl+C when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send incomplete kitty sequence
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x1b[1',
        });
      });

      // Send Ctrl+C
      act(() => {
        stdin.pressKey({
          name: 'c',
          ctrl: true,
          meta: false,
          shift: false,
          sequence: '\x03',
        });
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer cleared on Ctrl+C:',
        '\x1b[1',
      );

      // Verify Ctrl+C was handled
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'c',
          ctrl: true,
        }),
      );
    });

    it('should show char codes when debugKeystrokeLogging is true even without debug mode', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send incomplete kitty sequence
      const sequence = '\x1b[12';
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence,
        });
      });

      // Verify debug logging for accumulation
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer accumulating:',
        JSON.stringify(sequence),
      );

      // Verify warning for char codes
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Kitty sequence buffer has content:',
        JSON.stringify(sequence),
      );
    });
  });

  describe('Parameterized functional keys', () => {
    it.each([
      // Parameterized
      { sequence: `\x1b[1;2H`, expected: { name: 'home', shift: true } },
      { sequence: `\x1b[1;5F`, expected: { name: 'end', ctrl: true } },
      { sequence: `\x1b[1;1P`, expected: { name: 'f1' } },
      { sequence: `\x1b[1;3Q`, expected: { name: 'f2', meta: true } },
      { sequence: `\x1b[3~`, expected: { name: 'delete' } },
      { sequence: `\x1b[5~`, expected: { name: 'pageup' } },
      { sequence: `\x1b[6~`, expected: { name: 'pagedown' } },
      { sequence: `\x1b[1~`, expected: { name: 'home' } },
      { sequence: `\x1b[4~`, expected: { name: 'end' } },
      { sequence: `\x1b[2~`, expected: { name: 'insert' } },
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
    ])(
      'should recognize sequence "$sequence" as $expected.name',
      ({ sequence, expected }) => {
        const keyHandler = vi.fn();
        const { result } = renderHook(() => useKeypressContext(), { wrapper });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.sendKittySequence(sequence));

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining(expected),
        );
      },
    );
  });

  describe('Shift+Tab forms', () => {
    it.each([
      { sequence: `\x1b[Z`, description: 'legacy reverse Tab' },
      { sequence: `\x1b[1;2Z`, description: 'parameterized reverse Tab' },
    ])(
      'should recognize $description "$sequence" as Shift+Tab',
      ({ sequence }) => {
        const keyHandler = vi.fn();
        const { result } = renderHook(() => useKeypressContext(), { wrapper });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.sendKittySequence(sequence));
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'tab', shift: true }),
        );
      },
    );
  });

  describe('Double-tap and batching', () => {
    it('should emit two delete events for double-tap CSI[3~', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.sendKittySequence(`\x1b[3~`));
      act(() => stdin.sendKittySequence(`\x1b[3~`));

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
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.sendKittySequence(`\x1b[3~\x1b[5~`));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'delete' }),
      );
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pageup' }),
      );
    });

    it('should ignore incomplete CSI then parse the next complete sequence', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Incomplete ESC sequence then a complete Delete
      act(() => {
        // Provide an incomplete ESC sequence chunk with a real ESC character
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x1b[1;',
        });
      });
      act(() => stdin.sendKittySequence(`\x1b[3~`));

      expect(keyHandler).toHaveBeenCalledTimes(1);
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'delete' }),
      );
    });
  });
});

describe('Drag and Drop Handling', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({
    children,
    kittyProtocolEnabled = true,
  }: {
    children: React.ReactNode;
    kittyProtocolEnabled?: boolean;
  }) => (
    <KeypressProvider kittyProtocolEnabled={kittyProtocolEnabled}>
      {children}
    </KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('drag start by quotes', () => {
    it('should start collecting when single quote arrives and not broadcast immediately', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should start collecting when double quote arrives and not broadcast immediately', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: DOUBLE_QUOTE,
        });
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });
  });

  describe('drag collection and completion', () => {
    it('should collect single character inputs during drag mode', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Start by single quote
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      // Send single character
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'a',
        });
      });

      // Character should not be immediately broadcast
      expect(keyHandler).not.toHaveBeenCalled();

      // Fast-forward to completion timeout
      act(() => {
        vi.advanceTimersByTime(DRAG_COMPLETION_TIMEOUT_MS + 10);
      });

      // Should broadcast the collected path as paste (includes starting quote)
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          paste: true,
          sequence: `${SINGLE_QUOTE}a`,
        }),
      );
    });

    it('should collect multiple characters and complete on timeout', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Start by single quote
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      // Send multiple characters
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'p',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'a',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 't',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'h',
        });
      });

      // Characters should not be immediately broadcast
      expect(keyHandler).not.toHaveBeenCalled();

      // Fast-forward to completion timeout
      act(() => {
        vi.advanceTimersByTime(DRAG_COMPLETION_TIMEOUT_MS + 10);
      });

      // Should broadcast the collected path as paste (includes starting quote)
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          paste: true,
          sequence: `${SINGLE_QUOTE}path`,
        }),
      );
    });
  });
});

describe('Kitty Sequence Parsing', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({
    children,
    kittyProtocolEnabled = true,
  }: {
    children: React.ReactNode;
    kittyProtocolEnabled?: boolean;
  }) => (
    <KeypressProvider kittyProtocolEnabled={kittyProtocolEnabled}>
      {children}
    </KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Terminals to test
  const terminals = ['iTerm2', 'Ghostty', 'MacTerminal', 'VSCodeTerminal'];

  // Key mappings: letter -> [keycode, accented character, shouldHaveMeta]
  // Note: µ (mu) is sent with meta:false on iTerm2/VSCode
  const keys: Record<string, [number, string, boolean]> = {
    a: [97, 'å', true],
    o: [111, 'ø', true],
    m: [109, 'µ', false],
  };

  it.each(
    terminals.flatMap((terminal) =>
      Object.entries(keys).map(
        ([key, [keycode, accentedChar, shouldHaveMeta]]) => {
          if (terminal === 'Ghostty') {
            // Ghostty uses kitty protocol sequences
            return {
              terminal,
              key,
              kittySequence: `\x1b[${keycode};3u`,
              expected: {
                name: key,
                ctrl: false,
                meta: true,
                shift: false,
                paste: false,
                kittyProtocol: true,
              },
            };
          } else if (terminal === 'MacTerminal') {
            // Mac Terminal sends ESC + letter
            return {
              terminal,
              key,
              kitty: false,
              input: {
                sequence: `\x1b${key}`,
                name: key,
                ctrl: false,
                meta: true,
                shift: false,
                paste: false,
              },
              expected: {
                sequence: `\x1b${key}`,
                name: key,
                ctrl: false,
                meta: true,
                shift: false,
                paste: false,
              },
            };
          } else {
            // iTerm2 and VSCode send accented characters (å, ø, µ)
            // Note: µ comes with meta:false but gets converted to m with meta:true
            return {
              terminal,
              key,
              input: {
                name: key,
                ctrl: false,
                meta: shouldHaveMeta,
                shift: false,
                paste: false,
                sequence: accentedChar,
              },
              expected: {
                name: key,
                ctrl: false,
                meta: true, // Always expect meta:true after conversion
                shift: false,
                paste: false,
                sequence: accentedChar,
              },
            };
          }
        },
      ),
    ),
  )(
    'should handle Alt+$key in $terminal',
    ({
      kittySequence,
      input,
      expected,
      kitty = true,
    }: {
      kittySequence?: string;
      input?: Partial<Key>;
      expected: Partial<Key>;
      kitty?: boolean;
    }) => {
      const keyHandler = vi.fn();
      const testWrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider kittyProtocolEnabled={kitty}>
          {children}
        </KeypressProvider>
      );
      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: testWrapper,
      });
      act(() => result.current.subscribe(keyHandler));

      if (kittySequence) {
        act(() => stdin.sendKittySequence(kittySequence));
      } else if (input) {
        act(() => stdin.pressKey(input));
      }

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining(expected),
      );
    },
  );

  describe('Backslash key handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should treat backslash as a regular keystroke', () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() =>
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: '\\',
        }),
      );

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

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send incomplete kitty sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[1;',
      });
    });

    // Should not broadcast immediately
    expect(keyHandler).not.toHaveBeenCalled();

    // Advance time just before timeout
    act(() => {
      vi.advanceTimersByTime(KITTY_SEQUENCE_TIMEOUT_MS - 5);
    });

    // Still shouldn't broadcast
    expect(keyHandler).not.toHaveBeenCalled();

    // Advance past timeout
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Should now broadcast the incomplete sequence as regular input
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        sequence: '\x1b[1;',
        paste: false,
      }),
    );
  });

  it('should immediately flush non-kitty CSI sequences', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send a CSI sequence that doesn't match kitty patterns
    // ESC[m is SGR reset, not a kitty sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[m',
      });
    });

    // Should broadcast immediately as it's not a valid kitty pattern
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        sequence: '\x1b[m',
        paste: false,
      }),
    );
  });

  it('should parse valid kitty sequences immediately when complete', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send complete kitty sequence for Ctrl+A
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[97;5u',
      });
    });

    // Should parse and broadcast immediately
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a',
        ctrl: true,
        kittyProtocol: true,
      }),
    );
  });

  it('should handle batched kitty sequences correctly', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send multiple kitty sequences at once
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[97;5u\x1b[98;5u', // Ctrl+a followed by Ctrl+b
      });
    });

    // Should parse both sequences
    expect(keyHandler).toHaveBeenCalledTimes(2);
    expect(keyHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'a',
        ctrl: true,
        kittyProtocol: true,
      }),
    );
    expect(keyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'b',
        ctrl: true,
        kittyProtocol: true,
      }),
    );
  });

  it('should clear kitty buffer and timeout on Ctrl+C', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send incomplete kitty sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[1;',
      });
    });

    // Press Ctrl+C
    act(() => {
      stdin.pressKey({
        name: 'c',
        ctrl: true,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x03',
      });
    });

    // Advance past timeout
    act(() => {
      vi.advanceTimersByTime(KITTY_SEQUENCE_TIMEOUT_MS + 10);
    });

    // Should only have received Ctrl+C, not the incomplete sequence
    expect(keyHandler).toHaveBeenCalledTimes(1);
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'c',
        ctrl: true,
      }),
    );
  });

  it('should handle mixed valid and invalid sequences', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send valid kitty sequence followed by invalid CSI
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[13u\x1b[!', // Valid enter, then invalid sequence
      });
    });

    // Should parse valid sequence and flush invalid immediately
    expect(keyHandler).toHaveBeenCalledTimes(2);
    expect(keyHandler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'return',
        kittyProtocol: true,
      }),
    );
    expect(keyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: '',
        sequence: '\x1b[!',
      }),
    );
  });

  it('should not buffer sequences when kitty protocol is disabled', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), {
      wrapper: ({ children }) =>
        wrapper({ children, kittyProtocolEnabled: false }),
    });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send what would be a kitty sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[13u',
      });
    });

    // Should pass through without parsing
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: '\x1b[13u',
      }),
    );
    expect(keyHandler).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'return',
        kittyProtocol: true,
      }),
    );
  });

  it('should handle sequences arriving character by character', async () => {
    vi.useRealTimers(); // Required for correct buffering timing.

    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send kitty sequence character by character
    const sequence = '\x1b[27u'; // Escape key
    for (const char of sequence) {
      act(() => {
        stdin.emit('data', Buffer.from(char));
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Should parse once complete
    await waitFor(() => {
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'escape',
          kittyProtocol: true,
        }),
      );
    });
  });

  it('should reset timeout when new input arrives', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Start incomplete sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '\x1b[1',
      });
    });

    // Advance time partway
    act(() => {
      vi.advanceTimersByTime(30);
    });

    // Add more to sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: '3',
      });
    });

    // Advance time from the first timeout point
    act(() => {
      vi.advanceTimersByTime(25);
    });

    // Should not have timed out yet (timeout restarted)
    expect(keyHandler).not.toHaveBeenCalled();

    // Complete the sequence
    act(() => {
      stdin.pressKey({
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        sequence: 'u',
      });
    });

    // Should now parse as complete enter key
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'return',
        kittyProtocol: true,
      }),
    );
  });

  it('should flush incomplete kitty sequence on FOCUS_IN event', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send incomplete kitty sequence
    act(() => {
      stdin.pressKey({
        sequence: '\x1b[1;',
      });
    });

    // Incomplete sequence should be buffered, not broadcast
    expect(keyHandler).not.toHaveBeenCalled();

    // Send FOCUS_IN event
    const FOCUS_IN = '\x1b[I';
    act(() => {
      stdin.pressKey({
        sequence: FOCUS_IN,
      });
    });

    // The buffered sequence should be flushed
    expect(keyHandler).toHaveBeenCalledTimes(1);
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        sequence: '\x1b[1;',
        paste: false,
      }),
    );
  });

  it('should flush incomplete kitty sequence on FOCUS_OUT event', async () => {
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send incomplete kitty sequence
    act(() => {
      stdin.pressKey({
        sequence: '\x1b[1;',
      });
    });

    // Incomplete sequence should be buffered, not broadcast
    expect(keyHandler).not.toHaveBeenCalled();

    // Send FOCUS_OUT event
    const FOCUS_OUT = '\x1b[O';
    act(() => {
      stdin.pressKey({
        sequence: FOCUS_OUT,
      });
    });

    // The buffered sequence should be flushed
    expect(keyHandler).toHaveBeenCalledTimes(1);
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        sequence: '\x1b[1;',
        paste: false,
      }),
    );
  });

  it('should flush incomplete kitty sequence on paste event', async () => {
    vi.useFakeTimers();
    const keyHandler = vi.fn();
    const { result } = renderHook(() => useKeypressContext(), { wrapper });

    act(() => {
      result.current.subscribe(keyHandler);
    });

    // Send incomplete kitty sequence
    act(() => {
      stdin.pressKey({
        sequence: '\x1b[1;',
      });
    });

    // Incomplete sequence should be buffered, not broadcast
    expect(keyHandler).not.toHaveBeenCalled();

    // Send paste start sequence
    const PASTE_MODE_PREFIX = `\x1b[200~`;
    act(() => {
      stdin.emit('data', Buffer.from(PASTE_MODE_PREFIX));
    });

    // The buffered sequence should be flushed
    expect(keyHandler).toHaveBeenCalledTimes(1);
    expect(keyHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '',
        sequence: '\x1b[1;',
        paste: false,
      }),
    );

    // Now send some paste content and end paste to make sure paste still works
    const pastedText = 'hello';
    const PASTE_MODE_SUFFIX = `\x1b[201~`;
    act(() => {
      stdin.emit('data', Buffer.from(pastedText));
      stdin.emit('data', Buffer.from(PASTE_MODE_SUFFIX));
    });

    act(() => {
      vi.runAllTimers();
    });

    // The paste event should be broadcast
    expect(keyHandler).toHaveBeenCalledTimes(2);
    expect(keyHandler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        paste: true,
        sequence: pastedText,
      }),
    );
    vi.useRealTimers();
  });
});
