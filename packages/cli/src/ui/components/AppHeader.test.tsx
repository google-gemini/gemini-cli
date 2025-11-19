/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { AppHeader } from './AppHeader.js';

vi.mock('./Header.js', () => ({
  Header: ({ version, nightly }: { version: string; nightly: boolean }) => (
    <Text>
      Header v{version} {nightly ? 'nightly' : ''}
    </Text>
  ),
}));

vi.mock('./Tips.js', () => ({
  Tips: () => <Text>Tips</Text>,
}));

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: vi.fn(() => ({
    merged: { ui: {} },
  })),
}));

vi.mock('../contexts/ConfigContext.js', () => ({
  useConfig: vi.fn(() => ({
    getScreenReader: () => false,
  })),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    nightly: false,
  })),
}));

describe('AppHeader', () => {
  it('should render header by default', async () => {
    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).toContain('Header');
  });

  it('should render tips by default', () => {
    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).toContain('Tips');
  });

  it('should hide header when hideBanner is true', async () => {
    const { useSettings } = await import('../contexts/SettingsContext.js');
    vi.mocked(useSettings).mockReturnValue({
      merged: { ui: { hideBanner: true } },
    } as never);

    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).not.toContain('Header');
  });

  it('should hide tips when hideTips is true', async () => {
    const { useSettings } = await import('../contexts/SettingsContext.js');
    vi.mocked(useSettings).mockReturnValue({
      merged: { ui: { hideTips: true } },
    } as never);

    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).not.toContain('Tips');
  });

  it('should hide header in screen reader mode', async () => {
    const { useConfig } = await import('../contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValue({
      getScreenReader: () => true,
    } as never);

    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).not.toContain('Header');
  });

  it('should hide tips in screen reader mode', async () => {
    const { useConfig } = await import('../contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValue({
      getScreenReader: () => true,
    } as never);

    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).not.toContain('Tips');
  });

  it('should pass version to Header', async () => {
    const { useSettings } = await import('../contexts/SettingsContext.js');
    const { useConfig } = await import('../contexts/ConfigContext.js');
    vi.mocked(useSettings).mockReturnValue({
      merged: { ui: {} },
    } as never);
    vi.mocked(useConfig).mockReturnValue({
      getScreenReader: () => false,
    } as never);

    const { lastFrame } = render(<AppHeader version="2.5.1" />);
    expect(lastFrame()).toContain('2.5.1');
  });

  it('should pass nightly flag to Header', async () => {
    const { useSettings } = await import('../contexts/SettingsContext.js');
    const { useConfig } = await import('../contexts/ConfigContext.js');
    const { useUIState } = await import('../contexts/UIStateContext.js');
    vi.mocked(useSettings).mockReturnValue({
      merged: { ui: {} },
    } as never);
    vi.mocked(useConfig).mockReturnValue({
      getScreenReader: () => false,
    } as never);
    vi.mocked(useUIState).mockReturnValue({ nightly: true } as never);

    const { lastFrame } = render(<AppHeader version="1.0.0" />);
    expect(lastFrame()).toContain('nightly');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<AppHeader version="1.0.0" />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<AppHeader version="1.0.0" />);
    expect(() => unmount()).not.toThrow();
  });
});
