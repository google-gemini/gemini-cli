/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { UserMessage } from './UserMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';

// Mock the commandUtils to control isSlashCommand behavior
vi.mock('../../utils/commandUtils.js', () => ({
  isSlashCommand: vi.fn((text: string) => text.startsWith('/')),
}));

describe('UserMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders normal user message with correct prefix', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <UserMessage text="Hello Gemini" width={80} />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders slash command message', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <UserMessage text="/help" width={80} />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('renders multiline user message', async () => {
    const message = 'Line 1\nLine 2';
    const { lastFrame, unmount } = await renderWithProviders(
      <UserMessage text={message} width={80} />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('transforms image paths in user message', async () => {
    const message = 'Check out this image: @/path/to/my-image.png';
    const { lastFrame, unmount } = await renderWithProviders(
      <UserMessage text={message} width={80} />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toContain('[Image my-image.png]');
    expect(output).toMatchSnapshot();
    unmount();
  });

  describe('with NO_COLOR set', () => {
    beforeEach(() => {
      vi.stubEnv('NO_COLOR', '1');
    });

    it('uses margins instead of background blocks when NO_COLOR is set', async () => {
      const { lastFrame, unmount } = await renderWithProviders(
        <UserMessage text="Hello Gemini" width={80} />,
        { width: 80, config: makeFakeConfig({ useBackgroundColor: true }) },
      );
      const output = lastFrame();

      // In NO_COLOR mode, the block characters (▄/▀) should NOT be present.
      expect(output).not.toContain('▄');
      expect(output).not.toContain('▀');

      // There should be empty lines above and below the message due to marginY={1}.
      // lastFrame() returns the full buffer, so we can check for leading/trailing newlines or empty lines.
      const lines = output.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('> Hello Gemini');

      expect(output).toMatchSnapshot();

      unmount();
    });
  });
});
