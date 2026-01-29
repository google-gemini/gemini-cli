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
import { ApprovalMode } from '@google/gemini-cli-core';

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

  const samplePlanContent = `## Overview

Add user authentication to the CLI application.

## Implementation Steps

1. Create \`src/auth/AuthService.ts\` with login/logout methods
2. Add session storage in \`src/storage/SessionStore.ts\`
3. Update \`src/commands/index.ts\` to check auth status
4. Add tests in \`src/auth/__tests__/\`

## Files to Modify

- \`src/index.ts\` - Add auth middleware
- \`src/config.ts\` - Add auth configuration options`;

  const defaultProps = {
    planContent: samplePlanContent,
    onApprove: vi.fn(),
    onFeedback: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders correctly with plan content', () => {
    const { lastFrame } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onApprove with AUTO_EDIT mode when auto option is selected', async () => {
    const onApprove = vi.fn();
    const { stdin } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onApprove={onApprove} />,
    );

    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(ApprovalMode.AUTO_EDIT);
    });
  });

  it('calls onApprove with DEFAULT mode when manual option is selected', async () => {
    const onApprove = vi.fn();
    const { stdin } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onApprove={onApprove} />,
    );

    writeKey(stdin, '\x1b[B'); // Down arrow to manual option
    writeKey(stdin, '\r');

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(ApprovalMode.DEFAULT);
    });
  });

  it('calls onFeedback when feedback is typed and submitted', async () => {
    const onFeedback = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <PlanApprovalDialog {...defaultProps} onFeedback={onFeedback} />,
    );

    // Navigate past both options to the feedback input
    writeKey(stdin, '\x1b[B'); // Down arrow
    writeKey(stdin, '\x1b[B'); // Down arrow

    for (const char of 'Add tests') {
      writeKey(stdin, char);
    }

    await waitFor(() => {
      expect(lastFrame()).toMatchSnapshot();
    });

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
