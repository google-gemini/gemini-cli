/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ShellModeIndicator } from './ShellModeIndicator.js';

describe('ShellModeIndicator', () => {
  it('should render shell mode enabled text', () => {
    const { lastFrame } = render(<ShellModeIndicator />);
    expect(lastFrame()).toContain('shell mode enabled');
  });

  it('should render escape instruction', () => {
    const { lastFrame } = render(<ShellModeIndicator />);
    expect(lastFrame()).toContain('esc to disable');
  });

  it('should render complete message', () => {
    const { lastFrame } = render(<ShellModeIndicator />);
    expect(lastFrame()).toContain('shell mode enabled');
    expect(lastFrame()).toContain('(esc to disable)');
  });

  it('should render as React component', () => {
    const { unmount } = render(<ShellModeIndicator />);
    expect(unmount).toBeDefined();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ShellModeIndicator />);
    }).not.toThrow();
  });

  it('should have no props required', () => {
    expect(() => {
      render(<ShellModeIndicator />);
    }).not.toThrow();
  });

  it('should render instruction in parentheses', () => {
    const { lastFrame } = render(<ShellModeIndicator />);
    const output = lastFrame();
    expect(output).toMatch(/\(esc to disable\)/);
  });

  it('should display user-friendly message', () => {
    const { lastFrame } = render(<ShellModeIndicator />);
    const output = lastFrame();
    expect(output.toLowerCase()).toContain('shell');
    expect(output.toLowerCase()).toContain('mode');
  });
});
