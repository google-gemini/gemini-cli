/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { waitFor } from '../../test-utils/async.js';
import {
  DetailedMessagesDisplay,
  getLevelFilterShortcut,
} from './DetailedMessagesDisplay.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConsoleMessageItem } from '../types.js';
import { Box, Text } from 'ink';
import React from 'react';
import { createMockSettings } from '../../test-utils/settings.js';
import { useConsoleMessages } from '../hooks/useConsoleMessages.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { useTextBuffer } from './shared/text-buffer.js';

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
  const renderDisplay = async (
    props: Partial<React.ComponentProps<typeof DetailedMessagesDisplay>> = {},
  ) =>
    renderWithProviders(
      <DetailedMessagesDisplay
        maxHeight={20}
        width={80}
        hasFocus={true}
        {...props}
      />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );

  beforeEach(() => {
    vi.mocked(useConsoleMessages).mockReturnValue([]);
  });

  describe('getLevelFilterShortcut', () => {
    const shortcuts: Parameters<typeof getLevelFilterShortcut>[1] = {
      '1': 'all',
      '2': 'log',
      '3': 'info',
      '4': 'warn',
      '5': 'error',
      '6': 'debug',
    };

    it('maps Alt+number shortcuts using key.name', () => {
      expect(
        getLevelFilterShortcut(
          {
            name: '1',
            sequence: '\u001b1',
            alt: true,
            ctrl: false,
            cmd: false,
            shift: false,
            insertable: true,
          },
          shortcuts,
        ),
      ).toBe('all');
      expect(
        getLevelFilterShortcut(
          {
            name: '4',
            sequence: '\u001b4',
            alt: true,
            ctrl: false,
            cmd: false,
            shift: false,
            insertable: true,
          },
          shortcuts,
        ),
      ).toBe('warn');
    });

    it('ignores non-Alt or modified shortcuts', () => {
      expect(
        getLevelFilterShortcut(
          {
            name: '4',
            sequence: '4',
            alt: false,
            ctrl: false,
            cmd: false,
            shift: false,
            insertable: true,
          },
          shortcuts,
        ),
      ).toBeUndefined();
      expect(
        getLevelFilterShortcut(
          {
            name: '4',
            sequence: '\u001b4',
            alt: true,
            ctrl: true,
            cmd: false,
            shift: false,
            insertable: false,
          },
          shortcuts,
        ),
      ).toBeUndefined();
      expect(
        getLevelFilterShortcut(
          {
            name: '4',
            sequence: '\u001b4',
            alt: true,
            ctrl: false,
            cmd: true,
            shift: false,
            insertable: false,
          },
          shortcuts,
        ),
      ).toBeUndefined();
    });
  });

  it('renders nothing when messages are empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={10} width={80} hasFocus={false} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders messages correctly', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'log', content: 'Log message', count: 1 },
      { id: '2', type: 'info', content: 'Info message', count: 1 },
      { id: '3', type: 'warn', content: 'Warning message', count: 1 },
      { id: '4', type: 'error', content: 'Error message', count: 1 },
      { id: '5', type: 'debug', content: 'Debug message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const { lastFrame, unmount } = await renderDisplay();
    const output = lastFrame();

    expect(output).toContain('Debug Console');
    expect(output).toContain('F4 to search');
    expect(output).toContain('Alt+1-6 to filter by level');
    expect(output).toContain('All(4)');
    expect(output).toContain('Log(1)');
    expect(output).toContain('Info(1)');
    expect(output).toContain('Warn(1)');
    expect(output).toContain('Error(1)');
    expect(output).not.toContain('Alt+1:All');
    expect(output).not.toContain('Alt+4:Warn');
    expect(output).toContain('Info message');
    expect(output).not.toContain('Debug message');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('shows the F12 hint even in low error verbosity mode', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '5', type: 'error', content: 'Error message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const { lastFrame, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'low' } }),
      },
    );
    expect(lastFrame()).toContain(
      'Debug Console (F12 to close | F4 to search)',
    );
    unmount();
  });

  it('shows the F12 hint in full error verbosity mode', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '6', type: 'error', content: 'Error message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const { lastFrame, unmount } = await renderWithProviders(
      <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );
    expect(lastFrame()).toContain(
      'Debug Console (F12 to close | F4 to search)',
    );
    unmount();
  });

  it('renders message counts', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '7', type: 'log', content: 'Repeated message', count: 5 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const { lastFrame, unmount } = await renderDisplay({
      maxHeight: 10,
      hasFocus: false,
    });
    const output = lastFrame();

    expect(output).toContain('Repeated message');
    expect(output).toContain('(x5)');
    expect(output).toMatchSnapshot();
    unmount();
  });

  it('filters messages whenever search text is present', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'info', content: 'alpha match', count: 1 },
      { id: '2', type: 'warn', content: 'beta only', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);
    const searchBuffer = { text: 'alpha' } as TextBuffer;

    const { lastFrame, unmount } = await renderDisplay({ searchBuffer });

    const output = lastFrame();
    expect(output).toContain('alpha match');
    expect(output).not.toContain('beta only');
    expect(output).not.toContain('Search: alpha');
    unmount();
  });

  it('renders info messages with info-level color', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'info', content: 'Info message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);
    const searchBuffer = { text: '' } as TextBuffer;

    const { lastFrame, unmount } = await renderDisplay({ searchBuffer });

    expect(lastFrame()).toContain('Info message');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('filters messages after entering search mode with F4 and typing a keyword', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'info', content: 'alpha match', count: 1 },
      { id: '2', type: 'warn', content: 'beta only', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const SearchHarness = () => {
      const searchBuffer = useTextBuffer({
        initialText: '',
        viewport: { width: 30, height: 1 },
        singleLine: true,
      });

      return (
        <DetailedMessagesDisplay
          maxHeight={20}
          width={80}
          hasFocus={true}
          searchBuffer={searchBuffer}
        />
      );
    };

    const { lastFrame, stdin, unmount } = await renderWithProviders(
      <SearchHarness />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );

    await React.act(async () => {
      stdin.write('\u001bOS');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('F4 esc search');
      expect(output).toContain('Filter logs');
      expect(output).toContain('╭');
      expect(output).toContain('╮');
    });

    await React.act(async () => {
      stdin.write('alpha');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('alpha match');
      expect(output).not.toContain('beta only');
      expect(output).toContain('alpha');
      expect(output).not.toContain('F\ni\nl\nt\ne\nr\n \nl\no\ng\ns');
    });

    await React.act(async () => {
      stdin.write('\u001b');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('alpha match');
      expect(output).not.toContain('beta only');
      expect(output).not.toContain('Filter logs');
    });

    unmount();
  });

  it('keeps search input active for consecutive typing instead of bubbling to lower inputs', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'info', content: 'alpha match', count: 1 },
      { id: '2', type: 'warn', content: 'beta only', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const LowerPriorityInput = () => {
      const [value, setValue] = React.useState('');

      useKeypress(
        (key: Key) => {
          if (key.sequence.length === 1 && !key.ctrl && !key.alt && !key.cmd) {
            setValue((current) => current + key.sequence);
            return true;
          }
          return false;
        },
        { isActive: true, priority: true },
      );

      return <Text>Composer mirror: {value || '(empty)'}</Text>;
    };

    const SearchHarness = () => {
      const searchBuffer = useTextBuffer({
        initialText: '',
        viewport: { width: 30, height: 1 },
        singleLine: true,
      });

      return (
        <Box flexDirection="column">
          <DetailedMessagesDisplay
            maxHeight={20}
            width={80}
            hasFocus={true}
            searchBuffer={searchBuffer}
          />
          <LowerPriorityInput />
        </Box>
      );
    };

    const { lastFrame, stdin, unmount } = await renderWithProviders(
      <SearchHarness />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );

    await React.act(async () => {
      stdin.write('\u001bOS');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('F4 esc search');
      expect(lastFrame()).toContain('Filter logs');
      expect(lastFrame()).toContain('Composer mirror: (empty)');
    });

    await React.act(async () => {
      stdin.write('alpha');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Composer mirror: (empty)');
      expect(output).toContain('alpha match');
      expect(output).not.toContain('beta only');
      expect(output).toContain('a');
      expect(output).toContain('l');
      expect(output).toContain('p');
      expect(output).toContain('h');
    });

    unmount();
  });

  it('renders compact level filter labels and shortcut hint', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'log', content: 'log message', count: 1 },
      { id: '2', type: 'warn', content: 'warn message', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const { lastFrame, unmount } = await renderDisplay();

    const output = lastFrame();
    expect(output).toContain('Alt+1-6 to filter by level');
    expect(output).toContain('All(2)');
    expect(output).toContain('Log(1)');
    expect(output).toContain('Warn(1)');
    expect(output).not.toContain('Alt+1:All');
    expect(output).not.toContain('Alt+4:Warn');
    expect(output).toContain('log message');
    expect(output).toContain('warn message');

    unmount();
  });

  it('does not intercept plain number input while the debug console is visible', async () => {
    const messages: ConsoleMessageItem[] = [
      { id: '1', type: 'log', content: 'alpha match', count: 1 },
    ];
    vi.mocked(useConsoleMessages).mockReturnValue(messages);

    const LowerPriorityInput = () => {
      const [value, setValue] = React.useState('');

      useKeypress(
        (key: Key) => {
          if (key.sequence.length === 1 && !key.ctrl && !key.alt && !key.cmd) {
            setValue((current) => current + key.sequence);
            return true;
          }
          return false;
        },
        { isActive: true, priority: true },
      );

      return <Text>Composer mirror: {value || '(empty)'}</Text>;
    };

    const InputHarness = () => (
      <Box flexDirection="column">
        <DetailedMessagesDisplay maxHeight={20} width={80} hasFocus={true} />
        <LowerPriorityInput />
      </Box>
    );

    const { lastFrame, stdin, unmount } = await renderWithProviders(
      <InputHarness />,
      {
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      },
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Composer mirror: (empty)');
    });

    await React.act(async () => {
      stdin.write('4');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('Composer mirror: 4');
      expect(output).toContain('Alt+1-6 to filter by level');
      expect(output).toContain('alpha match');
    });

    unmount();
  });
});
