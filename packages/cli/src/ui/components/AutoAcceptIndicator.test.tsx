/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { AutoAcceptIndicator } from './AutoAcceptIndicator.js';
import { ApprovalMode } from '@google/gemini-cli-core';

describe('AutoAcceptIndicator', () => {
  it('should render empty for DEFAULT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render accepting edits for AUTO_EDIT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toContain('accepting edits');
  });

  it('should render shift + tab hint for AUTO_EDIT', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toContain('shift + tab to toggle');
  });

  it('should render YOLO mode for YOLO', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toContain('YOLO mode');
  });

  it('should render ctrl + y hint for YOLO', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toContain('ctrl + y to toggle');
  });

  it('should handle switch statement for all modes', () => {
    expect(() => {
      render(<AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />);
      render(<AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />);
      render(<AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />);
    }).not.toThrow();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(() => unmount()).not.toThrow();
  });

  it('should render Box component', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toBeDefined();
  });

  it('should display complete AUTO_EDIT message', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toMatch(/accepting edits.*shift \+ tab to toggle/);
  });

  it('should display complete YOLO message', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toMatch(/YOLO mode.*ctrl \+ y to toggle/);
  });

  it('should not render hints for DEFAULT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />,
    );
    expect(lastFrame()).not.toContain('shift + tab');
    expect(lastFrame()).not.toContain('ctrl + y');
  });

  it('should only show YOLO hint for YOLO mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />,
    );
    expect(lastFrame()).toContain('ctrl + y');
    expect(lastFrame()).not.toContain('shift + tab');
  });

  it('should only show AUTO_EDIT hint for AUTO_EDIT mode', () => {
    const { lastFrame } = render(
      <AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />,
    );
    expect(lastFrame()).toContain('shift + tab');
    expect(lastFrame()).not.toContain('ctrl + y');
  });
});
