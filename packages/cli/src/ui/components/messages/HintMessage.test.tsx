/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { HintMessage } from './HintMessage.js';
import { describe, it, expect, vi } from 'vitest';
import { makeFakeConfig } from '@google/gemini-cli-core';

describe('HintMessage', () => {
  it('renders normal hint message with correct prefix', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <HintMessage text="Try this instead" />,
      { width: 80 },
    );
    const output = lastFrame();

    expect(output).toContain('💡');
    expect(output).toContain('Steering Hint: Try this instead');
    unmount();
  });

  it('uses margins instead of background blocks when NO_COLOR is set', async () => {
    vi.stubEnv('NO_COLOR', '1');
    const { lastFrame, unmount } = await renderWithProviders(
      <HintMessage text="Try this instead" />,
      { width: 80, config: makeFakeConfig({ useBackgroundColor: true }) },
    );
    const output = lastFrame();

    // In NO_COLOR mode, the block characters (▄/▀) should NOT be present.
    expect(output).not.toContain('▄');
    expect(output).not.toContain('▀');

    const lines = output.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('💡');
    expect(lines[0]).toContain('Steering Hint: Try this instead');

    vi.unstubAllEnvs();
    unmount();
  });
});
