/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CoreToolCallStatus, type AnsiToken } from '@google/gemini-cli-core';
import { renderHook } from '../../test-utils/render.js';
import type { HistoryItem, IndividualToolCallDisplay } from '../types.js';
import {
  RESIZE_REFRESH_MAX_HISTORY_CHARS,
  countHistoryItemChars,
  countHistoryItemMinRows,
  getResizeRefreshHistoryStartIndex,
  useStaticHistoryStartIndex,
} from './useStaticHistoryStartIndex.js';

const createConversation = (
  itemCount: number,
  charsPerItem: number,
  firstId = 1,
): HistoryItem[] =>
  Array.from({ length: itemCount }, (_, index) => ({
    id: firstId + index,
    type: index % 2 === 0 ? 'user' : 'gemini',
    text: 'x'.repeat(charsPerItem),
  }));

const toolCall = (
  callId: string,
  resultDisplay: IndividualToolCallDisplay['resultDisplay'],
): IndividualToolCallDisplay => ({
  callId,
  name: callId,
  description: callId,
  resultDisplay,
  status: CoreToolCallStatus.Success,
  confirmationDetails: undefined,
});

const ansiToken = (text: string): AnsiToken => ({
  text,
  bold: false,
  italic: false,
  underline: false,
  dim: false,
  inverse: false,
  isUninitialized: false,
  fg: '',
  bg: '',
});

describe('countHistoryItemChars', () => {
  it('counts the characters of text items', () => {
    expect(countHistoryItemChars({ id: 1, type: 'user', text: 'hello' })).toBe(
      5,
    );
    expect(countHistoryItemChars({ id: 2, type: 'gemini', text: 'a\nb' })).toBe(
      3,
    );
  });

  it('counts tool descriptions and textual tool output', () => {
    const toolGroup: HistoryItem = {
      id: 1,
      type: 'tool_group',
      tools: [
        toolCall('shell', 'a\nb'),
        toolCall('edit', {
          fileDiff: '-a\n+b',
          fileName: 'file.ts',
          filePath: '/tmp/file.ts',
          originalContent: 'a',
          newContent: 'b',
        }),
        toolCall('pty', [[ansiToken('ab')], [ansiToken('c'), ansiToken('de')]]),
      ],
    };

    // Descriptions (5 + 4 + 3) + string (3) + diff (5) + ANSI tokens (5).
    expect(countHistoryItemChars(toolGroup)).toBe(25);
  });

  it('uses a fixed size for content that is not plain text', () => {
    expect(
      countHistoryItemChars({ id: 1, type: 'model', model: 'gemini-pro' }),
    ).toBe(500);
    expect(
      countHistoryItemChars({
        id: 2,
        type: 'tool_group',
        tools: [toolCall('todos', { todos: [] })],
      }),
    ).toBe(5 + 500);
  });

  it('treats tool results restored outside the declared types safely', () => {
    // Resumed sessions restore resultDisplay from JSON without validation, so
    // null, primitives, 1D arrays, or malformed token entries must not throw.
    const restoredResults: unknown[] = [
      null,
      true,
      42,
      ['line1', 'line2'],
      [['raw-token', { text: 'ok' }, null, {}]],
    ];
    const toolGroup: HistoryItem = {
      id: 1,
      type: 'tool_group',
      tools: restoredResults.map((resultDisplay, index) =>
        toolCall(
          `t${index}`,
          resultDisplay as IndividualToolCallDisplay['resultDisplay'],
        ),
      ),
    };

    // Descriptions (5 * 2) + null (0) + two non-text values (500 each) +
    // 1D string array (5 + 5) + mixed token line (9 + 2).
    expect(countHistoryItemChars(toolGroup)).toBe(10 + 0 + 500 + 500 + 10 + 11);
  });

  it('handles missing tools or tool descriptions in malformed tool groups', () => {
    const missingTools = {
      id: 1,
      type: 'tool_group',
    } as unknown as HistoryItem;
    const missingDescription = {
      id: 2,
      type: 'tool_group',
      tools: [{ ...toolCall('t0', 'out'), description: undefined }],
    } as unknown as HistoryItem;

    expect(countHistoryItemChars(missingTools)).toBe(0);
    expect(countHistoryItemChars(missingDescription)).toBe(3);
  });

  it('stops counting at the provided limit', () => {
    expect(
      countHistoryItemChars(
        { id: 1, type: 'gemini', text: 'x'.repeat(5000) },
        50,
      ),
    ).toBe(50);
    const largeAnsiOutput = Array.from({ length: 10_000 }, () => [
      ansiToken('0123456789'),
    ]);
    expect(
      countHistoryItemChars(
        {
          id: 2,
          type: 'tool_group',
          tools: [toolCall('pty', largeAnsiOutput)],
        },
        50,
      ),
    ).toBe(50);
  });
});

