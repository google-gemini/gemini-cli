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
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('auto-accept edits');
    expect(output).toContain('shift+tab to manual');
    unmount();
  });

  it('renders correctly for AUTO_EDIT mode with plan enabled', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.AUTO_EDIT}
        isPlanEnabled={true}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('auto-accept edits');
    expect(output).toContain('shift+tab to manual');
    unmount();
  });

  it('renders correctly for PLAN mode', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.PLAN} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('plan');
    expect(output).toContain('shift+tab to accept edits');
    unmount();
  });

  it('renders correctly for YOLO mode', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('YOLO');
    expect(output).toContain('ctrl+y');
    unmount();
  });

  it('renders correctly for DEFAULT mode', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('shift+tab to accept edits');
    unmount();
  });

  it('renders correctly for DEFAULT mode with plan enabled', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ApprovalModeIndicator
        approvalMode={ApprovalMode.DEFAULT}
        isPlanEnabled={true}
      />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('shift+tab to plan');
    unmount();
  });
});
