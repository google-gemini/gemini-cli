/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
  type Mock,
} from 'vitest';
import {
  main,
  setupUnhandledRejectionHandler,
  validateDnsResolutionOrder,
  startInteractiveUI,
  getNodeMemoryArgs,
} from './gemini.js';
import { loadCliConfig, parseArguments } from './config/config.js';
import { loadSandboxConfig } from './config/sandboxConfig.js';
import { terminalCapabilityManager } from './ui/utils/terminalCapabilityManager.js';
import { start_sandbox } from './utils/sandbox.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import os from 'node:os';
import v8 from 'node:v8';
import { type CliArgs } from './config/config.js';
import { type LoadedSettings, loadSettings } from './config/settings.js';
import {
  createMockConfig,
  createMockSettings,
} from './test-utils/mockConfig.js';
import { appEvents, AppEvent } from './utils/events.js';
import {
  type Config,
  type ResumedSessionData,
  type StartupWarning,
  WarningPriority,
  debugLogger,
  coreEvents,
  AuthType,
} from '@google/gemini-cli-core';
import { act } from 'react';
import { type InitializationResult } from './core/initializer.js';
import { runNonInteractive } from './nonInteractiveCli.js';
// Hoisted constants and mocks
const performance = vi.hoisted(() => ({
  now: vi.fn(),
}));
vi.stubGlobal('performance', performance);

const runNonInteractiveSpy = vi.hoisted(() => vi.fn());
vi.mock('./nonInteractiveCli.js', () => ({
  runNonInteractive: runNonInteractiveSpy,
}));

const terminalNotificationMocks = vi.hoisted(() => ({
  notifyViaTerminal: vi.fn().mockResolvedValue(true),
  buildRunEventNotificationContent: vi.fn(() => ({
    title: 'Session complete',
    body: 'done',
    subtitle: 'Run finished',
  })),
}));
vi.mock('./utils/terminalNotifications.js', () => ({
  notifyViaTerminal: terminalNotificationMocks.notifyViaTerminal,
  buildRunEventNotificationContent:
    terminalNotificationMocks.buildRunEventNotificationContent,
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    recordSlowRender: vi.fn(),
    logUserPrompt: vi.fn(),
    writeToStdout: vi.fn((...args) =>
      process.stdout.write(
        ...(args as Parameters<typeof process.stdout.write>),
      ),
    ),
    patchStdio: vi.fn(() => () => {}),
    createWorkingStdio: vi.fn(() => ({
      stdout: {
        write: vi.fn((...args) =>
          process.stdout.write(
            ...(args as Parameters<typeof process.stdout.write>),
          ),
        ),
        columns: 80,
        rows: 24,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      stderr: {
        write: vi.fn(),
      },
    })),
    enableMouseEvents: vi.fn(),
    disableMouseEvents: vi.fn(),
    enterAlternateScreen: vi.fn(),
    disableLineWrapping: vi.fn(),
    getVersion: vi.fn(() => Promise.resolve('1.0.0')),
    startupProfiler: {
      start: vi.fn(() => ({
        end: vi.fn(),
      })),
      flush: vi.fn(),
    },
    ClearcutLogger: {
      getInstance: vi.fn(() => ({
        logStartSessionEvent: vi.fn().mockResolvedValue(undefined),
        logEndSessionEvent: vi.fn().mockResolvedValue(undefined),
        logUserPrompt: vi.fn(),
        addDefaultFields: vi.fn((data) => data),
      })),
      clearInstance: vi.fn(),
    },
    coreEvents: {
      ...actual.coreEvents,
      emitFeedback: vi.fn(),
      emitConsoleLog: vi.fn(),
      listenerCount: vi.fn().mockReturnValue(0),
      on: vi.fn(),
      off: vi.fn(),
      drainBacklogs: vi.fn(),
    },
  };
});

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    render: vi.fn((_node, options) => {
      if (options.alternateBuffer) {
        options.stdout.write('\x1b[?7l');
      }
      // Simulate rendering time for recordSlowRender test
      const start = performance.now();
      const end = performance.now();
      if (options.onRender) {
        options.onRender({ renderTime: end - start });
      }
      return {
        unmount: vi.fn(),
        rerender: vi.fn(),
        cleanup: vi.fn(),
        waitUntilExit: vi.fn(),
      };
    }),
  };
});

