/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import { act } from 'react';

describe('ApprovalModeIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const modes = [
    { mode: ApprovalMode.AUTO_EDIT, name: 'AUTO_EDIT' },
    { mode: ApprovalMode.PLAN, name: 'PLAN' },
    { mode: ApprovalMode.YOLO, name: 'YOLO' },
  ];

  it.each(modes)(
    'renders correctly for $name mode and hides tip after timeout',
    ({ mode }) => {
      const { lastFrame } = renderWithProviders(
        <ApprovalModeIndicator approvalMode={mode} />,
      );

      // Initial render with tip
      expect(lastFrame()).toMatchSnapshot();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Render after timeout (tip should be gone)
      expect(lastFrame()).toMatchSnapshot();
    },
  );

  it('reshows tip when mode changes', () => {
    const { lastFrame, rerender } = renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );

    expect(lastFrame()).toContain('shift + tab');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(lastFrame()).not.toContain('shift + tab');

    act(() => {
      rerender(<ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />);
    });

    expect(lastFrame()).toContain('shift + tab');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders nothing for DEFAULT mode', () => {
    const { lastFrame } = renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
