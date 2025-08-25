/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, Mock } from 'vitest';
import {
  KeypressProvider,
  useKeypressContext,
  Key,
} from './KeypressContext.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'events';
import {
  KITTY_KEYCODE_ENTER,
  KITTY_KEYCODE_NUMPAD_ENTER,
  KITTY_KEYCODE_TAB,
  KITTY_KEYCODE_BACKSPACE,
} from '../utils/platformConstants.js';

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
    <KeypressProvider kittyProtocolEnabled={kittyProtocolEnabled}>
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_ENTER}u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_NUMPAD_ENTER}u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_NUMPAD_ENTER};2u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_NUMPAD_ENTER};5u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_NUMPAD_ENTER};3u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_NUMPAD_ENTER}u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_TAB}u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_TAB};2u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_BACKSPACE}u`);
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
        stdin.sendKittySequence(`\x1b[${KITTY_KEYCODE_BACKSPACE};3u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          meta: true,
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
});