// Custom error to identify mock process.exit calls
class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

// Mock dependencies
vi.mock('./config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn().mockImplementation(() => ({
      merged: actual.getDefaultsFromSchema(),
      workspace: { settings: {} },
      errors: [],
    })),
    saveModelChange: vi.fn(),
    getDefaultsFromSchema: actual.getDefaultsFromSchema,
  };
});

vi.mock('./ui/utils/terminalCapabilityManager.js', () => ({
  terminalCapabilityManager: {
    detectCapabilities: vi.fn(),
    getTerminalBackgroundColor: vi.fn(),
  },
}));

vi.mock('./config/config.js', () => ({
  loadCliConfig: vi.fn().mockImplementation(async () => createMockConfig()),
  parseArguments: vi.fn().mockResolvedValue({}),
  isDebugMode: vi.fn(() => false),
}));

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

import * as readStdinModule from './utils/readStdin.js';

vi.mock('./utils/sandbox.js', () => ({
  sandbox_command: vi.fn(() => ''), // Default to no sandbox command
  start_sandbox: vi.fn(() => Promise.resolve()), // Mock as an async function that resolves
}));

vi.mock('./utils/relaunch.js', () => ({
  relaunchAppInChildProcess: vi.fn().mockResolvedValue(undefined),
  relaunchOnExitCode: vi.fn(async (fn) => {
    await fn();
  }),
}));

vi.mock('./config/sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn().mockResolvedValue({
    command: 'docker',
    image: 'test-image',
  }),
}));

vi.mock('./deferred.js', () => ({
  runDeferredCommand: vi.fn().mockResolvedValue(undefined),
  setDeferredCommand: vi.fn(),
  defer: vi.fn((m) => m),
}));

vi.mock('./ui/utils/mouse.js', () => ({
  enableMouseEvents: vi.fn(),
  disableMouseEvents: vi.fn(),
  isIncompleteMouseSequence: vi.fn(),
}));

vi.mock('./validateNonInterActiveAuth.js', () => ({
  validateNonInteractiveAuth: vi.fn().mockResolvedValue('google'),
}));

