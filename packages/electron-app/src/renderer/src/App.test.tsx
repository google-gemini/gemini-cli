/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, fireEvent, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

// --- Mocks ---

// Mock xterm.js and its addons
const mockTerm = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  options: {},
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
  const MockSettingsModal = ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null;
  MockSettingsModal.displayName = 'MockSettingsModal';
  MockSettingsModal.propTypes = {
    isOpen: vi.fn(),
    onClose: vi.fn(),
  };
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
  },
  terminal: {
    onData: vi.fn(),
    onReset: vi.fn(),
    sendKey: vi.fn(),
    resize: vi.fn(),
  },
  onMainWindowResize: vi.fn(),
};

// --- Test Suite ---

describe('App', () => {
  let onThemeInitCallback;
  let onTerminalDataCallback;
  let onTerminalResetCallback;

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
    mockElectronApi.onMainWindowResize.mockReturnValue(vi.fn());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electron = mockElectronApi;
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
    expect(mockTerm.onData).toHaveBeenCalled();
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

    expect(mockTerm.options.theme.background).toBe('#000');
    expect(mockTerm.options.theme.foreground).toBe('#fff');
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
    const onDataCallback = mockTerm.onData.mock.calls[0][0];
    const key = 'a';

    // Simulate user typing in the terminal
    act(() => {
      onDataCallback(key);
    });

    expect(mockElectronApi.terminal.sendKey).toHaveBeenCalledWith(key);
  });

  it('clears the terminal on reset event', () => {
    render(<App />);
    vi.runAllTimers();

    // Simulate reset event from the main process
    act(() => {
      onTerminalResetCallback();
    });

    expect(mockTerm.clear).toHaveBeenCalled();
    expect(mockTerm.write).toHaveBeenCalledWith(
      'Settings updated. Restarting CLI...\r\n',
    );
  });
});
