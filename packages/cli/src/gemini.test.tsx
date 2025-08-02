/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  main,
  setupUnhandledRejectionHandler,
  validateDnsResolutionOrder,
  loadNonInteractiveConfig,
} from './gemini.js';
import {
  LoadedSettings,
  SettingsFile,
  loadSettings,
} from './config/settings.js';
import { appEvents, AppEvent } from './utils/events.js';
import { Config, ApprovalMode } from '@google/gemini-cli-core';
import { loadCliConfig } from './config/config.js';

// Custom error to identify mock process.exit calls
class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

const mockConfigInstance = vi.hoisted(() => ({
  getSandbox: vi.fn(() => false),
  getQuestion: vi.fn(() => ''),
  getListExtensions: vi.fn(() => false),
  initialize: vi.fn().mockResolvedValue(undefined),
  getDebugMode: vi.fn(() => false),
  refreshAuth: vi.fn().mockResolvedValue(undefined),
  getExperimentalAcp: vi.fn(() => false),
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  getToolRegistry: vi.fn().mockResolvedValue({
    getAllTools: vi.fn(() => []),
  }),
  getSessionId: vi.fn(() => 'test-session'),
}));

// Mock dependencies
vi.mock('./config/config.js', async () => ({
  loadCliConfig: vi.fn().mockResolvedValue(mockConfigInstance),
  parseArguments: vi.fn().mockResolvedValue({}),
}));

vi.mock('./config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn().mockResolvedValue({
    packageJson: { name: 'test-pkg', version: 'test-version' },
    path: '/fake/path/package.json',
  }),
}));

vi.mock('update-notifier', () => ({
  default: vi.fn(() => ({
    notify: vi.fn(),
  })),
}));

vi.mock('./utils/events.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/events.js')>();
  return {
    ...actual,
    appEvents: {
      emit: vi.fn(),
    },
  };
});

vi.mock('./utils/sandbox.js', () => ({
  sandbox_command: vi.fn(() => ''), // Default to no sandbox command
  start_sandbox: vi.fn(() => Promise.resolve()), // Mock as an async function that resolves
}));

vi.mock('./validateNonInterActiveAuth.js', () => ({
  validateNonInteractiveAuth: vi.fn((_a, _b, c) => Promise.resolve(c)),
}));

describe('gemini.tsx main function', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let loadSettingsMock: ReturnType<typeof vi.mocked<typeof loadSettings>>;
  let originalEnvGeminiSandbox: string | undefined;
  let originalEnvSandbox: string | undefined;
  let initialUnhandledRejectionListeners: NodeJS.UnhandledRejectionListener[] =
    [];

  const processExitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((code) => {
      throw new MockProcessExitError(code);
    });

  beforeEach(() => {
    loadSettingsMock = vi.mocked(loadSettings);

    // Store and clear sandbox-related env variables to ensure a consistent test environment
    originalEnvGeminiSandbox = process.env.GEMINI_SANDBOX;
    originalEnvSandbox = process.env.SANDBOX;
    delete process.env.GEMINI_SANDBOX;
    delete process.env.SANDBOX;

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    initialUnhandledRejectionListeners =
      process.listeners('unhandledRejection');
  });

  afterEach(() => {
    // Restore original env variables
    if (originalEnvGeminiSandbox !== undefined) {
      process.env.GEMINI_SANDBOX = originalEnvGeminiSandbox;
    } else {
      delete process.env.GEMINI_SANDBOX;
    }
    if (originalEnvSandbox !== undefined) {
      process.env.SANDBOX = originalEnvSandbox;
    } else {
      delete process.env.SANDBOX;
    }

    const currentListeners = process.listeners('unhandledRejection');
    const addedListener = currentListeners.find(
      (listener) => !initialUnhandledRejectionListeners.includes(listener),
    );

    if (addedListener) {
      process.removeListener('unhandledRejection', addedListener);
    }
    vi.restoreAllMocks();
  });

  it('should call process.exit(1) if settings have errors', async () => {
    const settingsError = {
      message: 'Test settings error',
      path: '/test/settings.json',
    };
    const userSettingsFile: SettingsFile = {
      path: '/user/settings.json',
      settings: {},
    };
    const workspaceSettingsFile: SettingsFile = {
      path: '/workspace/.gemini/settings.json',
      settings: {},
    };
    const systemSettingsFile: SettingsFile = {
      path: '/system/settings.json',
      settings: {},
    };
    const mockLoadedSettings = new LoadedSettings(
      systemSettingsFile,
      userSettingsFile,
      workspaceSettingsFile,
      [settingsError],
    );

    loadSettingsMock.mockReturnValue(mockLoadedSettings);

    try {
      await main();
      // If main completes without throwing, the test should fail because process.exit was expected
      expect.fail('main function did not exit as expected');
    } catch (error) {
      expect(error).toBeInstanceOf(MockProcessExitError);
      if (error instanceof MockProcessExitError) {
        expect(error.code).toBe(1);
      }
    }

    // Verify console.error was called with the error message
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(stripAnsi(String(consoleErrorSpy.mock.calls[0][0]))).toBe(
      'Error in /test/settings.json: Test settings error',
    );
    expect(stripAnsi(String(consoleErrorSpy.mock.calls[1][0]))).toBe(
      'Please fix /test/settings.json and try again.',
    );

    // Verify process.exit was called.
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should log unhandled promise rejections and open debug console on first error', async () => {
    const appEventsMock = vi.mocked(appEvents);
    const rejectionError = new Error('Test unhandled rejection');

    setupUnhandledRejectionHandler();
    // Simulate an unhandled rejection.
    // We are not using Promise.reject here as vitest will catch it.
    // Instead we will dispatch the event manually.
    process.emit('unhandledRejection', rejectionError, Promise.resolve());

    // We need to wait for the rejection handler to be called.
    await new Promise(process.nextTick);

    expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvent.OpenDebugConsole);
    expect(appEventsMock.emit).toHaveBeenCalledWith(
      AppEvent.LogError,
      expect.stringContaining('Unhandled Promise Rejection'),
    );
    expect(appEventsMock.emit).toHaveBeenCalledWith(
      AppEvent.LogError,
      expect.stringContaining('Please file a bug report using the /bug tool.'),
    );

    // Simulate a second rejection
    const secondRejectionError = new Error('Second test unhandled rejection');
    process.emit('unhandledRejection', secondRejectionError, Promise.resolve());
    await new Promise(process.nextTick);

    // Ensure emit was only called once for OpenDebugConsole
    const openDebugConsoleCalls = appEventsMock.emit.mock.calls.filter(
      (call) => call[0] === AppEvent.OpenDebugConsole,
    );
    expect(openDebugConsoleCalls.length).toBe(1);

    // Avoid the process.exit error from being thrown.
    processExitSpy.mockRestore();
  });
});

