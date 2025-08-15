/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
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
} from '../utils/platformConstants.js';

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
    emitKeypressEvents: vi.fn(),
  };
  return {
    ...mockedReadline,
    default: mockedReadline,
  };
});

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  override on = this.addListener;
  override removeListener = super.removeListener;
  write = vi.fn();
  resume = vi.fn();

  // Helper to simulate a keypress event
  pressKey(key: Partial<Key>) {
    this.emit('keypress', null, key);
  }

  // Helper to simulate a kitty protocol sequence
  sendKittySequence(sequence: string) {
    // Kitty sequences come in multiple parts
    // For example, ESC[13u comes as: ESC[ then 1 then 3 then u
    // ESC[57414;2u comes as: ESC[ then 5 then 7 then 4 then 1 then 4 then ; then 2 then u
    const escIndex = sequence.indexOf('\x1b[');
    if (escIndex !== -1) {
      // Send ESC[
      this.emit('keypress', null, {
        name: undefined,
        sequence: '\x1b[',
        ctrl: false,
        meta: false,
        shift: false,
      });

      // Send the rest character by character
      const rest = sequence.substring(escIndex + 2);
      for (const char of rest) {
        this.emit('keypress', null, {
          name: /[a-zA-Z0-9]/.test(char) ? char : undefined,
          sequence: char,
          ctrl: false,
          meta: false,
          shift: false,
        });
      }
    }
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
});
