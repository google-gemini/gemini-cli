/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ApprovalModeIndicator } from './ApprovalModeIndicator.js';
import { describe, it, expect } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';

describe('ApprovalModeIndicator', () => {
  it('renders correctly for AUTO_EDIT mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for AUTO_EDIT mode with plan enabled', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.AUTO_EDIT}
        allowPlanMode={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for PLAN mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for YOLO mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode with plan enabled', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.DEFAULT}
        allowPlanMode={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
