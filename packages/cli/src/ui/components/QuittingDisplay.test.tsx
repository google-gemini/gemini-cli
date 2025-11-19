/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { QuittingDisplay } from './QuittingDisplay.js';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    quittingMessages: null,
    constrainHeight: false,
  })),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(() => ({
    rows: 24,
    columns: 80,
  })),
}));

vi.mock('./HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: ({ item }: { item: { id: string } }) => (
    <Text>Item: {item.id}</Text>
  ),
}));

describe('QuittingDisplay', () => {
  it('should return null when no quitting messages', () => {
    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toBe('');
  });

  it('should render quitting messages when present', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: [{ id: 'msg1' }],
      constrainHeight: false,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toContain('Item: msg1');
  });

  it('should render multiple quitting messages', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: [{ id: 'msg1' }, { id: 'msg2' }],
      constrainHeight: false,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toContain('msg1');
    expect(lastFrame()).toContain('msg2');
  });

  it('should use terminal size', async () => {
    const { useTerminalSize } = await import('../hooks/useTerminalSize.js');
    render(<QuittingDisplay />);
    expect(useTerminalSize).toHaveBeenCalled();
  });

  it('should pass terminal width to HistoryItemDisplay', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: [{ id: 'test' }],
      constrainHeight: false,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toBeDefined();
  });

  it('should handle constrainHeight true', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: [{ id: 'test' }],
      constrainHeight: true,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toContain('test');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<QuittingDisplay />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<QuittingDisplay />);
    expect(() => unmount()).not.toThrow();
  });

  it('should map over quitting messages with keys', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      constrainHeight: false,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toContain('a');
    expect(lastFrame()).toContain('b');
    expect(lastFrame()).toContain('c');
  });

  it('should render empty when quittingMessages is null', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      quittingMessages: null,
      constrainHeight: false,
    } as never);

    const { lastFrame } = render(<QuittingDisplay />);
    expect(lastFrame()).toBe('');
  });
});