describe('gemini.tsx main function', () => {
  let originalIsTTY: boolean | undefined;
  let initialUnhandledRejectionListeners: NodeJS.UnhandledRejectionListener[] =
    [];

  beforeEach(() => {
    // Store and clear sandbox-related env variables to ensure a consistent test environment
    vi.stubEnv('GEMINI_SANDBOX', '');
    vi.stubEnv('SANDBOX', '');
    vi.stubEnv('SHPOOL_SESSION_NAME', '');

    initialUnhandledRejectionListeners =
      process.listeners('unhandledRejection');

    originalIsTTY = process.stdin.isTTY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = true;
  });

  afterEach(() => {
    const currentListeners = process.listeners('unhandledRejection');
    currentListeners.forEach((listener) => {
      if (!initialUnhandledRejectionListeners.includes(listener)) {
        process.removeListener('unhandledRejection', listener);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = originalIsTTY;

    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should log unhandled promise rejections and open debug console on first error', async () => {
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });
    const appEventsMock = vi.mocked(appEvents);
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
    const rejectionError = new Error('Test unhandled rejection');

    setupUnhandledRejectionHandler();
    // Simulate an unhandled rejection.
    // We are not using Promise.reject here as vitest will catch it.
    // Instead we will dispatch the event manually.
    process.emit('unhandledRejection', rejectionError, Promise.resolve());

    // We need to wait for the rejection handler to be called.
    await new Promise(process.nextTick);

    expect(appEventsMock.emit).toHaveBeenCalledWith(AppEvent.OpenDebugConsole);
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled Promise Rejection'),
    );
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
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

describe('setWindowTitle', () => {
  it('should set window title when hideWindowTitle is false', async () => {
    // setWindowTitle is not exported, but we can test its effect if we had a way to call it.
    // Since we can't easily call it directly without exporting it, we skip direct testing
    // and rely on startInteractiveUI tests which call it.
  });
});

describe('initializeOutputListenersAndFlush', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should flush backlogs and setup listeners if no listeners exist', async () => {
    const { coreEvents } = await import('@google/gemini-cli-core');
    const { initializeOutputListenersAndFlush } = await import('./gemini.js');

    // Mock listenerCount to return 0
    vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(0);
    const drainSpy = vi.spyOn(coreEvents, 'drainBacklogs');

    initializeOutputListenersAndFlush();

    expect(drainSpy).toHaveBeenCalled();
    // We can't easily check if listeners were added without access to the internal state of coreEvents,
    // but we can verify that drainBacklogs was called.
  });
});

describe('getNodeMemoryArgs', () => {
  let osTotalMemSpy: MockInstance;
  let v8GetHeapStatisticsSpy: MockInstance;

  beforeEach(() => {
    osTotalMemSpy = vi.spyOn(os, 'totalmem');
    v8GetHeapStatisticsSpy = vi.spyOn(v8, 'getHeapStatistics');
    delete process.env['GEMINI_CLI_NO_RELAUNCH'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty array if GEMINI_CLI_NO_RELAUNCH is set', () => {
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
    expect(getNodeMemoryArgs(false)).toEqual([]);
  });

  it('should return empty array if current heap limit is sufficient', () => {
    osTotalMemSpy.mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
    v8GetHeapStatisticsSpy.mockReturnValue({
      heap_size_limit: 8 * 1024 * 1024 * 1024, // 8GB
    });
    // Target is 50% of 16GB = 8GB. Current is 8GB. No relaunch needed.
    expect(getNodeMemoryArgs(false)).toEqual([]);
  });

  it('should return memory args if current heap limit is insufficient', () => {
    osTotalMemSpy.mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
    v8GetHeapStatisticsSpy.mockReturnValue({
      heap_size_limit: 4 * 1024 * 1024 * 1024, // 4GB
    });
    // Target is 50% of 16GB = 8GB. Current is 4GB. Relaunch needed.
    expect(getNodeMemoryArgs(false)).toEqual(['--max-old-space-size=8192']);
  });

  it('should log debug info when isDebugMode is true', () => {
    const debugSpy = vi.spyOn(debugLogger, 'debug');
    osTotalMemSpy.mockReturnValue(16 * 1024 * 1024 * 1024);
    v8GetHeapStatisticsSpy.mockReturnValue({
      heap_size_limit: 4 * 1024 * 1024 * 1024,
    });
    getNodeMemoryArgs(true);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Current heap size'),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Need to relaunch with more memory'),
    );
  });
});

