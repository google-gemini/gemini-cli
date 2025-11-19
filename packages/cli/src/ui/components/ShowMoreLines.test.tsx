/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ShowMoreLines } from './ShowMoreLines.js';
import { StreamingState } from '../types.js';

vi.mock('../contexts/OverflowContext.js', () => ({
  useOverflowState: vi.fn(() => undefined),
}));

vi.mock('../contexts/StreamingContext.js', () => ({
  useStreamingContext: vi.fn(() => 0),
  StreamingState: {
    Idle: 0,
    WaitingForConfirmation: 1,
    Streaming: 2,
  },
}));

describe('ShowMoreLines', () => {
  it('should return null when overflow is undefined', () => {
    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toBe('');
  });

  it('should return null when constrainHeight is false', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1']),
    } as never);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={false} />);
    expect(lastFrame()).toBe('');
  });

  it('should return null when no overflowing IDs', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(),
    } as never);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toBe('');
  });

  it('should render when all conditions met (Idle)', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );

    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1']),
    } as never);
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toContain('ctrl-s');
  });

  it('should render when streaming is WaitingForConfirmation', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );

    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1']),
    } as never);
    vi.mocked(useStreamingContext).mockReturnValue(
      StreamingState.WaitingForConfirmation,
    );

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toContain('show more lines');
  });

  it('should not render when streaming', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );

    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1']),
    } as never);
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Streaming);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toBe('');
  });

  it('should display ctrl-s instruction', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );

    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1']),
    } as never);
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toContain('Press ctrl-s to show more lines');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ShowMoreLines constrainHeight={true} />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ShowMoreLines constrainHeight={false} />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle multiple overflowing IDs', async () => {
    const { useOverflowState } = await import('../contexts/OverflowContext.js');
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );

    vi.mocked(useOverflowState).mockReturnValue({
      overflowingIds: new Set(['id1', 'id2', 'id3']),
    } as never);
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);

    const { lastFrame } = render(<ShowMoreLines constrainHeight={true} />);
    expect(lastFrame()).toContain('ctrl-s');
  });
});
