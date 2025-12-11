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
import { useKeypress } from '../hooks/useKeypress.js';
import { type Key, type KeypressHandler } from '../contexts/KeypressContext.js';

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
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));
vi.mock('../contexts/MouseContext.js', () => ({
  useMouse: vi.fn(),
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
  });

  it('renders the output of the active shell', () => {
    const { lastFrame } = render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={false}
        isListOpenProp={false}
      />,
    );

    expect(lastFrame()).toContain('Starting server...');
    // The command is shown in the tab, but might be truncated
    expect(lastFrame()).toContain('1: npm');
    expect(lastFrame()).toContain('(PID: 1001)');
  });

  it('renders tabs for multiple shells', () => {
    const { lastFrame } = render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={false}
        isListOpenProp={false}
      />,
    );

    expect(lastFrame()).toContain('1: npm');
    expect(lastFrame()).toContain('2: tail');
  });

  it('highlights the focused state', () => {
    const { lastFrame } = render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={true} // Focused
        isListOpenProp={false}
      />,
    );

    expect(lastFrame()).toContain('(Focused)');
  });

  it('resizes the PTY on mount and when dimensions change', () => {
    const { rerender } = render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={false}
        isListOpenProp={false}
      />,
    );

    // Initial resize (width - 4, height - 3 approx based on logic)
    // Logic: width - 2 (border) - 2 (padding)
    // Logic: height - 2 (border) - 1 (header)
    expect(ShellExecutionService.resizePty).toHaveBeenCalledWith(
      shell1.pid,
      76,
      21,
    );

    rerender(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={100}
        height={30}
        isFocused={false}
        isListOpenProp={false}
      />,
    );

    expect(ShellExecutionService.resizePty).toHaveBeenCalledWith(
      shell1.pid,
      96,
      27,
    );
  });

  it('renders the process list when isListOpenProp is true', () => {
    const { lastFrame } = render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={true}
        isListOpenProp={true}
      />,
    );

    expect(lastFrame()).toContain('Select Process');
    expect(lastFrame()).toContain('>  1: npm start (PID: 1001)');
    expect(lastFrame()).toContain('   2: tail -f log.txt (PID: 1002)');
  });

  it('auto-opens to process view if only one shell exists on mount', () => {
    const singleShellMap = new Map();
    singleShellMap.set(shell1.pid, shell1);

    render(
      <BackgroundShellDisplay
        shells={singleShellMap}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={true}
        isListOpenProp={false} // Should be overridden by useEffect
      />,
    );

    expect(mockSetIsBackgroundShellListOpen).toHaveBeenCalledWith(false);
  });

  it('auto-opens to list view if multiple shells exist on mount', () => {
    render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={true}
        isListOpenProp={false} // Should be overridden by useEffect
      />,
    );

    expect(mockSetIsBackgroundShellListOpen).toHaveBeenCalledWith(true);
  });

  it('selects the current process and closes the list when Ctrl+O is pressed in list view', () => {
    const useKeypressMock = vi.mocked(useKeypress);
    let keypressHandler: KeypressHandler | undefined;
    useKeypressMock.mockImplementation((handler, { isActive }) => {
      if (isActive) {
        keypressHandler = handler;
      }
    });

    render(
      <BackgroundShellDisplay
        shells={mockShells}
        activePid={shell1.pid}
        width={80}
        height={24}
        isFocused={true}
        isListOpenProp={true}
      />,
    );

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
});
