/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { useIsScreenReaderEnabled } from 'ink';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';

vi.mock('../contexts/StreamingContext.js');
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(),
  };
});

vi.mock('./CliSpinner.js', () => ({
  CliSpinner: () => 'Spinner',
}));

describe('GeminiRespondingSpinner', () => {
  const mockUseStreamingContext = vi.mocked(useStreamingContext);
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockUseIsScreenReaderEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders spinner when responding', async () => {
    mockUseStreamingContext.mockReturnValue(StreamingState.Responding);
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiRespondingSpinner />,
    );
    await waitUntilReady();
    // Spinner output varies, but it shouldn't be empty
    expect(lastFrame()).not.toBe('');
    unmount();
  });

  it('renders screen reader text when responding and screen reader enabled', async () => {
    mockUseStreamingContext.mockReturnValue(StreamingState.Responding);
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiRespondingSpinner />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(SCREEN_READER_RESPONDING);
    unmount();
  });

  it('renders nothing when not responding and no non-responding display', async () => {
    mockUseStreamingContext.mockReturnValue(StreamingState.Idle);
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiRespondingSpinner />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders non-responding display when provided', async () => {
    mockUseStreamingContext.mockReturnValue(StreamingState.Idle);
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiRespondingSpinner nonRespondingDisplay="Waiting..." />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Waiting...');
    unmount();
  });

  it('renders screen reader loading text when non-responding display provided and screen reader enabled', async () => {
    mockUseStreamingContext.mockReturnValue(StreamingState.Idle);
    mockUseIsScreenReaderEnabled.mockReturnValue(true);
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiRespondingSpinner nonRespondingDisplay="Waiting..." />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(SCREEN_READER_LOADING);
    unmount();
  });
});
