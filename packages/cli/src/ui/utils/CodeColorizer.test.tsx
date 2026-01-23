/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { colorizeCode } from './CodeColorizer.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { LoadedSettings } from '../../config/settings.js';

describe('colorizeCode', () => {
  it('renders empty lines correctly when useAlternateBuffer is true', () => {
    const code = 'line 1\n\nline 3';
    const settings = new LoadedSettings(
      { path: '', settings: {}, originalSettings: {} },
      { path: '', settings: {}, originalSettings: {} },
      {
        path: '',
        settings: { ui: { useAlternateBuffer: true, showLineNumbers: false } },
        originalSettings: {
          ui: { useAlternateBuffer: true, showLineNumbers: false },
        },
      },
      { path: '', settings: {}, originalSettings: {} },
      true,
      [],
    );

    const result = colorizeCode({
      code,
      language: 'javascript',
      maxWidth: 80,
      settings,
      hideLineNumbers: true,
    });

    const { lastFrame } = renderWithProviders(<>{result}</>);
    // We expect the output to preserve the empty line.
    // If the bug exists, it might look like "line 1\nline 3"
    // If fixed, it should look like "line 1\n \nline 3" (if we use space) or just have the newline.

    // We can check if the output matches the code (ignoring color codes if any, but lastFrame returns plain text usually unless configured otherwise)
    // Actually lastFrame() returns string with ANSI codes stripped by default in some setups, or not.
    // But ink-testing-library usually returns the visual representation.

    expect(lastFrame()).toMatch(/line 1\s*\n\s*\n\s*line 3/);
  });
});
