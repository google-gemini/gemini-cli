/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders, cleanup } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { type UIState } from '../contexts/UIStateContext.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import chalk from 'chalk';
import { isLowColorDepth } from '../utils/terminalUtils.js';
import {
  setupInputPromptTest,
  TestInputPrompt,
  type TestInputPromptProps,
} from './InputPrompt.test.helpers.js';
import '../../test-utils/customMatchers.js';

vi.mock('../utils/terminalUtils.js', () => ({
  isLowColorDepth: vi.fn(() => false),
}));

// Mock ink BEFORE importing components that use it to intercept terminalCursorPosition
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    Text: vi.fn(({ children, ...props }) => (
      <actual.Text {...props}>{children}</actual.Text>
    )),
  };
});

describe('InputPrompt - Background Color Styles', () => {
  let props: TestInputPromptProps;

  beforeEach(() => {
    const setup = setupInputPromptTest();
    props = setup.props;
    vi.mocked(isLowColorDepth).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
  });

  it('should render with background color by default', async () => {
    const { stdout, unmount } = await renderWithProviders(
      <TestInputPrompt {...props} />,
    );

    await waitFor(() => {
      const frame = stdout.lastFrameRaw();
      expect(frame).toContain('▀');
      expect(frame).toContain('▄');
    });
    unmount();
  });

  it.each([
    { color: 'black', name: 'black' },
    { color: '#000000', name: '#000000' },
    { color: '#000', name: '#000' },
    { color: 'white', name: 'white' },
    { color: '#ffffff', name: '#ffffff' },
    { color: '#fff', name: '#fff' },
  ])(
    'should render with safe grey background but NO side borders in 8-bit mode when background is $name',
    async ({ color }) => {
      vi.mocked(isLowColorDepth).mockReturnValue(true);

      const { stdout, unmount } = await renderWithProviders(
        <TestInputPrompt {...props} />,
        {
          uiState: {
            terminalBackgroundColor: color,
          } as Partial<UIState>,
        },
      );

      const isWhite =
        color === 'white' || color === '#ffffff' || color === '#fff';
      const expectedBgColor = isWhite ? '#eeeeee' : '#1c1c1c';

      await waitFor(() => {
        const frame = stdout.lastFrameRaw();

        // Use chalk to get the expected background color escape sequence
        const bgCheck = chalk.bgHex(expectedBgColor)(' ');
        const bgCode = bgCheck.substring(0, bgCheck.indexOf(' '));

        // Background color code should be present
        expect(frame).toContain(bgCode);
        // Background characters should be rendered
        expect(frame).toContain('▀');
        expect(frame).toContain('▄');
        // Side borders should STILL be removed
        expect(frame).not.toContain('│');
      });

      unmount();
    },
  );

  it('should NOT render with background color but SHOULD render horizontal lines when color depth is < 24 and background is NOT black', async () => {
    vi.mocked(isLowColorDepth).mockReturnValue(true);

    const { stdout, unmount } = await renderWithProviders(
      <TestInputPrompt {...props} />,
      {
        uiState: {
          terminalBackgroundColor: '#333333',
        } as Partial<UIState>,
      },
    );

    await waitFor(() => {
      const frame = stdout.lastFrameRaw();
      expect(frame).not.toContain('▀');
      expect(frame).not.toContain('▄');
      // It SHOULD have horizontal fallback lines
      expect(frame).toContain('─');
    });
    unmount();
  });

  it('should fallback to lines if getUseBackgroundColor returns false', async () => {
    props.config.getUseBackgroundColor = () => false;

    const { stdout, unmount } = await renderWithProviders(
      <TestInputPrompt {...props} />,
    );

    await waitFor(() => {
      const frame = stdout.lastFrameRaw();
      expect(frame).not.toContain('▀');
      expect(frame).not.toContain('▄');
      // It SHOULD have horizontal fallback lines
      expect(frame).toContain('─');
    });
    unmount();
  });
});
