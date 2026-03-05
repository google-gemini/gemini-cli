/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ReactElement } from 'react';
import { renderWithProviders } from '../../../test-utils/render.js';
import { UserMessage } from './UserMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { MediaVisualizer } from '../MediaVisualizer.js';

// Mock the commandUtils to control isSlashCommand behavior
vi.mock('../../utils/commandUtils.js', () => ({
  isSlashCommand: vi.fn((text: string) => text.startsWith('/')),
}));

// Mock MediaVisualizer to avoid running actual terminal-image in tests
vi.mock('../MediaVisualizer.js');
vi.mocked(MediaVisualizer).mockReturnValue(null as unknown as ReactElement);

describe('UserMessage', () => {
  it('renders normal user message with correct prefix', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserMessage text="Hello Gemini" width={80} />,
      { width: 80 },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders slash command message', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserMessage text="/help" width={80} />,
      { width: 80 },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline user message', async () => {
    const message = 'Line 1\nLine 2';
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserMessage text={message} width={80} />,
      { width: 80 },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('transforms image paths in user message', async () => {
    const message = 'Check out this image: @/path/to/my-image.png';
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <UserMessage text={message} width={80} />,
      { width: 80 },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toContain('[Image my-image.png]');
    expect(output).toMatchSnapshot();
    unmount();
  });
});
