/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { describe, it, expect, vi } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';
import { useMouseClick } from '../hooks/useMouseClick.js';

vi.mock('../hooks/useMouseClick.js', () => ({
  useMouseClick: vi.fn(),
}));

describe('ApprovalModeIndicator', () => {
  it('renders correctly for AUTO_EDIT mode', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for AUTO_EDIT mode with plan enabled', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.AUTO_EDIT}
        allowPlanMode={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for PLAN mode', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for YOLO mode', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode with plan enabled', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.DEFAULT}
        allowPlanMode={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly when mouse mode is enabled', async () => {
    const { lastFrame } = await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
      {
        uiState: { mouseMode: true },
      },
    );
    expect(lastFrame()).toContain('click or Shift+Tab');
  });

  it('calls cycleApprovalMode when clicked', async () => {
    const cycleApprovalMode = vi.fn();
    let clickHandler: () => void = () => {};
    vi.mocked(useMouseClick).mockImplementation((_ref, handler) => {
      clickHandler = handler as () => void;
    });

    await renderWithProviders(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
      {
        uiActions: { cycleApprovalMode },
      },
    );

    clickHandler();
    expect(cycleApprovalMode).toHaveBeenCalled();
  });
});
