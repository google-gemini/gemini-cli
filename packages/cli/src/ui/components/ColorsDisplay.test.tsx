/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { ColorsDisplay } from './ColorsDisplay.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { themeManager } from '../themes/theme-manager.js';
import type { Theme, ColorsTheme } from '../themes/theme.js';
import type { SemanticColors } from '../themes/semantic-tokens.js';

describe('ColorsDisplay', () => {
  beforeEach(() => {
    vi.spyOn(themeManager, 'getSemanticColors').mockReturnValue({
      text: {
        primary: '#ffffff',
        secondary: '#cccccc',
        link: '#0000ff',
        accent: '#ff00ff',
        response: '#ffffff',
      },
      background: {
        primary: '#000000',
        message: '#111111',
        input: '#222222',
        focus: '#333333',
        diff: {
          added: '#003300',
          removed: '#330000',
        },
      },
      border: {
        default: '#555555',
        focused: '#0000ff',
      },
      ui: {
        comment: '#666666',
        symbol: '#cccccc',
        dark: '#333333',
        focus: '#0000ff',
        gradient: undefined,
      },
      status: {
        error: '#ff0000',
        success: '#00ff00',
        warning: '#ffff00',
      },
    });

    vi.spyOn(themeManager, 'getActiveTheme').mockReturnValue({
      name: 'Test Theme',
      type: 'dark',
      colors: {} as unknown as ColorsTheme,
      semanticColors: {
        text: {
          primary: '#ffffff',
          secondary: '#cccccc',
          link: '#0000ff',
          accent: '#ff00ff',
          response: '#ffffff',
        },
        background: {
          primary: '#000000',
          message: '#111111',
          input: '#222222',
          diff: {
            added: '#003300',
            removed: '#330000',
          },
        },
        border: {
          default: '#555555',
          focused: '#0000ff',
        },
        ui: {
          comment: '#666666',
          symbol: '#cccccc',
          dark: '#333333',
          gradient: undefined,
        },
        status: {
          error: '#ff0000',
          success: '#00ff00',
          warning: '#ffff00',
        },
      } as unknown as SemanticColors,
    } as unknown as Theme);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly', async () => {
    const mockTheme = themeManager.getActiveTheme();
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <ColorsDisplay activeTheme={mockTheme} />,
    );
    await waitUntilReady();
    const output = lastFrame();

    // Check for title and description
    expect(output).toContain('How do colors get applied?');
    expect(output).toContain('Hex:');

    // Check for some color names and values    expect(output).toContain('text.primary');
    expect(output).toContain('#ffffff');
    expect(output).toContain('background.diff.added');
    expect(output).toContain('#003300');
    expect(output).toContain('border.default');
    expect(output).toContain('#555555');

    unmount();
  });
});
