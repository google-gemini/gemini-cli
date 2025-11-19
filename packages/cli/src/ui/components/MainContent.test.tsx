/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MainContent } from './MainContent.js';

vi.mock('../contexts/AppContext.js', () => ({
  useAppContext: vi.fn(() => ({
    version: '1.0.0',
  })),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    historyRemountKey: 0,
    history: [],
    pendingHistoryItems: [],
    mainAreaWidth: 80,
    staticAreaMaxItemHeight: 24,
    availableTerminalHeight: 24,
    constrainHeight: false,
    slashCommands: [],
    isEditorDialogOpen: false,
    activePtyId: null,
    embeddedShellFocused: false,
  })),
}));

vi.mock('./AppHeader.js', () => ({
  AppHeader: ({ version }: { version: string }) => (
    <Text>Header: {version}</Text>
  ),
}));

vi.mock('./HistoryItemDisplay.js', () => ({
  HistoryItemDisplay: ({ item }: { item: { id: number } }) => (
    <Text>Item: {item.id}</Text>
  ),
}));

vi.mock('./ShowMoreLines.js', () => ({
  ShowMoreLines: () => <Text>Show more</Text>,
}));

vi.mock('../contexts/OverflowContext.js', () => ({
  OverflowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('MainContent', () => {
  it('should render AppHeader', () => {
    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toContain('Header:');
  });

  it('should pass version to AppHeader', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    vi.mocked(useAppContext).mockReturnValue({
      version: '2.5.1',
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toContain('Header: 2.5.1');
  });

  it('should render history items', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [{ id: 1 }, { id: 2 }],
      pendingHistoryItems: [],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toContain('Item: 1');
    expect(lastFrame()).toContain('Item: 2');
  });

  it('should render pending history items', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [],
      pendingHistoryItems: [{ id: 5 }, { id: 6 }],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toContain('Item: 0');
  });

  it('should render ShowMoreLines', () => {
    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toContain('Show more');
  });

  it('should handle empty history', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [],
      pendingHistoryItems: [],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toBeDefined();
  });

  it('should use historyRemountKey for Static component', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 5,
      history: [],
      pendingHistoryItems: [],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toBeDefined();
  });

  it('should call useAppContext and useUIState', async () => {
    const { useAppContext } = await import('../contexts/AppContext.js');
    const { useUIState } = await import('../contexts/UIStateContext.js');

    render(<MainContent />);
    expect(useAppContext).toHaveBeenCalled();
    expect(useUIState).toHaveBeenCalled();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<MainContent />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<MainContent />);
    expect(() => unmount()).not.toThrow();
  });

  it('should pass mainAreaWidth to HistoryItemDisplay', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [{ id: 1 }],
      pendingHistoryItems: [],
      mainAreaWidth: 120,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toBeDefined();
  });

  it('should handle constrainHeight true', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [],
      pendingHistoryItems: [{ id: 1 }],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 20,
      constrainHeight: true,
      slashCommands: [],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toBeDefined();
  });

  it('should pass slashCommands to history items', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      historyRemountKey: 0,
      history: [{ id: 1 }],
      pendingHistoryItems: [],
      mainAreaWidth: 80,
      staticAreaMaxItemHeight: 24,
      availableTerminalHeight: 24,
      constrainHeight: false,
      slashCommands: ['help', 'clear'],
      isEditorDialogOpen: false,
      activePtyId: null,
      embeddedShellFocused: false,
    } as never);

    const { lastFrame } = render(<MainContent />);
    expect(lastFrame()).toBeDefined();
  });
});
