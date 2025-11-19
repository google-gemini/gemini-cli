/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';

describe('ConsoleSummaryDisplay', () => {
  it('should return null when errorCount is 0', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={0} />);
    expect(lastFrame()).toBe('');
  });

  it('should render error icon', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={1} />);
    expect(lastFrame()).toContain('✖');
  });

  it('should display single error correctly', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={1} />);
    expect(lastFrame()).toContain('1 error');
    expect(lastFrame()).not.toContain('errors');
  });

  it('should display multiple errors correctly', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={3} />);
    expect(lastFrame()).toContain('3 errors');
  });

  it('should show ctrl+o hint', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={1} />);
    expect(lastFrame()).toContain('ctrl+o for details');
  });

  it('should handle large error counts', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={99} />);
    expect(lastFrame()).toContain('99 errors');
  });

  it('should pluralize errors for 2', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={2} />);
    expect(lastFrame()).toContain('2 errors');
  });

  it('should not render when no errors', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={0} />);
    expect(lastFrame()).toBe('');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ConsoleSummaryDisplay errorCount={5} />);
    expect(() => unmount()).not.toThrow();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ConsoleSummaryDisplay errorCount={10} />);
    }).not.toThrow();
  });

  it('should show error count in output', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={7} />);
    const output = lastFrame();
    expect(output).toContain('7');
    expect(output).toContain('error');
  });

  it('should render complete message for single error', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={1} />);
    expect(lastFrame()).toMatch(/✖.*1 error.*ctrl\+o for details/);
  });

  it('should render complete message for multiple errors', () => {
    const { lastFrame } = render(<ConsoleSummaryDisplay errorCount={5} />);
    expect(lastFrame()).toMatch(/✖.*5 errors.*ctrl\+o for details/);
  });
});
