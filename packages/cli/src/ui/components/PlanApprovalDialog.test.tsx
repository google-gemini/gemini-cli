/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { PlanApprovalDialog } from './PlanApprovalDialog.js';

// Helper to write to stdin with proper act() wrapping
const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

describe('PlanApprovalDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    planPath: 'plans/test-feature.md',
    onApprove: vi.fn(),
    onFeedback: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders correctly with plan path', () => {
    const { lastFrame } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onApprove when "Yes" is selected', async () => {
    const onApprove = vi.fn();
    const { stdin } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onApprove={onApprove} />,
    );

    // Initial focus is on "Yes"
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalled();
    });
  });

  it('calls onFeedback when feedback is typed and submitted', async () => {
    const onFeedback = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onFeedback={onFeedback} />,
    );

    // Move down to feedback field
    writeKey(stdin, '\x1b[B');

    // Type feedback
    for (const char of 'Add tests') {
      writeKey(stdin, char);
    }

    await waitFor(() => {
      expect(lastFrame()).toContain('Add tests');
    });

    // Press Enter to submit feedback
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith('Add tests');
    });
  });

  it('calls onCancel when Esc is pressed', async () => {
    const onCancel = vi.fn();
    const { stdin } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onCancel={onCancel} />,
    );

    writeKey(stdin, '\x1b'); // Escape

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
