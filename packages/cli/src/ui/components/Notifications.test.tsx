/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Notifications } from './Notifications.js';
import { StreamingState } from '../types.js';

vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: vi.fn(() => ({
    startupWarnings: [],
  })),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    initError: null,
    streamingState: StreamingState.Idle,
    updateInfo: null,
  })),
}));

vi.mock('./UpdateNotification.js', () => ({
  UpdateNotification: ({ message }: { message: string }) => (
    <Text>Update: {message}</Text>
  ),
}));

describe('Notifications', () => {
  it('should return null when no notifications', () => {
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toBe('');
  });

  it('should render startup warnings', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    vi.mocked(useAppContext).mockReturnValue({
      startupWarnings: ['Warning 1', 'Warning 2'],
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('Warning 1');
    expect(lastFrame()).toContain('Warning 2');
  });

  it('should render initialization error', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      initError: 'API key invalid',
      streamingState: StreamingState.Idle,
      updateInfo: null,
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('Initialization Error: API key invalid');
  });

  it('should show help message with init error', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      initError: 'Error occurred',
      streamingState: StreamingState.Idle,
      updateInfo: null,
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('Please check API key and configuration');
  });

  it('should not show init error when streaming', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      initError: 'Error occurred',
      streamingState: StreamingState.Responding,
      updateInfo: null,
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).not.toContain('Initialization Error');
  });

  it('should render update notification', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      initError: null,
      streamingState: StreamingState.Idle,
      updateInfo: { message: 'New version available' },
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('Update: New version available');
  });

  it('should render multiple notification types', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    const { useUIState } = await import('../contexts/UIStateContext.js');

    vi.mocked(useAppContext).mockReturnValue({
      startupWarnings: ['Warning'],
    } as never);
    vi.mocked(useUIState).mockReturnValue({
      initError: 'Error',
      streamingState: StreamingState.Idle,
      updateInfo: { message: 'Update' },
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('Warning');
    expect(lastFrame()).toContain('Error');
    expect(lastFrame()).toContain('Update');
  });

  it('should map over all startup warnings', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    vi.mocked(useAppContext).mockReturnValue({
      startupWarnings: ['W1', 'W2', 'W3', 'W4'],
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toContain('W1');
    expect(lastFrame()).toContain('W2');
    expect(lastFrame()).toContain('W3');
    expect(lastFrame()).toContain('W4');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<Notifications />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<Notifications />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle empty startup warnings array', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useAppContext).mockReturnValue({
      startupWarnings: [],
    } as never);
    vi.mocked(useUIState).mockReturnValue({
      initError: null,
      streamingState: StreamingState.Idle,
      updateInfo: null,
    } as never);

    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toBe('');
  });

  it('should call useAppContext and useUIState', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    const { useUIState } = await import('../contexts/UIStateContext.js');

    render(<Notifications />);
    expect(useAppContext).toHaveBeenCalled();
    expect(useUIState).toHaveBeenCalled();
  });
});