describe('countHistoryItemMinRows', () => {
  it('counts the rows of non-empty text lines', () => {
    expect(
      countHistoryItemMinRows({ id: 1, type: 'gemini', text: 'a\n\nb' }, 80),
    ).toBe(2);
  });

  it('wraps long lines at the given width', () => {
    expect(
      countHistoryItemMinRows(
        { id: 1, type: 'gemini', text: 'x'.repeat(200) },
        50,
      ),
    ).toBe(4);
  });

  it('counts one row per tool call regardless of its output', () => {
    const toolGroup: HistoryItem = {
      id: 1,
      type: 'tool_group',
      tools: [
        toolCall('shell', 'x\n'.repeat(500)),
        toolCall('read', undefined),
        toolCall('pty', [[ansiToken('z')]]),
      ],
    };
    expect(countHistoryItemMinRows(toolGroup, 80)).toBe(3);
    expect(
      countHistoryItemMinRows(
        { id: 2, type: 'tool_group' } as unknown as HistoryItem,
        80,
      ),
    ).toBe(0);
  });

  it('counts one row for items without text', () => {
    expect(
      countHistoryItemMinRows(
        { id: 1, type: 'model', model: 'gemini-pro' },
        80,
      ),
    ).toBe(1);
  });

  it('stops counting at the provided limit', () => {
    expect(
      countHistoryItemMinRows(
        { id: 1, type: 'gemini', text: 'line\n'.repeat(10_000) },
        80,
        5,
      ),
    ).toBe(5);
  });
});

describe('getResizeRefreshHistoryStartIndex', () => {
  it('returns 0 for an empty history', () => {
    expect(
      getResizeRefreshHistoryStartIndex([], { width: 100, minRows: 10 }),
    ).toBe(0);
  });

  it('returns 0 when the whole history fits in the budget', () => {
    expect(
      getResizeRefreshHistoryStartIndex(createConversation(10, 50), {
        width: 100,
        minRows: 5,
      }),
    ).toBe(0);
  });

  it('stops at the character budget once at least one screen is covered', () => {
    // The last 11 items (990 characters, 11 rows) fit in the 1,000 character
    // budget and cover a 5-row screen.
    const history = createConversation(100, 90);
    expect(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 5 }),
    ).toBe(89);
    expect(RESIZE_REFRESH_MAX_HISTORY_CHARS).toBe(1000);
  });

  it('extends the window until it covers at least one screen', () => {
    // 11 one-row items fit in the character budget, but 20 are needed to cover
    // a 20-row screen.
    const history = createConversation(100, 90);
    expect(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 20 }),
    ).toBe(80);
  });

  it('measures rows at the given width', () => {
    // 300-character items take 3 rows at 100 columns, so 4 items cover a
    // 10-row screen.
    const history = createConversation(20, 300);
    expect(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 10 }),
    ).toBe(16);
  });

  it('honors a custom character budget', () => {
    expect(
      getResizeRefreshHistoryStartIndex(createConversation(100, 90), {
        width: 100,
        minRows: 1,
        maxChars: 450,
      }),
    ).toBe(95);
  });

  it('re-prints only the newest part of a long latest turn', () => {
    // A long response is stored as many history items after the prompt.
    const history: HistoryItem[] = [
      { id: 1, type: 'user', text: 'Write a long essay' },
      ...Array.from(
        { length: 20 },
        (_, index): HistoryItem => ({
          id: index + 2,
          type: index === 0 ? 'gemini' : 'gemini_content',
          text: 'p'.repeat(200),
        }),
      ),
    ];
    expect(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 6 }),
    ).toBe(16);
  });

  it('always keeps the newest item', () => {
    const history: HistoryItem[] = [
      { id: 1, type: 'info', text: 'one' },
      { id: 2, type: 'info', text: 'x'.repeat(5000) },
    ];
    expect(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 0 }),
    ).toBe(1);
  });
});