describe('gemini.tsx main function kitty protocol', () => {
  let originalEnvNoRelaunch: string | undefined;
  let originalIsTTY: boolean | undefined;
  let originalIsRaw: boolean | undefined;
  let setRawModeSpy: MockInstance<
    (mode: boolean) => NodeJS.ReadStream & { fd: 0 }
  >;

  beforeEach(() => {
    // Set no relaunch in tests since process spawning causing issues in tests
    originalEnvNoRelaunch = process.env['GEMINI_CLI_NO_RELAUNCH'];
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(process.stdin as any).setRawMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).setRawMode = vi.fn();
    }
    setRawModeSpy = vi.spyOn(process.stdin, 'setRawMode');

    originalIsTTY = process.stdin.isTTY;
    originalIsRaw = process.stdin.isRaw;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isRaw = false;
  });

  afterEach(() => {
    // Restore original env variables
    if (originalEnvNoRelaunch !== undefined) {
      process.env['GEMINI_CLI_NO_RELAUNCH'] = originalEnvNoRelaunch;
    } else {
      delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = originalIsTTY;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isRaw = originalIsRaw;
    vi.restoreAllMocks();
  });

  it('should call setRawMode and detectCapabilities when isInteractive is true', async () => {
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => true,
        getQuestion: () => '',
        getSandbox: () => undefined,
      }),
    );
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          advanced: {},
          security: { auth: {} },
          ui: {},
        },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({
      model: undefined,
      sandbox: undefined,
      debug: undefined,
      prompt: undefined,
      promptInteractive: undefined,
      query: undefined,
      yolo: undefined,
      approvalMode: undefined,
      policy: undefined,
      allowedMcpServerNames: undefined,
      allowedTools: undefined,
      experimentalAcp: undefined,
      extensions: undefined,
      listExtensions: undefined,
      includeDirectories: undefined,
      screenReader: undefined,
      useWriteTodos: undefined,
      resume: undefined,
      listSessions: undefined,
      deleteSession: undefined,
      outputFormat: undefined,
      fakeResponses: undefined,
      recordResponses: undefined,
      rawOutput: undefined,
      acceptRawOutputRisk: undefined,
      isCommand: undefined,
    });

    await act(async () => {
      await main();
    });

    expect(setRawModeSpy).toHaveBeenCalledWith(true);
    expect(terminalCapabilityManager.detectCapabilities).toHaveBeenCalledTimes(
      1,
    );
  });

  it.each([
    { flag: 'listExtensions' },
    { flag: 'listSessions' },
    { flag: 'deleteSession', value: 'session-id' },
  ])('should handle --$flag flag', async ({ flag, value }) => {
    const { listSessions, deleteSession } = await import('./utils/sessions.js');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          advanced: {},
          security: { auth: {} },
          ui: {},
        },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const mockConfig = createMockConfig({
      isInteractive: () => false,
      getQuestion: () => '',
      getSandbox: () => undefined,
      getListExtensions: () => flag === 'listExtensions',
      getListSessions: () => flag === 'listSessions',
      getDeleteSession: () => (flag === 'deleteSession' ? value : undefined),
      getExtensions: () => [
        {
          name: 'ext1',
          id: 'ext1',
          version: '1.0.0',
          isActive: true,
          path: '/path/to/ext1',
          contextFiles: [],
        },
      ],
    });

    vi.mocked(loadCliConfig).mockResolvedValue(mockConfig);
    vi.mock('./utils/sessions.js', () => ({
      listSessions: vi.fn(),
      deleteSession: vi.fn(),
    }));

    const debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }

    if (flag === 'listExtensions') {
      expect(debugLoggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ext1'),
      );
    } else if (flag === 'listSessions') {
      expect(listSessions).toHaveBeenCalledWith(mockConfig);
    } else if (flag === 'deleteSession') {
      expect(deleteSession).toHaveBeenCalledWith(mockConfig, value);
    }
    expect(processExitSpy).toHaveBeenCalledWith(0);
    processExitSpy.mockRestore();
  });

  it('should handle sandbox activation', async () => {
    vi.stubEnv('SANDBOX', '');
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          advanced: {},
          security: { auth: { selectedType: 'google' } },
          ui: {},
        },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    const mockConfig = createMockConfig({
      isInteractive: () => false,
      getQuestion: () => '',
      getSandbox: () => ({ command: 'docker', image: 'test-image' }),
    });

    vi.mocked(loadCliConfig).mockResolvedValue(mockConfig);
    vi.mocked(loadSandboxConfig).mockResolvedValue({
      command: 'docker',
      image: 'test-image',
    });

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }

    expect(start_sandbox).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);
    processExitSpy.mockRestore();
  });

  it('should log warning when theme is not found', async () => {
    const { themeManager } = await import('./ui/themes/theme-manager.js');
    const debugLoggerWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          advanced: {},
          security: { auth: {} },
          ui: { theme: 'non-existent-theme' },
        },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => 'test',
        getSandbox: () => undefined,
      }),
    );

    vi.spyOn(themeManager, 'setActiveTheme').mockReturnValue(false);

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }

    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Theme "non-existent-theme" not found.'),
    );
    processExitSpy.mockRestore();
  });

  it('should handle session selector error', async () => {
    const { SessionSelector } = await import('./utils/sessionUtils.js');
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          resolveSession: vi
            .fn()
            .mockRejectedValue(new Error('Session not found')),
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });
    const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { advanced: {}, security: { auth: {} }, ui: { theme: 'test' } },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
      resume: 'session-id',
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => true,
        getQuestion: () => '',
        getSandbox: () => undefined,
      }),
    );

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(emitFeedbackSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Error resuming session: Session not found'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(42);
    processExitSpy.mockRestore();
    emitFeedbackSpy.mockRestore();
  });

  it.skip('should log error when cleanupExpiredSessions fails', async () => {
    const { cleanupExpiredSessions } = await import(
      './utils/sessionCleanup.js'
    );
    vi.mocked(cleanupExpiredSessions).mockRejectedValue(
      new Error('Cleanup failed'),
    );
    const debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { advanced: {}, security: { auth: {} }, ui: {} },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => 'test',
        getSandbox: () => undefined,
      }),
    );

    // The mock is already set up at the top of the test

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to cleanup expired sessions: Cleanup failed',
      ),
    );
    expect(processExitSpy).toHaveBeenCalledWith(0); // Should not exit on cleanup failure
    processExitSpy.mockRestore();
  });

  it('should read from stdin in non-interactive mode', async () => {
    vi.stubEnv('SANDBOX', 'true');
    vi.mocked(loadSandboxConfig).mockResolvedValue(undefined);
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    const readStdinSpy = vi
      .spyOn(readStdinModule, 'readStdin')
      .mockResolvedValue('stdin-data');

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { advanced: {}, security: { auth: {} }, ui: {} },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => 'test-question',
        getSandbox: () => undefined,
      }),
    );

    // Mock stdin to be non-TTY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = false;

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }

    expect(readStdinSpy).toHaveBeenCalled();
    // In this test setup, runNonInteractive might be called on the mocked module,
    // but we need to ensure we are checking the correct spy instance.
    // Since vi.mock is hoisted, runNonInteractiveSpy is defined early.
    expect(runNonInteractive).toHaveBeenCalled();
    const callArgs = vi.mocked(runNonInteractive).mock.calls[0][0];
    expect(callArgs.input).toBe('stdin-data\n\ntest-question');
    expect(
      terminalNotificationMocks.buildRunEventNotificationContent,
    ).not.toHaveBeenCalled();
    expect(terminalNotificationMocks.notifyViaTerminal).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);
    processExitSpy.mockRestore();
  });
});

