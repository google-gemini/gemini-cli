/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { HalfLinePaddedBox } from './HalfLinePaddedBox.js';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAppleTerminal } from '@google/gemini-cli-core';

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useIsScreenReaderEnabled: vi.fn(() => false),
  };
});

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    isAppleTerminal: vi.fn(() => false),
  };
});

describe('<HalfLinePaddedBox />', () => {
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);
  const mockIsAppleTerminal = vi.mocked(isAppleTerminal);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standard background and blocks when not Apple Terminal', async () => {
    mockIsAppleTerminal.mockReturnValue(false);

    const { lastFrame, unmount } = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('renders Apple Terminal-specific blocks when detected', async () => {
    mockIsAppleTerminal.mockReturnValue(true);

    const { lastFrame, unmount } = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    expect(lastFrame()).toMatchSnapshot();

    unmount();
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
