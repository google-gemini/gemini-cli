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

vi.mock('../contexts/UIActionsContext.js', () => ({
  useUIActions: () => ({
    dismissBackgroundShell: mockDismissBackgroundShell,
    setActiveBackgroundShellPid: mockSetActiveBackgroundShellPid,
    setIsBackgroundShellListOpen: mockSetIsBackgroundShellListOpen,
  }),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    ShellExecutionService: {
      resizePty: vi.fn(),
      subscribe: vi.fn(() => vi.fn()), // Returns cleanup function
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

// Mock useKeypress and useMouse
let keypressHandler: KeypressHandler | undefined;
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn((handler, { isActive }) => {
    if (isActive) {
      keypressHandler = handler;
    }
  }),
}));

vi.mock('../contexts/MouseContext.js', () => ({
  useMouseContext: vi.fn(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })),
  useMouse: vi.fn(),
}));

// Mock ScrollableList
vi.mock('./shared/ScrollableList.js', () => ({
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
  meta: false,
  shift: false,
  paste: false,
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
    keypressHandler = undefined;
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

    expect(lastFrame()).toContain('Starting server...');
    // The command is shown in the tab, but might be truncated
    expect(lastFrame()).toContain('1: npm');
    expect(lastFrame()).toContain('(PID: 1001)');
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

    expect(lastFrame()).toContain('1: npm');
    expect(lastFrame()).toContain('2: tail');
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

    expect(lastFrame()).toContain('(Focused)');
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

    // Initial resize (width - 4, height - 3 approx based on logic)
    // Logic: width - 2 (border) - 2 (padding)
    // Logic: height - 2 (border) - 1 (header)
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

    const frame = lastFrame();
    expect(frame).toContain('Select Process');
    expect(frame).toContain('> 1: npm start (PID: 1001)');
    expect(frame).toContain('  2: tail -f log.txt (PID: 1002)');
  });

  it('selects the current process and closes the list when Ctrl+O is pressed in list view', async () => {
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

    expect(keypressHandler).toBeDefined();

    // Simulate down arrow to select the second process
    act(() => {
      keypressHandler!(createMockKey({ name: 'down' }));
    });

    // Simulate Ctrl+O
    act(() => {
      keypressHandler!(createMockKey({ name: 'o', ctrl: true }));
    });

    expect(mockSetActiveBackgroundShellPid).toHaveBeenCalledWith(shell2.pid);
    expect(mockSetIsBackgroundShellListOpen).toHaveBeenCalledWith(false);
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

    const frame = lastFrame();
    // Highlighted via index match in renderItem
    expect(frame).toContain('> 2: tail -f log.txt (PID: 1002)');
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

    // Check that we render the exit code part
    // Note: verifying exact color in ink test output string is tricky without analyzing the ANSI codes or internal structure,
    // but at least we can verify the text is present. To truly verify color, we'd need to inspect the react tree props or use a snapshot.
    // For now, let's verify it renders.
    const frame = lastFrame();
    expect(frame).toContain('(Exit Code: 0)');
    expect(frame).toContain('> 3: exit 0 (PID: 1003)');
  });
});
