/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { SessionRetentionWarningDialog } from './SessionRetentionWarningDialog.js';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';

// Helper to write to stdin
const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

describe('SessionRetentionWarningDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly with warning message', () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog
        onCleanUpNow={vi.fn()}
        onCleanUpIn30Days={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain('Session Retention Policy Update');
    expect(lastFrame()).toContain('60-day default session retention'); // More robust substring
    expect(lastFrame()).toContain('Clean up old sessions now');
    expect(lastFrame()).toContain('Defer cleanup for 30 days');
    expect(lastFrame()).toContain(
      'Adjust the session retention period with sessionRetention.maxAge in settings.json',
    );
  });

  it('calls onCleanUpNow when "Clean up old sessions now" is selected', async () => {
    const onCleanUpNow = vi.fn();
    const onCleanUpIn30Days = vi.fn();

    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog
        onCleanUpNow={onCleanUpNow}
        onCleanUpIn30Days={onCleanUpIn30Days}
      />,
    );

    // Move to the second option: 'Clean up old sessions now'
    writeKey(stdin, '\x1b[B'); // Down arrow
    writeKey(stdin, '\r'); // Press Enter

    await waitFor(() => {
      expect(onCleanUpNow).toHaveBeenCalled();
      expect(onCleanUpIn30Days).not.toHaveBeenCalled();
    });
  });

  it('calls onCleanUpIn30Days when "Defer cleanup for 30 days" is selected', async () => {
    const onCleanUpNow = vi.fn();
    const onCleanUpIn30Days = vi.fn();

    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog
        onCleanUpNow={onCleanUpNow}
        onCleanUpIn30Days={onCleanUpIn30Days}
      />,
    );

    // Initial selection is the first option: 'Defer cleanup for 30 days'
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onCleanUpIn30Days).toHaveBeenCalled();
      expect(onCleanUpNow).not.toHaveBeenCalled();
    });
  });

  it('should match snapshot', async () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog
        onCleanUpNow={vi.fn()}
        onCleanUpIn30Days={vi.fn()}
      />,
    );

    // Initial render
    expect(lastFrame()).toMatchSnapshot();
  });
});
