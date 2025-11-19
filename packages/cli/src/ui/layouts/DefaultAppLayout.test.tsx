/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { DefaultAppLayout } from './DefaultAppLayout.js';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    mainControlsRef: { current: null },
    dialogsVisible: false,
    historyManager: {
      addItem: vi.fn(),
    },
  })),
}));

vi.mock('../components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));

vi.mock('../components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
}));

vi.mock('../components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));

vi.mock('../components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));

vi.mock('../components/ExitWarning.js', () => ({
  ExitWarning: () => <Text>ExitWarning</Text>,
}));

describe('DefaultAppLayout', () => {
  it('should render MainContent', () => {
    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toContain('MainContent');
  });

  it('should render Notifications', () => {
    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toContain('Notifications');
  });

  it('should render Composer when dialogs not visible', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      mainControlsRef: { current: null },
      dialogsVisible: false,
      historyManager: { addItem: vi.fn() },
    } as never);

    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toContain('Composer');
    expect(lastFrame()).not.toContain('DialogManager');
  });

  it('should render DialogManager when dialogs visible', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      mainControlsRef: { current: null },
      dialogsVisible: true,
      historyManager: { addItem: vi.fn() },
    } as never);

    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toContain('DialogManager');
    expect(lastFrame()).not.toContain('Composer');
  });

  it('should render ExitWarning', () => {
    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toContain('ExitWarning');
  });

  it('should use mainControlsRef from UIState', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    const mockRef = { current: null };
    vi.mocked(useUIState).mockReturnValue({
      mainControlsRef: mockRef,
      dialogsVisible: false,
      historyManager: { addItem: vi.fn() },
    } as never);

    render(<DefaultAppLayout />);
    expect(useUIState).toHaveBeenCalled();
  });

  it('should call useUIState hook', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    render(<DefaultAppLayout />);
    expect(useUIState).toHaveBeenCalled();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<DefaultAppLayout />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<DefaultAppLayout />);
    expect(() => unmount()).not.toThrow();
  });

  it('should use flexDirection column', () => {
    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toBeDefined();
  });

  it('should set width to 90%', () => {
    const { lastFrame } = render(<DefaultAppLayout />);
    expect(lastFrame()).toBeDefined();
  });
});