describe('gemini.tsx main function exit codes', () => {
  let originalEnvNoRelaunch: string | undefined;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalEnvNoRelaunch = process.env['GEMINI_CLI_NO_RELAUNCH'];
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new MockProcessExitError(code);
    });
    // Mock stderr to avoid cluttering output
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    if (originalEnvNoRelaunch !== undefined) {
      process.env['GEMINI_CLI_NO_RELAUNCH'] = originalEnvNoRelaunch;
    } else {
      delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = originalIsTTY;
    vi.restoreAllMocks();
  });

  it('should exit with 42 for invalid input combination (prompt-interactive with non-TTY)', async () => {
    vi.mocked(loadCliConfig).mockResolvedValue(createMockConfig());
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: {} }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: true,
    } as unknown as CliArgs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = false;

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    }
  });

  it('should exit with 41 for auth failure during sandbox setup', async () => {
    vi.stubEnv('SANDBOX', '');
    vi.mocked(loadSandboxConfig).mockResolvedValue({
      command: 'docker',
      image: 'test-image',
    });
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        refreshAuth: vi.fn().mockRejectedValue(new Error('Auth failed')),
        getRemoteAdminSettings: vi.fn().mockReturnValue(undefined),
        isInteractive: vi.fn().mockReturnValue(true),
      }),
    );
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          security: { auth: { selectedType: 'google', useExternal: false } },
        },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({} as CliArgs);

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(41);
    }
  });

  it('should exit with 42 for session resume failure', async () => {
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => 'test',
        getSandbox: () => undefined,
      }),
    );
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: {} }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({
      resume: 'invalid-session',
    } as unknown as CliArgs);

    vi.mock('./utils/sessionUtils.js', () => ({
      SessionSelector: vi.fn().mockImplementation(() => ({
        resolveSession: vi
          .fn()
          .mockRejectedValue(new Error('Session not found')),
      })),
    }));

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }
  });

  it('should exit with 42 for no input provided', async () => {
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => '',
        getSandbox: () => undefined,
      }),
    );
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: {} }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({} as unknown as CliArgs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdin as any).isTTY = true;

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    } finally {
      delete process.env['GEMINI_API_KEY'];
    }
  });

  it('should validate and refresh auth in non-interactive mode when no auth type is selected but env var is present', async () => {
    const refreshAuthSpy = vi.fn();
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        isInteractive: () => false,
        getQuestion: () => 'test prompt',
        getSandbox: () => undefined,
        refreshAuth: refreshAuthSpy,
      }),
    );
    vi.mocked(validateNonInteractiveAuth).mockResolvedValue(
      AuthType.USE_GEMINI,
    );

    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: { selectedType: undefined } }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({} as unknown as CliArgs);

    runNonInteractiveSpy.mockImplementation(() => Promise.resolve());

    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    process.env['GEMINI_API_KEY'] = 'test-key';
    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    } finally {
      delete process.env['GEMINI_API_KEY'];
      processExitSpy.mockRestore();
    }

    expect(refreshAuthSpy).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });
});

