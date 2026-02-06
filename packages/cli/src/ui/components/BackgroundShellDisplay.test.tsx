/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundShellDisplay } from './BackgroundShellDisplay.js';
import { type BackgroundShell } from '../hooks/shellCommandProcessor.js';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { act } from 'react';
import { type Key, type KeypressHandler } from '../contexts/KeypressContext.js';
import { ScrollProvider } from '../contexts/ScrollProvider.js';
import { Box } from 'ink';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock dependencies
const mockDismissBackgroundShell = vi.fn();
const mockSetActiveBackgroundShellPid = vi.fn();
const mockSetIsBackgroundShellListOpen = vi.fn();
const mockHandleWarning = vi.fn();
const mockSetEmbeddedShellFocused = vi.fn();

vi.mock('../contexts/UIActionsContext.js', () => ({
  useUIActions: () => ({
    dismissBackgroundShell: mockDismissBackgroundShell,
    setActiveBackgroundShellPid: mockSetActiveBackgroundShellPid,
    setIsBackgroundShellListOpen: mockSetIsBackgroundShellListOpen,
    handleWarning: mockHandleWarning,
    setEmbeddedShellFocused: mockSetEmbeddedShellFocused,
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    ShellExecutionService: {
      resizePty: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  };
});

// Mock AnsiOutputText since it's a complex component
vi.mock('./AnsiOutput.js', () => ({
  AnsiOutputText: ({ data }: { data: string | unknown }) => {
    if (typeof data === 'string') return <>{data}</>;
    // Simple serialization for object data
    return <>{JSON.stringify(data)}</>;
  },
}));

// Mock useKeypress
let keypressHandlers: Array<{ handler: KeypressHandler; isActive: boolean }> =
  [];
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn((handler, { isActive }) => {
    keypressHandlers.push({ handler, isActive });
  }),
}));

const simulateKey = (key: Partial<Key>) => {
  const fullKey: Key = createMockKey(key);
  keypressHandlers.forEach(({ handler, isActive }) => {
    if (isActive) {
      handler(fullKey);
    }
  });
};

vi.mock('../contexts/MouseContext.js', () => ({
  useMouseContext: vi.fn(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
  useMouse: vi.fn(),
}));

// Mock ScrollableList
vi.mock('./shared/ScrollableList.js', () => ({
  SCROLL_TO_ITEM_END: 999999,
  ScrollableList: vi.fn(
    ({
      data,
      renderItem,
    }: {
      data: BackgroundShell[];
      renderItem: (props: {
        item: BackgroundShell;
        index: number;
      }) => React.ReactNode;
    }) => (
      <Box flexDirection="column">
        {data.map((item: BackgroundShell, index: number) => (
          <Box key={index}>{renderItem({ item, index })}</Box>
        ))}
      </Box>
    ),
  ),
}));

const createMockKey = (overrides: Partial<Key>): Key => ({
  name: '',
  ctrl: false,
  alt: false,
  cmd: false,
  shift: false,
  insertable: false,
  sequence: '',
  ...overrides,
});

describe('<BackgroundShellDisplay />', () => {
  const mockShells = new Map<number, BackgroundShell>();
  const shell1: BackgroundShell = {
    pid: 1001,
    command: 'npm start',
    output: 'Starting server...',
    isBinary: false,
    binaryBytesReceived: 0,
    status: 'running',
  };
  const shell2: BackgroundShell = {
    pid: 1002,
    command: 'tail -f log.txt',
    output: 'Log entry 1',
    isBinary: false,
    binaryBytesReceived: 0,
    status: 'running',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShells.clear();
    mockShells.set(shell1.pid, shell1);
    mockShells.set(shell2.pid, shell2);
    keypressHandlers = [];
  });

  it('renders the output of the active shell', async () => {
    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={false}
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders tabs for multiple shells', async () => {
    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={100}
          height={24}
          isFocused={false}
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('highlights the focused state', async () => {
    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={true} // Focused
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('resizes the PTY on mount and when dimensions change', async () => {
    const { rerender } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={false}
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(ShellExecutionService.resizePty).toHaveBeenCalledWith(
      shell1.pid,
      76,
      21,
    );

    rerender(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={100}
          height={30}
          isFocused={false}
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(ShellExecutionService.resizePty).toHaveBeenCalledWith(
      shell1.pid,
      96,
      27,
    );
  });

  it('renders the process list when isListOpenProp is true', async () => {
    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={true}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('selects the current process and closes the list when Ctrl+L is pressed in list view', async () => {
    render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={true}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    // Simulate down arrow to select the second process (handled by RadioButtonSelect)
    act(() => {
      simulateKey({ name: 'down' });
    });

    // Simulate Ctrl+L (handled by BackgroundShellDisplay)
    act(() => {
      simulateKey({ name: 'l', ctrl: true });
    });

    expect(mockSetActiveBackgroundShellPid).toHaveBeenCalledWith(shell2.pid);
    expect(mockSetIsBackgroundShellListOpen).toHaveBeenCalledWith(false);
  });

  it('kills the highlighted process when Ctrl+K is pressed in list view', async () => {
    render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={true}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    // Initial state: shell1 (active) is highlighted

    // Move to shell2
    act(() => {
      simulateKey({ name: 'down' });
    });

    // Press Ctrl+K
    act(() => {
      simulateKey({ name: 'k', ctrl: true });
    });

    expect(mockDismissBackgroundShell).toHaveBeenCalledWith(shell2.pid);
  });

  it('kills the active process when Ctrl+K is pressed in output view', async () => {
    render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell1.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={false}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    act(() => {
      simulateKey({ name: 'k', ctrl: true });
    });

    expect(mockDismissBackgroundShell).toHaveBeenCalledWith(shell1.pid);
  });

  it('scrolls to active shell when list opens', async () => {
    // shell2 is active
    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={shell2.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={true}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });

  it('keeps exit code status color even when selected', async () => {
    const exitedShell: BackgroundShell = {
      pid: 1003,
      command: 'exit 0',
      output: '',
      isBinary: false,
      binaryBytesReceived: 0,
      status: 'exited',
      exitCode: 0,
    };
    mockShells.set(exitedShell.pid, exitedShell);

    const { lastFrame } = render(
      <ScrollProvider>
        <BackgroundShellDisplay
          shells={mockShells}
          activePid={exitedShell.pid}
          width={80}
          height={24}
          isFocused={true}
          isListOpenProp={true}
        />
      </ScrollProvider>,
    );
    await act(async () => {
      await delay(0);
    });

    expect(lastFrame()).toMatchSnapshot();
  });
});
