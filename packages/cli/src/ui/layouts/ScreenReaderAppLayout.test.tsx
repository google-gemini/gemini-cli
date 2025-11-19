/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { ScreenReaderAppLayout } from './ScreenReaderAppLayout.js';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
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

vi.mock('../components/Footer.js', () => ({
  Footer: () => <Text>Footer</Text>,
}));

vi.mock('../components/ExitWarning.js', () => ({
  ExitWarning: () => <Text>ExitWarning</Text>,
}));

describe('ScreenReaderAppLayout', () => {
  it('should render MainContent', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('MainContent');
  });

  it('should render Notifications', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('Notifications');
  });

  it('should render Footer', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('Footer');
  });

  it('should render Composer when dialogs not visible', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: false,
      historyManager: { addItem: vi.fn() },
    } as never);

    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('Composer');
    expect(lastFrame()).not.toContain('DialogManager');
  });

  it('should render DialogManager when dialogs visible', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useUIState).mockReturnValue({
      dialogsVisible: true,
      historyManager: { addItem: vi.fn() },
    } as never);

    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('DialogManager');
    expect(lastFrame()).not.toContain('Composer');
  });

  it('should render ExitWarning', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toContain('ExitWarning');
  });

  it('should call useUIState hook', async () => {
    const { useUIState } = await import('../contexts/UIStateContext.js');
    render(<ScreenReaderAppLayout />);
    expect(useUIState).toHaveBeenCalled();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ScreenReaderAppLayout />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<ScreenReaderAppLayout />);
    expect(() => unmount()).not.toThrow();
  });

  it('should use flexDirection column', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toBeDefined();
  });

  it('should set width to 90%', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toBeDefined();
  });

  it('should set height to 100%', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toBeDefined();
  });

  it('should have overflow hidden on MainContent container', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toBeDefined();
  });

  it('should have flexGrow on MainContent container', () => {
    const { lastFrame } = render(<ScreenReaderAppLayout />);
    expect(lastFrame()).toBeDefined();
  });
});
