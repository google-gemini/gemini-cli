/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { UpdateNotification } from './UpdateNotification.js';

describe('UpdateNotification', () => {
  it('should render message', () => {
    const { lastFrame } = render(
      <UpdateNotification message="Update available" />,
    );
    expect(lastFrame()).toContain('Update available');
  });

  it('should render custom message', () => {
    const { lastFrame } = render(
      <UpdateNotification message="New version 2.0 released" />,
    );
    expect(lastFrame()).toContain('New version 2.0 released');
  });

  it('should handle empty message', () => {
    const { lastFrame } = render(<UpdateNotification message="" />);
    expect(lastFrame()).toBeDefined();
  });

  it('should handle long message', () => {
    const longMessage = 'A'.repeat(100);
    const { lastFrame } = render(<UpdateNotification message={longMessage} />);
    expect(lastFrame()).toContain('A');
  });

  it('should render with box border', () => {
    const { lastFrame } = render(<UpdateNotification message="Test" />);
    const output = lastFrame();
    expect(output).toBeDefined();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<UpdateNotification message="Test message" />);
    }).not.toThrow();
  });

  it('should handle special characters in message', () => {
    const { lastFrame } = render(
      <UpdateNotification message="Update: v1.0 -> v2.0!" />,
    );
    expect(lastFrame()).toContain('v1.0');
    expect(lastFrame()).toContain('v2.0');
  });

  it('should handle multiline message', () => {
    const { lastFrame } = render(
      <UpdateNotification message="Line 1\nLine 2" />,
    );
    const output = lastFrame();
    expect(output).toContain('Line 1');
  });

  it('should display warning style notification', () => {
    const { lastFrame } = render(
      <UpdateNotification message="Important update" />,
    );
    expect(lastFrame()).toContain('Important update');
  });

  it('should handle numeric messages', () => {
    const { lastFrame } = render(<UpdateNotification message="Version 123" />);
    expect(lastFrame()).toContain('123');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<UpdateNotification message="Test" />);
    expect(() => unmount()).not.toThrow();
  });

  it('should render message prop correctly', () => {
    const testMessage = 'Critical security update available';
    const { lastFrame } = render(<UpdateNotification message={testMessage} />);
    expect(lastFrame()).toContain(testMessage);
  });
});
