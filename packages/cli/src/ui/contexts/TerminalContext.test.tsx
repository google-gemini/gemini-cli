/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { TerminalProvider, useTerminalContext } from './TerminalContext.js';
import { vi, describe, it, expect, type Mock } from 'vitest';
import { useEffect, act } from 'react';
import { EventEmitter } from 'node:events';
import { waitFor } from '../../test-utils/async.js';

const mockStdin = new EventEmitter() as unknown as NodeJS.ReadStream &
  EventEmitter;
// Add required properties for Ink's StdinProps
(mockStdin as unknown as { write: Mock }).write = vi.fn();
(mockStdin as unknown as { setEncoding: Mock }).setEncoding = vi.fn();
(mockStdin as unknown as { setRawMode: Mock }).setRawMode = vi.fn();
(mockStdin as unknown as { isTTY: boolean }).isTTY = true;
// Mock removeListener specifically as it is used in cleanup
(mockStdin as unknown as { removeListener: Mock }).removeListener = vi.fn(
  (event: string, listener: (...args: unknown[]) => void) => {
    mockStdin.off(event, listener);
  },
);

vi.mock('ink', () => ({
  useStdin: () => ({
    stdin: mockStdin,
  }),
}));

const TestComponent = ({ onColor }: { onColor: (c: string) => void }) => {
  const { subscribe } = useTerminalContext();
  useEffect(() => {
    subscribe(onColor);
  }, [subscribe, onColor]);
  return null;
};

describe('TerminalContext', () => {
  it('should parse OSC 11 response', async () => {
    const handleColor = vi.fn();
    render(
      <TerminalProvider>
        <TestComponent onColor={handleColor} />
      </TerminalProvider>,
    );

    act(() => {
      mockStdin.emit('data', '\x1b]11;rgb:ffff/ffff/ffff\x1b\\');
    });

    await waitFor(() => {
      expect(handleColor).toHaveBeenCalledWith('rgb:ffff/ffff/ffff');
    });
  });

  it('should handle partial chunks', async () => {
    const handleColor = vi.fn();
    render(
      <TerminalProvider>
        <TestComponent onColor={handleColor} />
      </TerminalProvider>,
    );

    act(() => {
      mockStdin.emit('data', '\x1b]11;rgb:0000/');
    });
    expect(handleColor).not.toHaveBeenCalled();

    act(() => {
      mockStdin.emit('data', '0000/0000\x1b\\');
    });

    await waitFor(() => {
      expect(handleColor).toHaveBeenCalledWith('rgb:0000/0000/0000');
    });
  });
});