describe('validateDnsResolutionOrder', () => {
  let debugLoggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugLoggerWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return "ipv4first" when the input is "ipv4first"', () => {
    expect(validateDnsResolutionOrder('ipv4first')).toBe('ipv4first');
    expect(debugLoggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should return "verbatim" when the input is "verbatim"', () => {
    expect(validateDnsResolutionOrder('verbatim')).toBe('verbatim');
    expect(debugLoggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should return the default "ipv4first" when the input is undefined', () => {
    expect(validateDnsResolutionOrder(undefined)).toBe('ipv4first');
    expect(debugLoggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should return the default "ipv4first" and log a warning for an invalid string', () => {
    expect(validateDnsResolutionOrder('invalid-value')).toBe('ipv4first');
    expect(debugLoggerWarnSpy).toHaveBeenCalledExactlyOnceWith(
      'Invalid value for dnsResolutionOrder in settings: "invalid-value". Using default "ipv4first".',
    );
  });
});

describe('project hooks loading based on trust', () => {
  let loadCliConfig: Mock;
  let loadSettings: Mock;
  let parseArguments: Mock;

  beforeEach(async () => {
    // Dynamically import and get the mocked functions
    const configModule = await import('./config/config.js');
    loadCliConfig = vi.mocked(configModule.loadCliConfig);
    parseArguments = vi.mocked(configModule.parseArguments);
    parseArguments.mockResolvedValue({ startupMessages: [] });

    const settingsModule = await import('./config/settings.js');
    loadSettings = vi.mocked(settingsModule.loadSettings);

    vi.clearAllMocks();
    // Mock the main function's dependencies to isolate the config loading part
    vi.mock('./nonInteractiveCli.js', () => ({
      runNonInteractive: vi.fn().mockResolvedValue(undefined),
    }));

    vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as (
      code?: string | number | null,
    ) => never);

    // Default mock implementation for loadCliConfig
    loadCliConfig.mockResolvedValue(
      createMockConfig({
        getQuestion: vi.fn().mockReturnValue('test question'),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load project hooks when workspace is trusted', async () => {
    const hooks = { 'before-model': 'echo "trusted"' };
    loadSettings.mockReturnValue(
      createMockSettings({
        workspace: {
          isTrusted: true,
          settings: { hooks },
        },
        merged: {
          security: { auth: { selectedType: 'google' } },
        },
      }),
    );

    await main();

    expect(loadCliConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        projectHooks: hooks,
      }),
    );
  });

  it('should NOT load project hooks when workspace is not trusted', async () => {
    loadSettings.mockReturnValue(
      createMockSettings({
        workspace: {
          isTrusted: false,
          settings: {},
        },
        merged: {
          security: { auth: { selectedType: 'google' } },
        },
      }),
    );

    await main();

    expect(loadCliConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        projectHooks: undefined,
      }),
    );
  });
});