describe('validateDnsResolutionOrder', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should return "ipv4first" when the input is "ipv4first"', () => {
    expect(validateDnsResolutionOrder('ipv4first')).toBe('ipv4first');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should return "verbatim" when the input is "verbatim"', () => {
    expect(validateDnsResolutionOrder('verbatim')).toBe('verbatim');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should return the default "ipv4first" when the input is undefined', () => {
    expect(validateDnsResolutionOrder(undefined)).toBe('ipv4first');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should return the default "ipv4first" and log a warning for an invalid string', () => {
    expect(validateDnsResolutionOrder('invalid-value')).toBe('ipv4first');
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Invalid value for dnsResolutionOrder in settings: "invalid-value". Using default "ipv4first".',
    );
  });
});

describe('loadNonInteractiveConfig', () => {
  const mockToolRegistry = {
    getAllTools: vi.fn(() => [
      { name: 'toolWithSideEffects1', hasSideEffects: true },
      { name: 'toolWithoutSideEffects', hasSideEffects: false },
      { name: 'toolWithSideEffects2', hasSideEffects: true },
    ]),
  };
  const loadCliConfigMock = vi.mocked(loadCliConfig);

  beforeEach(() => {
    loadCliConfigMock.mockClear();
    // The first call to loadCliConfig happens in main(), this mock is for the one inside loadNonInteractiveConfig
    loadCliConfigMock.mockResolvedValue({
      ...mockConfigInstance,
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config);
  });

  it('should exclude tools with side effects when not in YOLO mode', async () => {
    const mockConfig = {
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getToolRegistry: () => Promise.resolve(mockToolRegistry),
      getSessionId: () => 'test-session',
    } as unknown as Config;

    await loadNonInteractiveConfig(
      mockConfig,
      [],
      { merged: {} } as LoadedSettings,
      {},
    );

    expect(loadCliConfigMock).toHaveBeenCalledTimes(1);
    expect(loadCliConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeTools: ['toolWithSideEffects1', 'toolWithSideEffects2'],
      }),
      expect.any(Array),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should add to existing excluded tools when not in YOLO mode', async () => {
    const mockConfig = {
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getToolRegistry: () => Promise.resolve(mockToolRegistry),
      getSessionId: () => 'test-session',
    } as unknown as Config;

    await loadNonInteractiveConfig(
      mockConfig,
      [],
      {
        merged: { excludeTools: ['alreadyExcluded'] },
      } as LoadedSettings,
      {},
    );

    expect(loadCliConfigMock).toHaveBeenCalledTimes(1);
    expect(loadCliConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeTools: [
          'alreadyExcluded',
          'toolWithSideEffects1',
          'toolWithSideEffects2',
        ],
      }),
      expect.any(Array),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('should not exclude any tools when in YOLO mode', async () => {
    const mockConfig = {
      getApprovalMode: () => ApprovalMode.YOLO,
      getToolRegistry: () => Promise.resolve(mockToolRegistry),
      getSessionId: () => 'test-session',
    } as unknown as Config;

    await loadNonInteractiveConfig(
      mockConfig,
      [],
      { merged: {} } as LoadedSettings,
      {},
    );

    // loadCliConfig should not be called again.
    expect(loadCliConfigMock).not.toHaveBeenCalled();
  });
});
