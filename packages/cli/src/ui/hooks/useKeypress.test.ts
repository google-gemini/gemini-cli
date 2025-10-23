/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useKeypress } from './useKeypress.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'node:events';
import type { Mock } from 'vitest';

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

class MockStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  setRawMode = vi.fn();
  override on = this.addListener;
  override removeListener = super.removeListener;
  resume = vi.fn();
  pause = vi.fn();

  write(text: string) {
    this.emit('data', Buffer.from(text));
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
    (useStdin as Mock).mockReturnValue({
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
    act(() => stdin.write('a'));
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
    act(() => stdin.write(key.sequence));
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
    act(() => stdin.write('a'));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('should correctly identify alt+enter (meta key)', () => {
    renderHook(() => useKeypress(onKeypress, { isActive: true }), { wrapper });
    const key = { name: 'return', sequence: '\x1B\r' };
    act(() => stdin.write(key.sequence));
    expect(onKeypress).toHaveBeenCalledWith(
      expect.objectContaining({ ...key, meta: true, paste: false }),
    );
  });

  describe.each([
    {
      description: 'Modern Node (>= v20)',
      setup: () => setNodeVersion('20.0.0'),
    },
    {
      description: 'Legacy Node (< v20)',
      setup: () => setNodeVersion('18.0.0'),
    },
    {
      description: 'Workaround Env Var',
      setup: () => {
        setNodeVersion('20.0.0');
        vi.stubEnv('PASTE_WORKAROUND', 'true');
      },
    },
  ])('in $description', ({ setup }) => {
    beforeEach(() => {
      setup();
    });

    it('should process a paste as a single event', () => {
      renderHook(() => useKeypress(onKeypress, { isActive: true }), {
        wrapper,
      });
      const pasteText = 'hello world';
      act(() => stdin.write(PASTE_START + pasteText + PASTE_END));

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
      act(() => stdin.write('a'));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ ...keyA, paste: false }),
      );

      const pasteText = 'pasted';
      act(() => stdin.write(PASTE_START + pasteText + PASTE_END));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText }),
      );

      const keyB = { name: 'b', sequence: 'b' };
      act(() => stdin.write('b'));
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

      act(() => stdin.write(PASTE_START + pasteText));

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
