/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { AuthInProgress } from './AuthInProgress.js';

describe('AuthInProgress Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should display authentication in progress message', () => {
    const onTimeout = vi.fn();
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    expect(lastFrame()).toContain('Waiting for auth...');
  });

  it('should show loading indicator with spinner', () => {
    const onTimeout = vi.fn();
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    // Should contain spinner characters
    const output = lastFrame();
    expect(output?.length).toBeGreaterThan(0);
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/); // Spinner characters
  });

  it('should display ESC cancellation instruction', () => {
    const onTimeout = vi.fn();
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    expect(lastFrame()).toContain('Press ESC to cancel');
  });

  it('should handle authentication timeout after 180 seconds', () => {
    const onTimeout = vi.fn();

    render(<AuthInProgress onTimeout={onTimeout} />);

    // Fast-forward time to 180 seconds
    vi.advanceTimersByTime(180000);

    expect(onTimeout).toHaveBeenCalled();
  });

  it('should not timeout before 180 seconds', () => {
    const onTimeout = vi.fn();

    render(<AuthInProgress onTimeout={onTimeout} />);

    // Fast-forward time to just before timeout
    vi.advanceTimersByTime(179000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should display timeout message when timed out', () => {
    const onTimeout = vi.fn();

    const { lastFrame, rerender } = render(
      <AuthInProgress onTimeout={onTimeout} />,
    );

    // Fast-forward to trigger timeout
    vi.advanceTimersByTime(180000);

    // Rerender to see the timeout state
    rerender(<AuthInProgress onTimeout={onTimeout} />);

    expect(lastFrame()).toContain(
      'Authentication timed out. Please try again.',
    );
  });

  it('should handle ESC key press to call onTimeout', () => {
    const onTimeout = vi.fn();

    const { stdin } = render(<AuthInProgress onTimeout={onTimeout} />);

    // Simulate ESC key press
    stdin.write('\u001b'); // ESC key

    expect(onTimeout).toHaveBeenCalled();
  });

  it('should not call onTimeout on other key presses', () => {
    const onTimeout = vi.fn();

    const { stdin } = render(<AuthInProgress onTimeout={onTimeout} />);

    // Simulate other key presses
    stdin.write('\u0003'); // Ctrl+C
    stdin.write('q');
    stdin.write('\r'); // Enter

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should render with rounded border', () => {
    const onTimeout = vi.fn();
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    const output = lastFrame();
    // Should have border characters for rounded border
    expect(output).toContain('╭');
    expect(output).toContain('╮');
    expect(output).toContain('╰');
    expect(output).toContain('╯');
  });

  it('should have proper component structure', () => {
    const onTimeout = vi.fn();
    const { lastFrame } = render(<AuthInProgress onTimeout={onTimeout} />);

    const output = lastFrame();
    expect(output?.length).toBeGreaterThan(0);
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('null');
  });

  it('should call timeout only once during timeout period', () => {
    const onTimeout = vi.fn();

    render(<AuthInProgress onTimeout={onTimeout} />);

    // Fast-forward well past timeout
    vi.advanceTimersByTime(200000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('should cleanup timeout on unmount', () => {
    const onTimeout = vi.fn();

    const { unmount } = render(<AuthInProgress onTimeout={onTimeout} />);

    // Unmount before timeout
    unmount();

    // Fast-forward past timeout time
    vi.advanceTimersByTime(200000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('should set internal timeout state and call onTimeout after 180 seconds', () => {
    const onTimeout = vi.fn();

    render(<AuthInProgress onTimeout={onTimeout} />);

    // Should not timeout immediately
    expect(onTimeout).not.toHaveBeenCalled();

    // Advance to timeout
    vi.advanceTimersByTime(180000);

    // Should call onTimeout after timer expires
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
