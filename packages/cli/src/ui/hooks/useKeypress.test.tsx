/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from '../../test-utils/render.js';
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
    this.emit('data', text);
  }
}

describe.each([true, false])(`useKeypress with useKitty=%s`, (useKitty) => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();
  const onKeypress = vi.fn();
  let originalNodeVersion: string;

  const renderKeypressHook = (isActive = true) => {
    function TestComponent() {
      useKeypress(onKeypress, { isActive });
      return null;
    }
    return render(
      <KeypressProvider kittyProtocolEnabled={useKitty}>
        <TestComponent />
      </KeypressProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
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

  it('should not listen if isActive is false', () => {
    renderKeypressHook(false);
    act(() => stdin.write('a'));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it.each([
    { key: { name: 'a', sequence: 'a' } },
    { key: { name: 'left', sequence: '\x1b[D' } },
    { key: { name: 'right', sequence: '\x1b[C' } },
    { key: { name: 'up', sequence: '\x1b[A' } },
    { key: { name: 'down', sequence: '\x1b[B' } },
    { key: { name: 'tab', sequence: '\x1b[Z', shift: true } },
  ])('should listen for keypress when active for key $key.name', ({ key }) => {
    renderKeypressHook(true);
    act(() => stdin.write(key.sequence));
    expect(onKeypress).toHaveBeenCalledWith(expect.objectContaining(key));
  });

  it('should set and release raw mode', () => {
    const { unmount } = renderKeypressHook(true);
    expect(mockSetRawMode).toHaveBeenCalledWith(true);
    unmount();
    expect(mockSetRawMode).toHaveBeenCalledWith(false);
  });

  it('should stop listening after being unmounted', () => {
    const { unmount } = renderKeypressHook(true);
    unmount();
    act(() => stdin.write('a'));
    expect(onKeypress).not.toHaveBeenCalled();
  });

  it('should correctly identify alt+enter (meta key)', () => {
    renderKeypressHook(true);
    const key = { name: 'return', sequence: '\x1B\r' };
    act(() => stdin.write(key.sequence));
    expect(onKeypress).toHaveBeenCalledWith(
      expect.objectContaining({ ...key, meta: true, paste: false }),
    );
  });

  describe.each([
    {
      description: 'PASTE_WORKAROUND true',
      setup: () => vi.stubEnv('PASTE_WORKAROUND', 'true'),
    },
    {
      description: 'PASTE_WORKAROUND false',
      setup: () => vi.stubEnv('PASTE_WORKAROUND', 'false'),
    },
  ])('in $description', ({ setup }) => {
    beforeEach(() => {
      setup();
    });

    it('should process a paste as a single event', () => {
      renderKeypressHook(true);
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
      renderKeypressHook(true);

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

    it('should handle lone pastes', () => {
      renderKeypressHook(true);

      const pasteText = 'pasted';
      act(() => {
        stdin.write(PASTE_START);
        stdin.write(pasteText);
        stdin.write(PASTE_END);
      });
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText }),
      );

      expect(onKeypress).toHaveBeenCalledTimes(1);
    });

    it('should handle paste false alarm', async () => {
      renderKeypressHook(true);

      act(() => {
        stdin.write(PASTE_START.slice(0, 5));
        stdin.write('do');
      });

      if (useKitty) {
        vi.advanceTimersByTime(60); // wait for kitty timeout
        expect(onKeypress).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ sequence: '\x1B[200do' }),
        );
      } else {
        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({ sequence: '\x1B[200d' }),
        );
        expect(onKeypress).toHaveBeenCalledWith(
          expect.objectContaining({ sequence: 'o' }),
        );
        expect(onKeypress).toHaveBeenCalledTimes(2);
      }
    });

    it('should handle back to back pastes', () => {
      renderKeypressHook(true);

      const pasteText1 = 'herp';
      const pasteText2 = 'derp';
      act(() => {
        stdin.write(
          PASTE_START +
            pasteText1 +
            PASTE_END +
            PASTE_START +
            pasteText2 +
            PASTE_END,
        );
      });
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText1 }),
      );
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ paste: true, sequence: pasteText2 }),
      );

      expect(onKeypress).toHaveBeenCalledTimes(2);
    });

    it('should handle pastes split across writes', async () => {
      renderKeypressHook(true);

      const keyA = { name: 'a', sequence: 'a' };
      act(() => stdin.write('a'));
      expect(onKeypress).toHaveBeenCalledWith(
        expect.objectContaining({ ...keyA, paste: false }),
      );

      const pasteText = 'pasted';
      await act(async () => {
        stdin.write(PASTE_START.slice(0, 3));
        vi.advanceTimersByTime(50);
        stdin.write(PASTE_START.slice(3) + pasteText.slice(0, 3));
        vi.advanceTimersByTime(50);
        stdin.write(pasteText.slice(3) + PASTE_END.slice(0, 3));
        vi.advanceTimersByTime(50);
        stdin.write(PASTE_END.slice(3));
      });
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
      const { unmount } = renderKeypressHook(true);
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
