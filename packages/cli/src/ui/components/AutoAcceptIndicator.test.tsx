/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { AutoAcceptIndicator } from './AutoAcceptIndicator.js';
import { describe, it, expect } from 'vitest';
import { ApprovalMode } from '@google/gemini-cli-core';

describe('AutoAcceptIndicator', () => {
  it('renders correctly for AUTO_EDIT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    const output = lastFrame();
    expect(output).toContain('accepting edits');
    expect(output).toContain('(shift + tab to toggle)');
  });

  it('renders correctly for YOLO mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    const output = lastFrame();
    expect(output).toContain('YOLO mode');
    expect(output).toContain('(ctrl + y to toggle)');
  });

  it('renders nothing for DEFAULT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    const output = lastFrame();
    expect(output).not.toContain('accepting edits');
    expect(output).not.toContain('YOLO mode');
  });
});
