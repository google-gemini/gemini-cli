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
    const output = lastFrame();
    expect(output).toContain('auto-edit');
    expect(output).toContain('shift + tab to enter default mode');
  });

  it('renders correctly for AUTO_EDIT mode with plan enabled', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.AUTO_EDIT}
        isPlanEnabled={true}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('auto-edit');
    expect(output).toContain('shift + tab to enter default mode');
  });

  it('renders correctly for PLAN mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />,
    );
    const output = lastFrame();
    expect(output).toContain('plan');
    expect(output).toContain('shift + tab to enter auto-edit mode');
  });

  it('renders correctly for YOLO mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    const output = lastFrame();
    expect(output).toContain('YOLO');
    expect(output).toContain('shift + tab to enter auto-edit mode');
  });

  it('renders correctly for DEFAULT mode', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    const output = lastFrame();
    expect(output).toContain('shift + tab to enter auto-edit mode');
  });

  it('renders correctly for DEFAULT mode with plan enabled', () => {
    const { lastFrame } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.DEFAULT}
        isPlanEnabled={true}
      />,
    );
    const output = lastFrame();
    expect(output).toContain('shift + tab to enter plan mode');
  });
});
