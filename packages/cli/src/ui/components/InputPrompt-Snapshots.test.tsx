/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders, cleanup } from '../../test-utils/render.js';
import { type UIState } from '../contexts/UIStateContext.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupInputPromptTest,
  TestInputPrompt,
  type TestInputPromptProps,
} from './InputPrompt.test.helpers.js';
import '../../test-utils/customMatchers.js';
import { ApprovalMode } from '@google/gemini-cli-core';

vi.mock('../utils/terminalUtils.js', () => ({
  isLowColorDepth: vi.fn(() => false),
}));

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    Text: vi.fn(({ children, ...props }) => (
      <actual.Text {...props}>{children}</actual.Text>
    )),
  };
});

describe('InputPrompt - Snapshots', () => {
  let props: TestInputPromptProps;

  beforeEach(() => {
    const setup = setupInputPromptTest();
    props = setup.props;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
  });

  describe('snapshots', () => {
    it.each([
      { name: 'dark', color: '#123456', mode: ApprovalMode.DEFAULT },
      { name: 'light', color: '#fff', mode: ApprovalMode.DEFAULT },
      { name: 'plan', color: 'black', mode: ApprovalMode.PLAN },
      { name: 'yolo', color: 'black', mode: ApprovalMode.YOLO },
    ])('should render correctly for $name mode', async ({ color, mode }) => {
      props.approvalMode = mode;
      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
        {
          uiState: {
            terminalBackgroundColor: color,
          } as Partial<UIState>,
        },
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });

    it('renders with multiline text', async () => {
      props.buffer.text = 'line1\nline2';
      props.buffer.lines = ['line1', 'line2'];
      props.buffer.allVisualLines = ['line1', 'line2'];
      props.buffer.viewportVisualLines = ['line1', 'line2'];
      props.buffer.visualCursor = [1, 5];
      props.buffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
      ];

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });

    it('renders correctly with shell mode active', async () => {
      props.shellModeActive = true;
      props.buffer.text = 'npm run dev';
      props.buffer.lines = ['npm run dev'];
      props.buffer.allVisualLines = ['npm run dev'];
      props.buffer.viewportVisualLines = ['npm run dev'];
      props.buffer.visualCursor = [0, 11];

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });

    it('renders correctly with copy mode enabled', async () => {
      props.copyModeEnabled = true;
      props.buffer.text = 'copy me';
      props.buffer.lines = ['copy me'];
      props.buffer.allVisualLines = ['copy me'];
      props.buffer.viewportVisualLines = ['copy me'];
      props.buffer.visualCursor = [0, 7];

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );

      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });
  });
});
