/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('RenderInline Homographs', () => {
  it('should render standard links normally', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://google.com for more" />,
    );
    const output = lastFrame();
    expect(output).toContain('https://google.com');
    expect(output).not.toContain('potential homograph');
  });

  it('should highlight potential homograph links', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Visit https://täst.com for more" />,
    );
    const output = lastFrame();
    expect(output).toContain('https://täst.com');
    expect(output).toContain('(potential homograph)');
  });

  it('should highlight potential homograph in markdown links', () => {
    const { lastFrame } = renderWithProviders(
      <RenderInline text="Check [this link](https://еxample.com)" />,
    );
    const output = lastFrame();
    expect(output).toContain('https://еxample.com');
    expect(output).toContain('(potential homograph)');
  });
});
