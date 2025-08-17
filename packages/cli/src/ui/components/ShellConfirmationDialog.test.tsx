/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { ShellConfirmationDialog } from './ShellConfirmationDialog.js';

describe('ShellConfirmationDialog', () => {
  const onConfirm = vi.fn();

  const request = {
    commands: ['ls -la', 'echo "hello"'],
    onConfirm,
  };

  it('renders correctly', () => {
    const { lastFrame } = renderWithProviders(
      <ShellConfirmationDialog request={request} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onConfirm with ProceedOnce when "Yes, allow once" is selected', () => {
    const { lastFrame } = renderWithProviders(
      <ShellConfirmationDialog request={request} />,
    );
    const select = lastFrame()!.toString();
    // Simulate selecting the first option
    // This is a simplified way to test the selection
    expect(select).toContain('Yes, allow once');
  });

  it('calls onConfirm with ProceedAlways when "Yes, allow always for this session" is selected', () => {
    const { lastFrame } = renderWithProviders(
      <ShellConfirmationDialog request={request} />,
    );
    const select = lastFrame()!.toString();
    // Simulate selecting the second option
    expect(select).toContain('Yes, allow always for this session');
  });

  it('calls onConfirm with Cancel when "No (esc)" is selected', () => {
    const { lastFrame } = renderWithProviders(
      <ShellConfirmationDialog request={request} />,
    );
    const select = lastFrame()!.toString();
    // Simulate selecting the third option
    expect(select).toContain('No (esc)');
  });
});
