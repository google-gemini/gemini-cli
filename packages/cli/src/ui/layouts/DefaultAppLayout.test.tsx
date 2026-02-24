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
import type { BackgroundShell } from '../hooks/shellCommandProcessor.js';

// Mock dependencies
const mockUIState = {
  rootUiRef: { current: null },
  terminalHeight: 24,
  terminalWidth: 80,
  mainAreaWidth: 80,
  backgroundShells: new Map<number, BackgroundShell>(),
  activeBackgroundShellPid: null as number | null,
  backgroundShellHeight: 10,
  embeddedShellFocused: false,
  dialogsVisible: false,
  streamingState: StreamingState.Idle,
  isBackgroundShellListOpen: false,
  mainControlsRef: { current: null },
  customDialog: null,
  historyManager: { addItem: vi.fn() },
  history: [],
  pendingHistoryItems: [],
  slashCommands: [],
  constrainHeight: false,
  availableTerminalHeight: 20,
  activePtyId: null,
  isBackgroundShellVisible: true,
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
vi.mock('../components/BackgroundShellDisplay.js', () => ({
  BackgroundShellDisplay: () => <Text>BackgroundShellDisplay</Text>,
}));

const createMockShell = (pid: number): BackgroundShell => ({
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
    mockUIState.backgroundShells = new Map();
    mockUIState.activeBackgroundShellPid = null;
    mockUIState.streamingState = StreamingState.Idle;
  });

  it('renders BackgroundShellDisplay when shells exist and active', async () => {
    mockUIState.backgroundShells.set(123, createMockShell(123));
    mockUIState.activeBackgroundShellPid = 123;
    mockUIState.backgroundShellHeight = 5;

    const { lastFrame, waitUntilReady, unmount } = render(<DefaultAppLayout />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides BackgroundShellDisplay when StreamingState is WaitingForConfirmation', async () => {
    mockUIState.backgroundShells.set(123, createMockShell(123));
    mockUIState.activeBackgroundShellPid = 123;
    mockUIState.backgroundShellHeight = 5;
    mockUIState.streamingState = StreamingState.WaitingForConfirmation;

    const { lastFrame, waitUntilReady, unmount } = render(<DefaultAppLayout />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('shows BackgroundShellDisplay when StreamingState is NOT WaitingForConfirmation', async () => {
    mockUIState.backgroundShells.set(123, createMockShell(123));
    mockUIState.activeBackgroundShellPid = 123;
    mockUIState.backgroundShellHeight = 5;
    mockUIState.streamingState = StreamingState.Responding;

    const { lastFrame, waitUntilReady, unmount } = render(<DefaultAppLayout />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
