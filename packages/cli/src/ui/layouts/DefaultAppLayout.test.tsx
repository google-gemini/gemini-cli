/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { DefaultAppLayout } from './DefaultAppLayout.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInputState } from '../contexts/InputContext.js';

vi.mock('../contexts/InputContext.js');
import { StreamingState } from '../types.js';
import { Text } from 'ink';
import type { UIState } from '../contexts/UIStateContext.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';

// Mock dependencies
const mockUIState = {
  rootUiRef: { current: null },
  terminalHeight: 24,
  terminalWidth: 80,
  mainAreaWidth: 80,
  backgroundTasks: new Map<number, BackgroundTask>(),
  activeBackgroundTaskPid: null as number | null,
  backgroundTaskHeight: 10,
  embeddedShellFocused: false,
  dialogsVisible: false,
  streamingState: StreamingState.Idle,
  isBackgroundTaskListOpen: false,
  mainControlsRef: vi.fn(),
  customDialog: null,
  historyManager: { addItem: vi.fn() },
  history: [],
  pendingHistoryItems: [],
  slashCommands: [],
  constrainHeight: false,
  availableTerminalHeight: 20,
  activePtyId: null,
  isBackgroundTaskVisible: true,
} as unknown as UIState;

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => mockUIState,
}));

vi.mock('../hooks/useFlickerDetector.js', () => ({
  useFlickerDetector: vi.fn(),
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(() => false),
}));

vi.mock('../contexts/ConfigContext.js', () => ({
  useConfig: () => ({
    getAccessibility: vi.fn(() => ({
      enableLoadingPhrases: true,
    })),
  }),
}));

// Mock child components to simplify output
vi.mock('../components/LoadingIndicator.js', () => ({
  LoadingIndicator: () => <Text>LoadingIndicator</Text>,
}));
const mainContentMock = vi.hoisted(() => ({ lineCount: 1 }));
vi.mock('../components/MainContent.js', () => ({
  MainContent: () => (
    <Text>
      {Array.from({ length: mainContentMock.lineCount }, (_, index) =>
        index === 0 ? 'MainContent' : `MainContent line ${index}`,
      ).join('\n')}
    </Text>
  ),
}));
vi.mock('../components/Notifications.js', () => ({
  Notifications: () => <Text>Notifications</Text>,
}));
vi.mock('../components/DialogManager.js', () => ({
  DialogManager: () => <Text>DialogManager</Text>,
}));
vi.mock('../components/Composer.js', () => ({
  Composer: () => <Text>Composer</Text>,
}));
vi.mock('../components/ExitWarning.js', () => ({
  ExitWarning: () => <Text>ExitWarning</Text>,
}));
vi.mock('../components/CopyModeWarning.js', () => ({
  CopyModeWarning: () => <Text>CopyModeWarning</Text>,
}));
vi.mock('../components/BackgroundTaskDisplay.js', () => ({
  BackgroundTaskDisplay: () => <Text>BackgroundTaskDisplay</Text>,
}));

const createMockShell = (pid: number): BackgroundTask => ({
  pid,
  command: 'test command',
  output: 'test output',
  isBinary: false,
  binaryBytesReceived: 0,
  status: 'running',
});

describe('<DefaultAppLayout />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useInputState).mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    // Reset mock state defaults
    mockUIState.backgroundTasks = new Map();
    mockUIState.activeBackgroundTaskPid = null;
    mockUIState.streamingState = StreamingState.Idle;
    mockUIState.constrainHeight = false;
    mockUIState.terminalHeight = 24;
    mainContentMock.lineCount = 1;
  });

  it('renders BackgroundTaskDisplay when shells exist and active', async () => {
    mockUIState.backgroundTasks.set(123, createMockShell(123));
    mockUIState.activeBackgroundTaskPid = 123;
    mockUIState.backgroundTaskHeight = 5;

    const { lastFrame, unmount } = await render(<DefaultAppLayout />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides BackgroundTaskDisplay when StreamingState is WaitingForConfirmation', async () => {
    mockUIState.backgroundTasks.set(123, createMockShell(123));
    mockUIState.activeBackgroundTaskPid = 123;
    mockUIState.backgroundTaskHeight = 5;
    mockUIState.streamingState = StreamingState.WaitingForConfirmation;

    const { lastFrame, unmount } = await render(<DefaultAppLayout />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('shows BackgroundTaskDisplay when StreamingState is NOT WaitingForConfirmation', async () => {
    mockUIState.backgroundTasks.set(123, createMockShell(123));
    mockUIState.activeBackgroundTaskPid = 123;
    mockUIState.backgroundTaskHeight = 5;
    mockUIState.streamingState = StreamingState.Responding;

    const { lastFrame, unmount } = await render(<DefaultAppLayout />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  describe('inline height cap', () => {
    it('keeps the inline layout shorter than the terminal and the input visible when content overflows', async () => {
      mockUIState.constrainHeight = true;
      mockUIState.terminalHeight = 8;
      mainContentMock.lineCount = 20;

      const { lastFrame, unmount } = await render(<DefaultAppLayout />);
      const frame = lastFrame();

      // Rendering as tall as the terminal makes Ink redraw the whole terminal,
      // so the layout stays at least one row shorter.
      expect(frame.trimEnd().split('\n').length).toBeLessThanOrEqual(7);
      // The top of the overflowing content is clipped; the input stays visible.
      expect(frame).toContain('Composer');
      expect(frame).toContain('MainContent line 19');
      expect(frame).not.toMatch(/^MainContent$/m);
      unmount();
    });

    it('does not cap the layout while expanded output is intentionally taller than the terminal', async () => {
      mockUIState.constrainHeight = false;
      mockUIState.terminalHeight = 8;
      mainContentMock.lineCount = 20;

      const { lastFrame, unmount } = await render(<DefaultAppLayout />);
      const frame = lastFrame();

      expect(frame).toMatch(/^MainContent$/m);
      expect(frame).toContain('MainContent line 19');
      expect(frame).toContain('Composer');
      unmount();
    });
  });
});
