/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderWithProviders } from '../../../test-utils/render.js';
import { HalfLinePaddedBox } from './HalfLinePaddedBox.js';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supportsTrueColor } from '@google/gemini-cli-core';

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
    supportsTrueColor: vi.fn(() => true),
  };
});

describe('<HalfLinePaddedBox />', () => {
  const mockUseIsScreenReaderEnabled = vi.mocked(useIsScreenReaderEnabled);
  const mockSupportsTrueColor = vi.mocked(supportsTrueColor);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standard background and blocks when true color is supported', async () => {
    mockSupportsTrueColor.mockReturnValue(true);

    const { lastFrame, unmount } = await renderWithProviders(
      <HalfLinePaddedBox backgroundBaseColor="blue" backgroundOpacity={0.5}>
        <Text>Content</Text>
      </HalfLinePaddedBox>,
      { width: 10 },
    );

    expect(lastFrame()).toMatchSnapshot();

    unmount();
  });

  it('renders alternative blocks when true color is not supported', async () => {
    mockSupportsTrueColor.mockReturnValue(false);

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
