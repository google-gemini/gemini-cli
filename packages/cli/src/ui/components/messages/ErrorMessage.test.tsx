/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ErrorMessage } from './ErrorMessage.js';

describe('ErrorMessage', () => {
  it('should render error prefix', () => {
    const { lastFrame } = render(<ErrorMessage text="Error occurred" />);
    expect(lastFrame()).toContain('✕');
  });

  it('should render error text', () => {
    const { lastFrame } = render(<ErrorMessage text="File not found" />);
    expect(lastFrame()).toContain('File not found');
  });

  it('should handle empty text', () => {
    const { lastFrame } = render(<ErrorMessage text="" />);
    expect(lastFrame()).toContain('✕');
  });

  it('should render complete error message', () => {
    const errorText = 'Connection timeout';
    const { lastFrame } = render(<ErrorMessage text={errorText} />);
    const output = lastFrame();
    expect(output).toContain('✕');
    expect(output).toContain(errorText);
  });

  it('should handle long error messages', () => {
    const longError = 'A'.repeat(100);
    const { lastFrame } = render(<ErrorMessage text={longError} />);
    expect(lastFrame()).toContain('A');
  });

  it('should handle multiline error text', () => {
    const { lastFrame } = render(
      <ErrorMessage text="Error on line 1\nError on line 2" />,
    );
    expect(lastFrame()).toContain('Error on line');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ErrorMessage text="test error" />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle special characters', () => {
    const { lastFrame } = render(
      <ErrorMessage text="Error: 'file.txt' not found" />,
    );
    expect(lastFrame()).toContain("'file.txt'");
  });

  it('should render with proper spacing', () => {
    const { lastFrame } = render(<ErrorMessage text="Test" />);
    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle error with numbers', () => {
    const { lastFrame } = render(<ErrorMessage text="Exit code: 1" />);
    expect(lastFrame()).toContain('Exit code: 1');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ErrorMessage text="error message" />);
    }).not.toThrow();
  });

  it('should display X mark symbol', () => {
    const { lastFrame } = render(<ErrorMessage text="Error" />);
    expect(lastFrame()).toMatch(/[✕×]/);
  });

  it('should handle error with paths', () => {
    const { lastFrame } = render(
      <ErrorMessage text="/path/to/file.ts not found" />,
    );
    expect(lastFrame()).toContain('/path/to/file.ts');
  });
});