describe('useStaticHistoryStartIndex', () => {
  type HookProps = Parameters<typeof useStaticHistoryStartIndex>[0];

  // 300 items of 90 characters exceed the 1,000 character budget.
  const history = createConversation(300, 90);
  const initialProps: HookProps = {
    history,
    historyRemountKey: 0,
    terminalWidth: 100,
    terminalHeight: 10,
    contentWidth: 100,
    enabled: true,
  };
  const resizedProps: HookProps = {
    ...initialProps,
    terminalWidth: 80,
    contentWidth: 80,
  };

  const renderStartIndexHook = () =>
    renderHook((props: HookProps) => useStaticHistoryStartIndex(props), {
      initialProps,
    });

  it('starts with the full history', async () => {
    const { result } = await renderStartIndexHook();
    expect(result.current).toBe(0);
  });

  it('returns a trailing window when remounted after a terminal width change', async () => {
    const { result, rerender } = await renderStartIndexHook();

    rerender(resizedProps);
    expect(result.current).toBe(0);

    rerender({ ...resizedProps, historyRemountKey: 1 });
    expect(result.current).toBe(
      getResizeRefreshHistoryStartIndex(history, { width: 80, minRows: 10 }),
    );
    expect(result.current).toBeGreaterThan(0);
  });

  it('returns a trailing window when the width returns to its previous value before the remount', async () => {
    const { result, rerender } = await renderStartIndexHook();

    // A quick drag out and back: the terminal re-wrapped the output at 80
    // columns, so the refresh at the original width is still a resize refresh.
    rerender(resizedProps);
    rerender(initialProps);
    expect(result.current).toBe(0);

    rerender({ ...initialProps, historyRemountKey: 1 });
    expect(result.current).toBe(
      getResizeRefreshHistoryStartIndex(history, { width: 100, minRows: 10 }),
    );
    expect(result.current).toBeGreaterThan(0);
  });

  it('keeps the start index fixed while history grows until the next remount', async () => {
    const { result, rerender } = await renderStartIndexHook();
    rerender(resizedProps);
    rerender({ ...resizedProps, historyRemountKey: 1 });
    const windowStart = result.current;

    rerender({
      ...resizedProps,
      historyRemountKey: 1,
      history: [...history, ...createConversation(50, 90, 1000)],
    });
    expect(result.current).toBe(windowStart);
  });

  it('returns 0 when remounted without a terminal width change', async () => {
    const { result, rerender } = await renderStartIndexHook();
    rerender({ ...initialProps, historyRemountKey: 1 });
    expect(result.current).toBe(0);
  });

  it('returns 0 when remounted again without a width change after a resize refresh', async () => {
    const { result, rerender } = await renderStartIndexHook();
    rerender(resizedProps);
    rerender({ ...resizedProps, historyRemountKey: 1 });
    expect(result.current).toBeGreaterThan(0);

    rerender({ ...resizedProps, historyRemountKey: 2 });
    expect(result.current).toBe(0);
  });

  it('returns 0 when the history is replaced by the same remount', async () => {
    const { result, rerender } = await renderStartIndexHook();
    rerender(resizedProps);

    // Resumed and rewound sessions assign sequential ids starting from 1,
    // overlapping the previous session's ids.
    rerender({
      ...resizedProps,
      historyRemountKey: 1,
      history: createConversation(300, 90, 1),
    });
    expect(result.current).toBe(0);
  });

  it('returns 0 when disabled', async () => {
    const { result, rerender } = await renderStartIndexHook();
    const disabled = { ...resizedProps, enabled: false };
    rerender(disabled);
    rerender({ ...disabled, historyRemountKey: 1 });
    expect(result.current).toBe(0);
  });
});
