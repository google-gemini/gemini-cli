/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { RewindConfirmation, RewindOutcome } from './RewindConfirmation.js';

describe('RewindConfirmation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with stats', async () => {
    const stats = {
      addedLines: 10,
      removedLines: 5,
      fileCount: 1,
      details: [{ fileName: 'test.ts', diff: '' }],
    };
    const onConfirm = vi.fn();
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <RewindConfirmation
        stats={stats}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).toContain('Revert code changes');
    unmount();
  });

  it('renders correctly without stats', async () => {
    const onConfirm = vi.fn();
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).not.toContain('Revert code changes');
    expect(lastFrame()).toContain('Rewind conversation');
    unmount();
  });

  it('calls onConfirm with Cancel on Escape', async () => {
    const onConfirm = vi.fn();
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
      />,
      { width: 80 },
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\x1b');
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(RewindOutcome.Cancel);
    });
    unmount();
  });

  it('renders timestamp when provided', async () => {
    const onConfirm = vi.fn();
    const timestamp = new Date().toISOString();
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <RewindConfirmation
        stats={null}
        onConfirm={onConfirm}
        terminalWidth={80}
        timestamp={timestamp}
      />,
      { width: 80 },
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).not.toContain('Revert code changes');
    unmount();
  });
});
