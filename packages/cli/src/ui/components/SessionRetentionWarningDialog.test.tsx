/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
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

  it('renders correctly with warning message and session count', () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={42}
      />,
    );

    expect(lastFrame()).toContain('Keep chat history');
    expect(lastFrame()).toContain(
      'introducing a limit on how long chat sessions are stored',
    );
    expect(lastFrame()).toContain('Keep for 30 days (Recommended)');
    expect(lastFrame()).toContain('42 sessions will be deleted immediately');
    expect(lastFrame()).toContain('Keep for 90 days');
    expect(lastFrame()).toContain('No sessions will be deleted at this time');
    expect(lastFrame()).toContain(
      'Adjust the retention period with sessionRetention.maxAge in settings.json',
    );
  });

  it('renders correctly with 0 sessions to delete', () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={0}
      />,
    );

    expect(lastFrame()).toContain('No sessions will be deleted immediately');
  });

  it('defaults to "Keep for 90 days" when there are sessions to delete', async () => {
    const onKeep90Days = vi.fn();
    const onKeep30Days = vi.fn();

    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={onKeep90Days}
        onKeep30Days={onKeep30Days}
        sessionsToDeleteCount={10}
      />,
    );

    // Initial selection should be "Keep for 90 days" (index 1) because count > 0
    // Pressing Enter immediately should select it.
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onKeep90Days).toHaveBeenCalled();
      expect(onKeep30Days).not.toHaveBeenCalled();
    });
  });

  it('defaults to "Keep for 30 days" when there are NO sessions to delete', async () => {
    const onKeep90Days = vi.fn();
    const onKeep30Days = vi.fn();

    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={onKeep90Days}
        onKeep30Days={onKeep30Days}
        sessionsToDeleteCount={0}
      />,
    );

    // Initial selection should be "Keep for 30 days" (index 0) because count === 0
    // Pressing Enter immediately should select it.
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onKeep30Days).toHaveBeenCalled();
      expect(onKeep90Days).not.toHaveBeenCalled();
    });
  });

  it('calls onKeep30Days when "Keep for 30 days" is explicitly selected (from 90 days default)', async () => {
    const onKeep90Days = vi.fn();
    const onKeep30Days = vi.fn();

    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={onKeep90Days}
        onKeep30Days={onKeep30Days}
        sessionsToDeleteCount={10}
      />,
    );

    // Default is index 1 (90 days). Move UP to index 0 (30 days).
    writeKey(stdin, '\x1b[A'); // Up arrow
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onKeep30Days).toHaveBeenCalled();
      expect(onKeep90Days).not.toHaveBeenCalled();
    });
  });

  it('should match snapshot', async () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep90Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={123}
      />,
    );

    // Initial render
    expect(lastFrame()).toMatchSnapshot();
  });
});
