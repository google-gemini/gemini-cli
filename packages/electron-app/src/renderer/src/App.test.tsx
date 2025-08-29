/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, fireEvent, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IpcRendererEvent } from 'electron';
import App from './App';
import type { IncomingTheme, XtermTheme } from './types/global';

// --- Mocks ---

// Mock xterm.js and its addons
const mockTerm = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onKey: vi.fn(),
  options: {} as { theme?: Partial<XtermTheme> },
};
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => mockTerm),
}));

const mockFitAddon = {
  proposeDimensions: vi.fn(() => ({ cols: 80, rows: 25 })),
  fit: vi.fn(),
};
vi.mock('xterm-addon-fit', () => ({
  FitAddon: vi.fn(() => mockFitAddon),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Settings: () => <div data-testid="settings-icon" />,
}));

// Mock child components
vi.mock('./components/SettingsModal', () => {
  const MockSettingsModal = ({ 
    isOpen,
    onClose,
  }: { 
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null;
  MockSettingsModal.displayName = 'MockSettingsModal';
  return { SettingsModal: MockSettingsModal };
});

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
global.ResizeObserver = vi.fn(() => ({
  observe: mockObserve,
  disconnect: mockDisconnect,
  unobserve: vi.fn(),
}));

// Mock window.electron API
const mockElectronApi = {
  theme: {
    onInit: vi.fn(),
    set: vi.fn(),
  },
  themes: {
    get: vi.fn().mockResolvedValue([]),
  },
  terminal: {
    onData: vi.fn(),
    onReset: vi.fn(),
    sendKey: vi.fn(),
    resize: vi.fn(),
  },
  settings: {
    get: vi.fn().mockResolvedValue({ merged: {} }),
    set: vi.fn(),
    restartTerminal: vi.fn(),
  },
  languageMap: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn(),
  },
  onMainWindowResize: vi.fn(),
  onShowGeminiEditor: vi.fn(),
  resolveDiff: vi.fn(),
};

// --- Test Suite ---

describe('App', () => {
  let onThemeInitCallback: (
    event: IpcRendererEvent | null,
    theme: IncomingTheme,
  ) => void;
  let onTerminalDataCallback: (
    event: IpcRendererEvent | null,
    data: string,
  ) => void;
  let onTerminalResetCallback: (event: IpcRendererEvent | null) => void;
  let onKeyCallback: (data: { key: string; domEvent: KeyboardEvent }) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Capture the callbacks passed to the listeners
    mockElectronApi.theme.onInit.mockImplementation((callback) => {
      onThemeInitCallback = callback;
      return vi.fn(); // Return a mock remover
    });
    mockElectronApi.terminal.onData.mockImplementation((callback) => {
      onTerminalDataCallback = callback;
      return vi.fn();
    });
    mockElectronApi.terminal.onReset.mockImplementation((callback) => {
      onTerminalResetCallback = callback;
      return vi.fn();
    });
    mockTerm.onKey.mockImplementation(
      (callback: (data: { key: string; domEvent: KeyboardEvent }) => void) => {
        onKeyCallback = callback;
        return { dispose: vi.fn() };
      },
    );
    mockElectronApi.onMainWindowResize.mockReturnValue(vi.fn());
    mockElectronApi.onShowGeminiEditor.mockImplementation(() => vi.fn());
    mockElectronApi.resolveDiff.mockResolvedValue({ success: true });

    window.electron = mockElectronApi;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders and initializes the terminal on mount', () => {
    render(<App />);

    // Run timers to trigger the initial resize
    vi.runAllTimers();

    // Check that the terminal was created and opened
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
    expect(mockTerm.open).toHaveBeenCalled();
    expect(mockFitAddon.fit).toHaveBeenCalled();

    // Check that event listeners were attached
    expect(mockElectronApi.terminal.onData).toHaveBeenCalled();
    expect(mockTerm.onKey).toHaveBeenCalled();
    expect(mockElectronApi.terminal.onReset).toHaveBeenCalled();

    // Check that ResizeObserver was set up
    expect(mockObserve).toHaveBeenCalled();
  });

  it('opens and closes the settings modal', () => {
    render(<App />);
    vi.runAllTimers();

    // Modal should be closed initially
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();

    // Open modal
    fireEvent.click(screen.getByTestId('settings-icon'));
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('updates theme when onInit event is received', () => {
    render(<App />);
    vi.runAllTimers();

    const newTheme = {
      colors: {
        Background: '#000',
        Foreground: '#fff',
        AccentRed: '#f00',
        AccentGreen: '#0f0',
        AccentYellow: '#ff0',
        AccentBlue: '#00f',
        AccentPurple: '#f0f',
        AccentCyan: '#0ff',
      },
    };

    // Simulate the event from the main process inside act
    act(() => {
      onThemeInitCallback(null, newTheme);
    });

    expect(mockTerm.options.theme?.background).toBe('#000');
    expect(mockTerm.options.theme?.foreground).toBe('#fff');
  });

  it('writes incoming terminal data to the terminal', () => {
    render(<App />);
    vi.runAllTimers();
    const data = 'Hello from the CLI';

    // Simulate data coming from the main process
    act(() => {
      onTerminalDataCallback(null, data);
    });

    expect(mockTerm.write).toHaveBeenCalledWith(data);
  });

  it('sends keystrokes from the terminal to the main process', () => {
    render(<App />);
    vi.runAllTimers();

    // Simulate user typing in the terminal
    act(() => {
      onKeyCallback({
        key: 'a',
        domEvent: new KeyboardEvent('keydown', { key: 'a' }),
      });
    });

    expect(mockElectronApi.terminal.sendKey).toHaveBeenCalledWith('a');
  });

  it('clears the terminal on reset event', () => {
    render(<App />);
    vi.runAllTimers();

    // Simulate reset event from the main process
    act(() => {
      onTerminalResetCallback(null);
    });

    expect(mockTerm.clear).toHaveBeenCalled();
    expect(mockTerm.write).toHaveBeenCalledWith(
      'Settings updated. Restarting CLI...\r\n',
    );
  });
});