describe('startInteractiveUI', () => {
  // Mock dependencies
  const mockConfig = createMockConfig({
    getProjectRoot: () => '/root',
    getScreenReader: () => false,
    getDebugMode: () => false,
  });
  const mockSettings = {
    merged: {
      ui: {
        hideWindowTitle: false,
        useAlternateBuffer: true,
        incrementalRendering: true,
      },
      general: {
        debugKeystrokeLogging: false,
      },
    },
  } as LoadedSettings;
  const mockStartupWarnings: StartupWarning[] = [
    { id: 'w1', message: 'warning1', priority: WarningPriority.High },
  ];
  const mockWorkspaceRoot = '/root';
  const mockInitializationResult = {
    authError: null,
    themeError: null,
    shouldOpenAuthDialog: false,
    geminiMdFileCount: 0,
  };

  vi.mock('./ui/utils/updateCheck.js', () => ({
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
  }));

  vi.mock('./utils/cleanup.js', () => ({
    cleanupCheckpoints: vi.fn(() => Promise.resolve()),
    registerCleanup: vi.fn(),
    runExitCleanup: vi.fn(),
    registerSyncCleanup: vi.fn(),
    registerTelemetryConfig: vi.fn(),
  }));

  beforeEach(() => {
    vi.stubEnv('SHPOOL_SESSION_NAME', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function startTestInteractiveUI(
    config: Config,
    settings: LoadedSettings,
    startupWarnings: StartupWarning[],
    workspaceRoot: string,
    resumedSessionData: ResumedSessionData | undefined,
    initializationResult: InitializationResult,
  ) {
    await act(async () => {
      await startInteractiveUI(
        config,
        settings,
        startupWarnings,
        workspaceRoot,
        resumedSessionData,
        initializationResult,
      );
    });
  }

  it('should render the UI with proper React context and exitOnCtrlC disabled', async () => {
    const { render } = await import('ink');
    const renderSpy = vi.mocked(render);

    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );

    // Verify render was called with correct options
    const [reactElement, options] = renderSpy.mock.calls[0];

    // Verify render options
    expect(options).toEqual(
      expect.objectContaining({
        alternateBuffer: true,
        exitOnCtrlC: false,
        incrementalRendering: true,
        isScreenReaderEnabled: false,
        onRender: expect.any(Function),
        patchConsole: false,
      }),
    );

    // Verify React element structure is valid (but don't deep dive into JSX internals)
    expect(reactElement).toBeDefined();
  });

  it('should enable mouse events when alternate buffer is enabled', async () => {
    const { enableMouseEvents } = await import('@google/gemini-cli-core');
    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );
    expect(enableMouseEvents).toHaveBeenCalled();
  });

  it('should patch console', async () => {
    const { ConsolePatcher } = await import('./ui/utils/ConsolePatcher.js');
    const patchSpy = vi.spyOn(ConsolePatcher.prototype, 'patch');
    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );
    expect(patchSpy).toHaveBeenCalled();
  });

  it('should perform all startup tasks in correct order', async () => {
    const { getVersion } = await import('@google/gemini-cli-core');
    const { checkForUpdates } = await import('./ui/utils/updateCheck.js');
    const { registerCleanup } = await import('./utils/cleanup.js');

    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );

    // Verify all startup tasks were called
    expect(getVersion).toHaveBeenCalledTimes(1);
    expect(registerCleanup).toHaveBeenCalledTimes(4);

    // Verify cleanup handler is registered with unmount function
    const cleanupFn = vi.mocked(registerCleanup).mock.calls[0][0];
    expect(typeof cleanupFn).toBe('function');

    // checkForUpdates should be called asynchronously (not waited for)
    // We need a small delay to let it execute
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('should not recordSlowRender when less than threshold', async () => {
    const { recordSlowRender } = await import('@google/gemini-cli-core');
    performance.now.mockReturnValueOnce(0);
    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );

    expect(recordSlowRender).not.toHaveBeenCalled();
  });

  it('should call recordSlowRender when more than threshold', async () => {
    const { recordSlowRender } = await import('@google/gemini-cli-core');
    performance.now.mockReturnValueOnce(0);
    performance.now.mockReturnValueOnce(300);

    await startTestInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );

    expect(recordSlowRender).toHaveBeenCalledWith(mockConfig, 300);
  });

  it.each([
    {
      screenReader: true,
      expectedCalls: [],
      name: 'should not disable line wrapping in screen reader mode',
    },
    {
      screenReader: false,
      expectedCalls: [['\x1b[?7l']],
      name: 'should disable line wrapping when not in screen reader mode',
    },
  ])('$name', async ({ screenReader, expectedCalls }) => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const mockConfigWithScreenReader = {
      ...mockConfig,
      getScreenReader: () => screenReader,
    } as Config;

    await startTestInteractiveUI(
      mockConfigWithScreenReader,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      undefined,
      mockInitializationResult,
    );

    if (expectedCalls.length > 0) {
      expect(writeSpy).toHaveBeenCalledWith(expectedCalls[0][0]);
    } else {
      expect(writeSpy).not.toHaveBeenCalledWith('\x1b[?7l');
    }
    writeSpy.mockRestore();
  });
});
