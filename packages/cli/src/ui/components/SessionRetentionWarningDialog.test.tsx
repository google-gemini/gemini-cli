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

  it('renders correctly with warning message and session count', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep120Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={42}
      />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Keep chat history');
    expect(lastFrame()).toContain(
      'introducing a limit on how long chat sessions are stored',
    );
    expect(lastFrame()).toContain('Keep for 30 days (Recommended)');
    expect(lastFrame()).toContain('42 sessions will be deleted');
    expect(lastFrame()).toContain('Keep for 120 days');
    expect(lastFrame()).toContain('No sessions will be deleted at this time');
  });

  it('handles pluralization correctly for 1 session', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep120Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={1}
      />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('1 session will be deleted');
  });

  it('defaults to "Keep for 120 days" when there are sessions to delete', async () => {
    const onKeep120Days = vi.fn();
    const onKeep30Days = vi.fn();

    const { stdin, waitUntilReady } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep120Days={onKeep120Days}
        onKeep30Days={onKeep30Days}
        sessionsToDeleteCount={10}
      />,
    );
    await waitUntilReady();

    // Initial selection should be "Keep for 120 days" (index 1) because count > 0
    // Pressing Enter immediately should select it.
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onKeep120Days).toHaveBeenCalled();
      expect(onKeep30Days).not.toHaveBeenCalled();
    });
  });

  it('calls onKeep30Days when "Keep for 30 days" is explicitly selected (from 120 days default)', async () => {
    const onKeep120Days = vi.fn();
    const onKeep30Days = vi.fn();

    const { stdin, waitUntilReady } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep120Days={onKeep120Days}
        onKeep30Days={onKeep30Days}
        sessionsToDeleteCount={10}
      />,
    );
    await waitUntilReady();

    // Default is index 1 (120 days). Move UP to index 0 (30 days).
    writeKey(stdin, '\x1b[A'); // Up arrow
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onKeep30Days).toHaveBeenCalled();
      expect(onKeep120Days).not.toHaveBeenCalled();
    });
  });

  it('should match snapshot', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <SessionRetentionWarningDialog
        onKeep120Days={vi.fn()}
        onKeep30Days={vi.fn()}
        sessionsToDeleteCount={123}
      />,
    );
    await waitUntilReady();

    // Initial render
    expect(lastFrame()).toMatchSnapshot();
  });
});
