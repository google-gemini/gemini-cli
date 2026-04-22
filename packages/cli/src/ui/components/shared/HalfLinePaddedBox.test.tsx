/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { HalfLinePaddedBox } from './HalfLinePaddedBox.js';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isITerm2, isAppleTerminal } from '../../utils/terminalUtils.js';

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(() => false),
  };
});

describe('<HalfLinePaddedBox />', () => {
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standard background and blocks when not iTerm2 or Apple Terminal', async () => {
    vi.mocked(isITerm2).mockReturnValue(false);
    vi.mocked(isAppleTerminal).mockReturnValue(false);

    const renderResult = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();

    renderResult.unmount();
  });

  it('renders iTerm2-specific blocks when iTerm2 is detected', async () => {
    vi.mocked(isITerm2).mockReturnValue(true);
    vi.mocked(isAppleTerminal).mockReturnValue(false);

    const renderResult = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();

    renderResult.unmount();
  });

  it('renders Apple Terminal-specific blocks when Apple Terminal is detected', async () => {
    vi.mocked(isITerm2).mockReturnValue(false);
    vi.mocked(isAppleTerminal).mockReturnValue(true);

    const renderResult = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();

    renderResult.unmount();
  });

  it('renders nothing when useBackgroundColor is false', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <HalfLinePaddedBox
        backgroundBaseColor="blue"
        backgroundOpacity={0.5}
        useBackgroundColor={false}
      >
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('renders nothing when screen reader is enabled', async () => {
    mockUseIsScreenReaderEnabled.mockReturnValue(true);

    const { lastFrame, unmount } = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });
});
