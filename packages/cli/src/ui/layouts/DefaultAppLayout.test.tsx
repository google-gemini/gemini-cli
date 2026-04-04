/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultAppLayout } from './DefaultAppLayout.js';
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
vi.mock('../components/MainContent.js', () => ({
  MainContent: () => <Text>MainContent</Text>,
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
    // Reset mock state defaults
    mockUIState.backgroundTasks = new Map();
    mockUIState.activeBackgroundTaskPid = null;
    mockUIState.streamingState = StreamingState.Idle;
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
});
