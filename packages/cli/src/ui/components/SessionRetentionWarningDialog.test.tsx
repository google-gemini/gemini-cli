/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionRetentionWarningDialog } from './SessionRetentionWarningDialog.js';
import { act } from 'react';

describe('SessionRetentionWarningDialog', () => {
  const onConfirm = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render correctly', () => {
    const { lastFrame } = renderWithProviders(
      <SessionRetentionWarningDialog onConfirm={onConfirm} />,
    );

    expect(lastFrame()).toMatchSnapshot();
    expect(lastFrame()).toContain('Session Retention Policy');
    expect(lastFrame()).toContain('Graceful Cleanup');
    expect(lastFrame()).toContain('Strict Cleanup');
  });

  it('should confirm with "graceful" when selecting "Graceful Cleanup"', async () => {
    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog onConfirm={onConfirm} />,
    );

    // Default selection is "Graceful Cleanup", so just press Enter
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('graceful');
    });
  });

  it('should confirm with "strict" when selecting "Strict Cleanup"', async () => {
    const { stdin } = renderWithProviders(
      <SessionRetentionWarningDialog onConfirm={onConfirm} />,
    );

    // Move down to "Strict Cleanup"
    act(() => {
      stdin.write('\x1b[B'); // Arrow Down
    });

    // Press Enter
    act(() => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('strict');
    });
  });
});
