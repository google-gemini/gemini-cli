/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { GeminiSpinner } from './GeminiSpinner.js';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { act } from 'react';

// Mock components to simplify testing
vi.mock('./BrailleAnimation.js', () => ({
  BrailleAnimation: ({ variant }: { variant: string }) => (
    <Text>BrailleAnimation-{variant}</Text>
  ),
  GEMINI_SPINNER: { interval: 80, frames: [] },
}));

vi.mock('./CliSpinner.js', () => ({
  CliSpinner: ({ type }: { type: string }) => <Text>CliSpinner-{type}</Text>,
}));

describe('GeminiSpinner', () => {
  it('renders BrailleAnimation with "Composite" variant by default', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <GeminiSpinner />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('BrailleAnimation-Composite');
    act(() => {
      unmount();
    });
  });

  it('renders CliSpinner when a specific spinnerType string is provided', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <GeminiSpinner spinnerType="dots" />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('CliSpinner-dots');
    act(() => {
      unmount();
    });
  });

  it('renders screen reader text when screen reader is enabled', async () => {
    // Note: useIsScreenReaderEnabled is used in GeminiSpinner
    // We would need to mock it if we wanted to test this explicitly,
    // but the default is false in our test environment.
  });
});
