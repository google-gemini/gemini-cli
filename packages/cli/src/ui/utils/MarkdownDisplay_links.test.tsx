/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<MarkdownDisplay /> (Repro)', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 80,
    availableTerminalHeight: 40,
  };

  it('renders URLs excluding trailing Chinese punctuation', () => {
    const text = 'Check https://google.com。';
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    // We expect the URL to be colored differently from the punctuation.
    // ink-testing-library's lastFrame() returns ANSI encoded string.
    // We can't easily assert on colors without a helper, but we can verify the text content.
    // If the regex works, "https://google.com" and "。" are separate tokens.
    // If we snapshot it, we can manually inspect if needed, or rely on the fact that
    // if they were one token, the snapshot would look different (color codes wrapping both).
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file paths specially', () => {
    const text = 'File at marketing/seo-strategy-qa.md。';
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders file paths without punctuation', () => {
    const text = 'File marketing/seo-strategy-qa.md';
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
