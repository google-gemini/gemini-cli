/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ExitWarning } from './ExitWarning.js';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    dialogsVisible: false,
    ctrlCPressedOnce: false,
    ctrlDPressedOnce: false,
  })),
}));

describe('ExitWarning', () => {
  it('should render nothing when no warnings active', () => {
    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toBe('');
  });

  it('should render Ctrl+C warning when ctrlCPressedOnce is true', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: false,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toContain('Ctrl+C');
    expect(lastFrame()).toContain('again to exit');
  });

  it('should render Ctrl+D warning when ctrlDPressedOnce is true', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: true,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toContain('Ctrl+D');
    expect(lastFrame()).toContain('again to exit');
  });

  it('should not render when dialogsVisible is false', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: false,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: false,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toBe('');
  });

  it('should handle both warnings being false', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: false,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toBe('');
  });

  it('should render complete Ctrl+C message', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: false,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toContain('Press Ctrl+C again to exit.');
  });

  it('should render complete Ctrl+D message', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: true,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    expect(lastFrame()).toContain('Press Ctrl+D again to exit.');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ExitWarning />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ExitWarning />);
    expect(() => unmount()).not.toThrow();
  });

  it('should use UIState context', () => {
    expect(() => {
      render(<ExitWarning />);
    }).not.toThrow();
  });

  it('should have no required props', () => {
    expect(() => {
      render(<ExitWarning />);
    }).not.toThrow();
  });

  it('should show warning style message when active', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: false,
    } as never);

    const { lastFrame } = render(<ExitWarning />);
    const output = lastFrame();
    expect(output.length).toBeGreaterThan(0);
  });
});
