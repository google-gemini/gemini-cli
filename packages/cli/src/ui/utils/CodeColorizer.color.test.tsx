/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { describe, it, expect, vi } from 'vitest';

// eslint-disable-next-line import/no-internal-modules
import { renderToStaticMarkup } from 'react-dom/server';
import { colorizeCode } from './CodeColorizer.js';
import { darkTheme, Theme } from '../themes/theme.js';
import { DefaultDark } from '../themes/default.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock Ink components to render as simple HTML elements we can inspect
vi.mock('ink', () => ({
  Text: ({
    children,
    color,
  }: {
    children: React.ReactNode;
    color?: string;
  }) => <span data-color={color}>{children}</span>,
  Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock MaxSizedBox to just render children
vi.mock('../components/shared/MaxSizedBox.js', () => ({
  MaxSizedBox: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MINIMUM_MAX_HEIGHT: 5,
}));

// Mock isAlternateBufferEnabled
vi.mock('../hooks/useAlternateBuffer.js', () => ({
  isAlternateBufferEnabled: () => false,
}));

describe('CodeColorizer Colors', () => {
  it('renders JS keywords with AccentBlue', () => {
    const code = 'const a = 1;';
    const result = colorizeCode({
      code,
      language: 'javascript',
      maxWidth: 80,
      theme: DefaultDark,
      settings: {
        merged: { ui: { showLineNumbers: false } },
      } as unknown as LoadedSettings,
    });

    const html = renderToStaticMarkup(result as React.ReactElement);

    // Check for 'const' wrapped in AccentBlue (#89B4FA -> #89b4fa)
    expect(html).toContain(
      `data-color="${darkTheme.AccentBlue.toLowerCase()}">const</span>`,
    );
  });

  it('renders JS strings with AccentYellow', () => {
    const code = 'const a = "hello";';
    const result = colorizeCode({
      code,
      language: 'javascript',
      maxWidth: 80,
      theme: DefaultDark,
      settings: {
        merged: { ui: { showLineNumbers: false } },
      } as unknown as LoadedSettings,
    });

    const html = renderToStaticMarkup(result as React.ReactElement);
    // Expect &quot; for "
    expect(html).toContain(
      `data-color="${darkTheme.AccentYellow.toLowerCase()}">&quot;hello&quot;</span>`,
    );
  });

  it('renders Python keywords with AccentBlue', () => {
    const code = 'def foo(): pass';
    const result = colorizeCode({
      code,
      language: 'python',
      maxWidth: 80,
      theme: DefaultDark,
      settings: {
        merged: { ui: { showLineNumbers: false } },
      } as unknown as LoadedSettings,
    });

    const html = renderToStaticMarkup(result as React.ReactElement);
    expect(html).toContain(
      `data-color="${darkTheme.AccentBlue.toLowerCase()}">def</span>`,
    );
    expect(html).toContain(
      `data-color="${darkTheme.AccentBlue.toLowerCase()}">pass</span>`,
    );
  });

  it('renders correctly with a custom theme', () => {
    // Create a mock custom theme where keywords are red
    const customColors = { ...darkTheme, AccentBlue: '#FF0000' }; // Red
    const customTheme = new Theme(
      'CustomRed',
      'dark',
      {
        'hljs-keyword': { color: '#FF0000' },
      },
      customColors,
    );

    const code = 'const a = 1;';
    const result = colorizeCode({
      code,
      language: 'javascript',
      maxWidth: 80,
      theme: customTheme,
      settings: {
        merged: { ui: { showLineNumbers: false } },
      } as unknown as LoadedSettings,
    });

    const html = renderToStaticMarkup(result as React.ReactElement);
    expect(html).toContain(`data-color="#ff0000">const</span>`);
  });
});
