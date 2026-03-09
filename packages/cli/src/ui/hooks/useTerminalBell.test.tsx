/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { useTerminalBell } from './useTerminalBell.js';
import { StreamingState } from '../types.js';

function TestComponent({ streamingState }: { streamingState: StreamingState }) {
  useTerminalBell(streamingState);
  return null;
}

describe('useTerminalBell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not emit bell on initial render', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { unmount } = render(
      <TestComponent streamingState={StreamingState.Idle} />,
    );
    expect(stderrSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('should emit bell when transitioning from Responding to Idle', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { rerender, unmount } = render(
      <TestComponent streamingState={StreamingState.Responding} />,
    );
    rerender(<TestComponent streamingState={StreamingState.Idle} />);
    expect(stderrSpy).toHaveBeenCalledWith('\x07');
    unmount();
  });

  it('should emit bell when transitioning from Responding to WaitingForConfirmation', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { rerender, unmount } = render(
      <TestComponent streamingState={StreamingState.Responding} />,
    );
    rerender(
      <TestComponent streamingState={StreamingState.WaitingForConfirmation} />,
    );
    expect(stderrSpy).toHaveBeenCalledWith('\x07');
    unmount();
  });

  it('should not emit bell when transitioning from Idle to Responding', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { rerender, unmount } = render(
      <TestComponent streamingState={StreamingState.Idle} />,
    );
    rerender(<TestComponent streamingState={StreamingState.Responding} />);
    expect(stderrSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('should not emit bell when staying in the same state', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { rerender, unmount } = render(
      <TestComponent streamingState={StreamingState.Responding} />,
    );
    rerender(<TestComponent streamingState={StreamingState.Responding} />);
    expect(stderrSpy).not.toHaveBeenCalled();
    unmount();
  });
});
