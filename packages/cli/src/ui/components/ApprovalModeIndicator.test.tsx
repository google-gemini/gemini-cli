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
  it('renders correctly for AUTO_EDIT mode', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for AUTO_EDIT mode with plan enabled', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.AUTO_EDIT}
        allowPlanMode={true}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for PLAN mode', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for YOLO mode', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly for DEFAULT mode with plan enabled', async () => {
    const { lastFrame, waitUntilReady } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.DEFAULT}
        allowPlanMode={true}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
