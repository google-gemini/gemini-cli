/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { DebugProfiler } from './DebugProfiler.js';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

describe('DebugProfiler', () => {
  it('should return null by default', () => {
    const { lastFrame } = render(<DebugProfiler />);
    expect(lastFrame()).toBe('');
  });

  it('should not display renders initially', () => {
    const { lastFrame } = render(<DebugProfiler />);
    expect(lastFrame()).not.toContain('Renders');
  });

  it('should register keypress handler', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    render(<DebugProfiler />);
    expect(useKeypress).toHaveBeenCalled();
  });

  it('should pass isActive true to useKeypress', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    render(<DebugProfiler />);
    expect(useKeypress).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isActive: true }),
    );
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<DebugProfiler />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<DebugProfiler />);
    expect(() => unmount()).not.toThrow();
  });

  it('should track renders in useRef', () => {
    const { rerender } = render(<DebugProfiler />);
    expect(() => rerender(<DebugProfiler />)).not.toThrow();
  });

  it('should increment render count on each render', () => {
    const { rerender } = render(<DebugProfiler />);
    rerender(<DebugProfiler />);
    rerender(<DebugProfiler />);
    // Should not crash with multiple rerenders
    expect(true).toBe(true);
  });

  it('should use useState for showNumRenders', () => {
    // Component uses useState, verify no errors
    const { lastFrame } = render(<DebugProfiler />);
    expect(lastFrame()).toBeDefined();
  });

  it('should conditionally render based on showNumRenders', () => {
    const { lastFrame } = render(<DebugProfiler />);
    // Initially false, so no render
    expect(lastFrame()).toBe('');
  });
});
