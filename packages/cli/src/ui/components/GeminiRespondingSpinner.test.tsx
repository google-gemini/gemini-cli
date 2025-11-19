/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  GeminiRespondingSpinner,
  GeminiSpinner,
} from './GeminiRespondingSpinner.js';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';

vi.mock('../contexts/StreamingContext.js', () => ({
  useStreamingContext: vi.fn(() => StreamingState.Idle),
  StreamingState: {
    Idle: 0,
    WaitingForConfirmation: 1,
    Responding: 2,
    Streaming: 3,
  },
}));

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(() => false),
  };
});

vi.mock('ink-spinner', () => ({
  default: () => <Text>spinner</Text>,
}));

describe('GeminiRespondingSpinner', () => {
  it('should return null when not responding and no nonRespondingDisplay', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);

    const { lastFrame } = render(<GeminiRespondingSpinner />);
    expect(lastFrame()).toBe('');
  });

  it('should render spinner when responding', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Responding);

    const { lastFrame } = render(<GeminiRespondingSpinner />);
    expect(lastFrame()).toContain('spinner');
  });

  it('should render nonRespondingDisplay when provided and not responding', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);

    const { lastFrame } = render(
      <GeminiRespondingSpinner nonRespondingDisplay="Loading..." />,
    );
    expect(lastFrame()).toContain('Loading...');
  });

  it('should use default spinner type "dots"', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Responding);

    const { lastFrame } = render(<GeminiRespondingSpinner />);
    expect(lastFrame()).toBeDefined();
  });

  it('should accept custom spinner type', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Responding);

    const { lastFrame } = render(
      <GeminiRespondingSpinner spinnerType="line" />,
    );
    expect(lastFrame()).toBeDefined();
  });

  it('should show screen reader text when responding', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    const { useIsScreenReaderEnabled } = await import('ink');
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Responding);
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(true);

    const { lastFrame } = render(<GeminiRespondingSpinner />);
    expect(lastFrame()).toContain(SCREEN_READER_RESPONDING);
  });

  it('should show screen reader loading text when not responding', async () => {
    const { useStreamingContext } = await import(
      '../contexts/StreamingContext.js'
    );
    const { useIsScreenReaderEnabled } = await import('ink');
    vi.mocked(useStreamingContext).mockReturnValue(StreamingState.Idle);
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(true);

    const { lastFrame } = render(
      <GeminiRespondingSpinner nonRespondingDisplay="test" />,
    );
    expect(lastFrame()).toContain(SCREEN_READER_LOADING);
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<GeminiRespondingSpinner />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<GeminiRespondingSpinner />);
    expect(() => unmount()).not.toThrow();
  });
});

describe('GeminiSpinner', () => {
  it('should render spinner when screen reader is disabled', async () => {
    const { useIsScreenReaderEnabled } = await import('ink');
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(false);

    const { lastFrame } = render(<GeminiSpinner />);
    expect(lastFrame()).toContain('spinner');
  });

  it('should render altText when screen reader is enabled', async () => {
    const { useIsScreenReaderEnabled } = await import('ink');
    vi.mocked(useIsScreenReaderEnabled).mockReturnValue(true);

    const { lastFrame } = render(<GeminiSpinner altText="Custom alt text" />);
    expect(lastFrame()).toContain('Custom alt text');
  });

  it('should use default spinner type "dots"', () => {
    const { lastFrame } = render(<GeminiSpinner />);
    expect(lastFrame()).toBeDefined();
  });

  it('should accept custom spinner type', () => {
    const { lastFrame } = render(<GeminiSpinner spinnerType="arc" />);
    expect(lastFrame()).toBeDefined();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<GeminiSpinner />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<GeminiSpinner />);
    expect(() => unmount()).not.toThrow();
  });

  it('should call useIsScreenReaderEnabled', async () => {
    const { useIsScreenReaderEnabled } = await import('ink');
    render(<GeminiSpinner />);
    expect(useIsScreenReaderEnabled).toHaveBeenCalled();
  });
});
