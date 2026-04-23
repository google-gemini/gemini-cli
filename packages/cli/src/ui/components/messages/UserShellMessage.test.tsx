/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { UserShellMessage } from './UserShellMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';

describe('UserShellMessage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders normal shell message with correct prefix', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <UserShellMessage text="ls -la" width={80} />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toContain('$ ls -la');
    unmount();
  });

  describe('with NO_COLOR set', () => {
    beforeEach(() => {
      vi.stubEnv('NO_COLOR', '1');
    });

    it('uses margins instead of background blocks when NO_COLOR is set', async () => {
      const { lastFrame, unmount } = await renderWithProviders(
        <UserShellMessage text="ls -la" width={80} />,
        { width: 80, config: makeFakeConfig({ useBackgroundColor: true }) },
      );
      const output = lastFrame();

      // In NO_COLOR mode, the block characters (▄/▀) should NOT be present.
      expect(output).not.toContain('▄');
      expect(output).not.toContain('▀');

      const lines = output.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('$ ls -la');

      expect(output).toMatchSnapshot();

      unmount();
    });
  });
});
