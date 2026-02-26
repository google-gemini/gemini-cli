/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { GeminiPrivacyNotice } from './GeminiPrivacyNotice.js';
import { useKeypress } from '../hooks/useKeypress.js';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const mockedUseKeypress = useKeypress as Mock;

describe('GeminiPrivacyNotice', () => {
  const onExit = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <GeminiPrivacyNotice onExit={onExit} />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Gemini API Key Notice');
    expect(lastFrame()).toContain('By using the Gemini API');
    expect(lastFrame()).toContain('Press Esc to exit');
    unmount();
  });

  it('exits on Escape', async () => {
    const { waitUntilReady, unmount } = render(
      <GeminiPrivacyNotice onExit={onExit} />,
    );
    await waitUntilReady();

    const keypressHandler = mockedUseKeypress.mock.calls[0][0];
    await act(async () => {
      keypressHandler({ name: 'escape' });
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    expect(onExit).toHaveBeenCalled();
    unmount();
  });
});
