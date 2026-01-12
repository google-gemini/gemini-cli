/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { RewindConfirmation, RewindOutcome } from './RewindConfirmation.js';

describe('RewindConfirmation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with stats', () => {
    const stats = {
      addedLines: 10,
      removedLines: 5,
      fileCount: 1,
      details: [{ fileName: 'test.ts', diff: '' }],
    };
    const onConfirm = vi.fn();
    const { lastFrame } = renderWithProviders(
      <RewindConfirmation
        stats={stats}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly without stats', () => {
    const onConfirm = vi.fn();
    const { lastFrame } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onConfirm with Cancel on Escape', async () => {
    const onConfirm = vi.fn();
    vi.useFakeTimers();
    const { stdin } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );

    stdin.write('\x1b');
    await vi.advanceTimersByTimeAsync(100);
    expect(onConfirm).toHaveBeenCalledWith(RewindOutcome.Cancel);
  });

  it('renders timestamp when provided', () => {
    const onConfirm = vi.fn();
    const timestamp = new Date().toISOString();
    const { lastFrame } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
        timestamp={timestamp}
      />,
      { width: 80 },
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
