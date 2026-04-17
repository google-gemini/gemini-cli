/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders, cleanup } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
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

describe('InputPrompt - IME Cursor Support', () => {
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

  describe('terminalCursorPosition', () => {
    it.each([
      {
        name: 'empty buffer',
        text: '',
        visualCursor: [0, 0],
        expectedCol: 0,
      },
      {
        name: 'ASCII text at start',
        text: 'hello',
        visualCursor: [0, 0],
        expectedCol: 0,
      },
      {
        name: 'ASCII text at end',
        text: 'hello',
        visualCursor: [0, 5],
        expectedCol: 5,
      },
      {
        name: 'Japanese text with full-width characters (こんにちは)',
        text: 'こんにちは',
        visualCursor: [0, 5],
        expectedCol: 5,
      },
      {
        name: 'Mixed ASCII and CJK text (aこbんc)',
        text: 'aこbんc',
        visualCursor: [0, 5],
        expectedCol: 5,
      },
      {
        name: 'Emoji (👩‍💻)',
        text: '👩‍💻',
        visualCursor: [0, 5],
        expectedCol: 5,
      },
      {
        name: 'Korean text (テスト)',
        text: 'テスト',
        visualCursor: [0, 3],
        expectedCol: 3,
      },
    ])(
      'should set terminalCursorPosition correctly for $name',
      async ({ text, visualCursor, expectedCol }) => {
        mockBuffer.text = text;
        mockBuffer.lines = [text];
        mockBuffer.allVisualLines = [text];
        mockBuffer.viewportVisualLines = [text];

        mockBuffer.visualCursor = visualCursor as [number, number];
        mockBuffer.visualToLogicalMap = [[0, 0]];
        // Avoid rendering backgrounds which might complicate the snapshot/component tree
        props.config.getUseBackgroundColor = () => false;

        const { stdout, unmount } = await renderWithProviders(
          <TestInputPrompt {...props} />,
        );

        // We can't easily extract props from the rendered ink tree in tests without a custom test renderer.
        // However, if the component passes terminalCursorPosition down, Ink will handle it.
        // In our mock, we just render <Text>.
        // To verify the prop was passed, we need to inspect the mocked Text component's calls.
        // Since we mock 'ink' at the top level, we can check if Text was called with terminalCursorPosition.

        await waitFor(() => {
          // Ensure it rendered
          expect(stdout.lastFrameRaw()).not.toBe('');
        });

        const ink = await import('ink');
        const textMock = ink.Text as unknown as ReturnType<typeof vi.fn>;

        // Find the call to Text that has terminalCursorFocus: true
        const focusCall = textMock.mock.calls.find(
          (call) => call[0].terminalCursorFocus === true,
        );

        expect(focusCall).toBeDefined();
        if (focusCall) {
          expect(focusCall[0].terminalCursorPosition).toBe(expectedCol);
        }

        unmount();
      },
    );
  });
});
