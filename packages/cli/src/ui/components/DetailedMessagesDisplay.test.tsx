/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConsoleMessageItem } from '../types.js';
import { Box } from 'ink';
import type React from 'react';
import { createMockSettings } from '../../test-utils/settings.js';
import { useConsoleMessages } from '../hooks/useConsoleMessages.js';

vi.mock('../hooks/useConsoleMessages.js', () => ({
  useConsoleMessages: vi.fn(),
}));

vi.mock('./shared/ScrollableList.js', () => ({
  ScrollableList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (props: { item: unknown }) => React.ReactNode;
  }) => (
    <Box flexDirection="column">
      {data.map((item: unknown, index: number) => (
        <Box key={index}>{renderItem({ item })}</Box>
      ))}
    </Box>
  ),
}));

describe('DetailedMessagesDisplay', () => {
  beforeEach(() => {
    vi.mocked(useConsoleMessages).mockReturnValue({
      consoleMessages: [],
      clearConsoleMessages: vi.fn(),
    });
  });
  it('renders nothing when messages are empty', async () => {
    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={10} width={80} hasFocus={false} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders messages correctly', async () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Log message', count: 1 },
      { type: 'warn', content: 'Warning message', count: 1 },
      { type: 'error', content: 'Error message', count: 1 },
      { type: 'debug', content: 'Debug message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue({
      consoleMessages: messages,
      clearConsoleMessages: vi.fn(),
    });

    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });

  it('shows the F12 hint even in low error verbosity mode', async () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'error', content: 'Error message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue({
      consoleMessages: messages,
      clearConsoleMessages: vi.fn(),
    });

    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'low' } }),
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('(F12 to close)');
    unmount();
  });

  it('shows the F12 hint in full error verbosity mode', async () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'error', content: 'Error message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue({
      consoleMessages: messages,
      clearConsoleMessages: vi.fn(),
    });

    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('(F12 to close)');
    unmount();
  });

  it('renders message counts', async () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Repeated message', count: 5 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue({
      consoleMessages: messages,
      clearConsoleMessages: vi.fn(),
    });

    const { lastFrame, waitUntilReady, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={10} width={80} hasFocus={false} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    await waitUntilReady();
    const output = lastFrame();

    expect(output).toMatchSnapshot();
    unmount();
  });
});
