/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { StashedPromptDisplay } from './StashedPromptDisplay.js';

describe('StashedPromptDisplay', () => {
  it('renders nothing when no stash exists', async () => {
    const { lastFrame, unmount } = await render(
      <StashedPromptDisplay stashedPrompt={null} />,
    );

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('displays stash indicator when stash exists', async () => {
    const { lastFrame, unmount } = await render(
      <StashedPromptDisplay stashedPrompt="some stashed text" />,
    );

    const output = lastFrame();
    expect(output).toContain('Stashed (restores after submit)');
    unmount();
  });

  it('does not display the stashed text content', async () => {
    const { lastFrame, unmount } = await render(
      <StashedPromptDisplay stashedPrompt="secret stashed content" />,
    );

    const output = lastFrame();
    expect(output).toContain('Stashed');
    expect(output).not.toContain('secret stashed content');
    unmount();
  });
});
