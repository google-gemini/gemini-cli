/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders, cleanup } from '../../test-utils/render.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupInputPromptTest,
  TestInputPrompt,
  type TestInputPromptProps,
} from './InputPrompt.test.helpers.js';
import { type TextBuffer } from './shared/text-buffer.js';
import '../../test-utils/customMatchers.js';

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

describe('InputPrompt - Highlighting and Cursor Display', () => {
  let props: TestInputPromptProps;
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    const setup = setupInputPromptTest();
    props = setup.props;
    mockBuffer = setup.mockBuffer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
  });

  describe('single-line scenarios', () => {
    it.each([
      {
        name: 'at end of text',
        text: 'hello',
        visualCursor: [0, 5],
      },
      {
        name: 'at beginning of text',
        text: 'hello',
        visualCursor: [0, 0],
      },
      {
        name: 'in middle of text',
        text: 'hello',
        visualCursor: [0, 2],
      },
      {
        name: 'empty string',
        text: '',
        visualCursor: [0, 0],
      },
    ])(
      'should display cursor correctly $name',
      async ({ text, visualCursor }) => {
        mockBuffer.text = text;
        mockBuffer.lines = [text];
        mockBuffer.allVisualLines = [text];
        mockBuffer.viewportVisualLines = [text];

        mockBuffer.visualCursor = visualCursor as [number, number];
        mockBuffer.visualToLogicalMap = [[0, 0]];
        props.config.getUseBackgroundColor = () => true;

        const renderResult = await renderWithProviders(
          <TestInputPrompt {...props} />,
        );
        await renderResult.waitUntilReady();
        await expect(renderResult).toMatchSvgSnapshot();
        renderResult.unmount();
      },
    );

    it('should display cursor correctly over full-width character', async () => {
      const text = 'こんにちは';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.allVisualLines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualCursor = [0, 1]; // On 'ん'
      mockBuffer.visualToLogicalMap = [[0, 0]];
      props.config.getUseBackgroundColor = () => true;

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );
      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });

    it('should display cursor correctly over emoji', async () => {
      const text = 'hello🚀world';
      mockBuffer.text = text;
      mockBuffer.lines = [text];
      mockBuffer.allVisualLines = [text];
      mockBuffer.viewportVisualLines = [text];
      mockBuffer.visualCursor = [0, 5]; // On '🚀'
      mockBuffer.visualToLogicalMap = [[0, 0]];
      props.config.getUseBackgroundColor = () => true;

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );
      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });
  });

  describe('multi-line scenarios', () => {
    it.each([
      {
        name: 'at end of first line',
        text: 'line 1\nline 2',
        visualCursor: [0, 6],
        visualToLogicalMap: [
          [0, 0],
          [1, 0],
        ],
      },
      {
        name: 'at beginning of second line',
        text: 'line 1\nline 2',
        visualCursor: [1, 0],
        visualToLogicalMap: [
          [0, 0],
          [1, 0],
        ],
      },
    ])(
      'should display cursor correctly $name in a multiline block',
      async ({ text, visualCursor, visualToLogicalMap }) => {
        mockBuffer.text = text;
        mockBuffer.lines = text.split('\n');
        mockBuffer.allVisualLines = text.split('\n');
        mockBuffer.viewportVisualLines = text.split('\n');

        mockBuffer.visualCursor = visualCursor as [number, number];

        mockBuffer.visualToLogicalMap = visualToLogicalMap as Array<
          [number, number]
        >;
        props.config.getUseBackgroundColor = () => true;

        const renderResult = await renderWithProviders(
          <TestInputPrompt {...props} />,
        );
        await renderResult.waitUntilReady();
        await expect(renderResult).toMatchSvgSnapshot();
        renderResult.unmount();
      },
    );

    it('should display cursor on a blank line in a multiline block', async () => {
      const text = 'first line\n\nthird line';
      mockBuffer.text = text;
      mockBuffer.lines = text.split('\n');
      mockBuffer.allVisualLines = text.split('\n');
      mockBuffer.viewportVisualLines = text.split('\n');
      mockBuffer.visualCursor = [1, 0]; // cursor on the blank line
      mockBuffer.visualToLogicalMap = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
      props.config.getUseBackgroundColor = () => true;

      const renderResult = await renderWithProviders(
        <TestInputPrompt {...props} />,
      );
      await renderResult.waitUntilReady();
      await expect(renderResult).toMatchSvgSnapshot();
      renderResult.unmount();
    });
  });
});
