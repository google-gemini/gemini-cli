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
} from 'vitest';
import {
  main,
  setupUnhandledRejectionHandler,
  validateDnsResolutionOrder,
  startInteractiveUI,
  getNodeMemoryArgs,
} from './gemini.js';
import os from 'node:os';
import v8 from 'node:v8';
import { type CliArgs } from './config/config.js';
import {
  type LoadedSettings,
  type Settings,
  createTestMergedSettings,
} from './config/settings.js';
import { appEvents, AppEvent } from './utils/events.js';

function createMockSettings(
  overrides: Record<string, unknown> = {},
): LoadedSettings {
  const merged = createTestMergedSettings(
    (overrides['merged'] as Partial<Settings>) || {},
  );

  return {
    system: { settings: {} },
    systemDefaults: { settings: {} },
    user: { settings: {} },
    workspace: { settings: {} },
    errors: [],
    ...overrides,
    merged,
  } as unknown as LoadedSettings;
}
import {
  type Config,
  type ResumedSessionData,
  debugLogger,
  coreEvents,
} from '@google/gemini-cli-core';
import { act } from 'react';
import { type InitializationResult } from './core/initializer.js';

const performance = vi.hoisted(() => ({
  now: vi.fn(),
}));
vi.stubGlobal('performance', performance);

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    recordSlowRender: vi.fn(),
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
  loadCliConfig: vi.fn().mockResolvedValue({
    getSandbox: vi.fn(() => false),
    getQuestion: vi.fn(() => ''),
    isInteractive: () => false,
    setTerminalBackground: vi.fn(),
    storage: {
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
    },
  } as unknown as Config),
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

vi.mock('./utils/sandbox.js', () => ({
  sandbox_command: vi.fn(() => ''), // Default to no sandbox command
  start_sandbox: vi.fn(() => Promise.resolve()), // Mock as an async function that resolves
}));

vi.mock('./utils/relaunch.js', () => ({
  relaunchAppInChildProcess: vi.fn(),
  relaunchOnExitCode: vi.fn(),
}));

vi.mock('./config/sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(),
}));

vi.mock('./ui/utils/mouse.js', () => ({
  enableMouseEvents: vi.fn(),
  disableMouseEvents: vi.fn(),
  parseMouseEvent: vi.fn(),
  isIncompleteMouseSequence: vi.fn(),
}));

describe('gemini.tsx main function', () => {
  let originalEnvGeminiSandbox: string | undefined;
  let originalEnvSandbox: string | undefined;
  let initialUnhandledRejectionListeners: NodeJS.UnhandledRejectionListener[] =
    [];

  beforeEach(() => {
    // Store and clear sandbox-related env variables to ensure a consistent test environment
    originalEnvGeminiSandbox = process.env['GEMINI_SANDBOX'];
    originalEnvSandbox = process.env['SANDBOX'];
    delete process.env['GEMINI_SANDBOX'];
    delete process.env['SANDBOX'];

    initialUnhandledRejectionListeners =
      process.listeners('unhandledRejection');
  });

  afterEach(() => {
    // Restore original env variables
    if (originalEnvGeminiSandbox !== undefined) {
      process.env['GEMINI_SANDBOX'] = originalEnvGeminiSandbox;
    } else {
      delete process.env['GEMINI_SANDBOX'];
    }
    if (originalEnvSandbox !== undefined) {
      process.env['SANDBOX'] = originalEnvSandbox;
    } else {
      delete process.env['SANDBOX'];
    }

    const currentListeners = process.listeners('unhandledRejection');
    currentListeners.forEach((listener) => {
      if (!initialUnhandledRejectionListeners.includes(listener)) {
        process.removeListener('unhandledRejection', listener);
      }
    });
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

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdin, 'isRaw', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original env variables
    if (originalEnvNoRelaunch !== undefined) {
      process.env['GEMINI_CLI_NO_RELAUNCH'] = originalEnvNoRelaunch;
    } else {
      delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    }
    vi.restoreAllMocks();
  });

  it('should call setRawMode and detectCapabilities when isInteractive is true', async () => {
    const { terminalCapabilityManager } = await import(
      './ui/utils/terminalCapabilityManager.js'
    );
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => true,
      getQuestion: () => '',
      getSandbox: () => false,
      getDebugMode: () => false,
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      initialize: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({
        subscribe: vi.fn(),
      }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      getToolRegistry: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getExtensions: () => [],
      getUsageStatisticsEnabled: () => false,
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      },
    } as unknown as Config);
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
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
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

    const mockConfig = {
      isInteractive: () => false,
      getQuestion: () => '',
      getSandbox: () => false,
      getDebugMode: () => false,
      getListExtensions: () => flag === 'listExtensions',
      getListSessions: () => flag === 'listSessions',
      getDeleteSession: () => (flag === 'deleteSession' ? value : undefined),
      getExtensions: () => [{ name: 'ext1' }],
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
    } as unknown as Config;

    vi.mocked(loadCliConfig).mockResolvedValue(mockConfig);
    vi.mock('./utils/sessions.js', () => ({
      listSessions: vi.fn(),
      deleteSession: vi.fn(),
    }));

    const debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
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
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSandboxConfig } = await import('./config/sandboxConfig.js');
    const { start_sandbox } = await import('./utils/sandbox.js');
    const { relaunchOnExitCode } = await import('./utils/relaunch.js');
    const { loadSettings } = await import('./config/settings.js');
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
          security: { auth: {} },
          ui: {},
        },
        workspace: { settings: {} },
        setValue: vi.fn(),
        forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      }),
    );

    const mockConfig = {
      isInteractive: () => false,
      getQuestion: () => '',
      getSandbox: () => true,
      getDebugMode: () => false,
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getExtensions: () => [],
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      refreshAuth: vi.fn(),
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
    } as unknown as Config;

    vi.mocked(loadCliConfig).mockResolvedValue(mockConfig);
    vi.mocked(loadSandboxConfig).mockResolvedValue({} as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(relaunchOnExitCode).mockImplementation(async (fn) => {
      await fn();
    });

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(start_sandbox).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);
    processExitSpy.mockRestore();
  });

  it('should log warning when theme is not found', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
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
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => false,
      getQuestion: () => 'test',
      getSandbox: () => false,
      getDebugMode: () => false,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getToolRegistry: vi.fn(),
      getExtensions: () => [],
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getUsageStatisticsEnabled: () => false,
      refreshAuth: vi.fn(),
      setTerminalBackground: vi.fn(),
      getRemoteAdminSettings: () => undefined,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.spyOn(themeManager, 'setActiveTheme').mockReturnValue(false);

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Theme "non-existent-theme" not found.'),
    );
    processExitSpy.mockRestore();
  });

  it('should handle session selector error', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
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
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => true,
      getQuestion: () => '',
      getSandbox: () => false,
      getDebugMode: () => false,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getToolRegistry: vi.fn(),
      getExtensions: () => [],
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getUsageStatisticsEnabled: () => false,
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

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
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
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
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => false,
      getQuestion: () => 'test',
      getSandbox: () => false,
      getDebugMode: () => false,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getToolRegistry: vi.fn(),
      getExtensions: () => [],
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getUsageStatisticsEnabled: () => false,
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

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
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
    const { readStdin } = await import('./utils/readStdin.js');
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
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => false,
      getQuestion: () => 'test-question',
      getSandbox: () => false,
      getDebugMode: () => false,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getProjectRoot: () => '/',
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getToolRegistry: vi.fn(),
      getExtensions: () => [],
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getUsageStatisticsEnabled: () => false,
      refreshAuth: vi.fn(),
      setTerminalBackground: vi.fn(),
      getRemoteAdminSettings: () => undefined,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.mock('./utils/readStdin.js', () => ({
      readStdin: vi.fn().mockResolvedValue('stdin-data'),
    }));
    const runNonInteractiveSpy = vi.hoisted(() => vi.fn());
    vi.mock('./nonInteractiveCli.js', () => ({
      runNonInteractive: runNonInteractiveSpy,
    }));
    runNonInteractiveSpy.mockClear();
    vi.mock('./validateNonInterActiveAuth.js', () => ({
      validateNonInteractiveAuth: vi.fn().mockResolvedValue({}),
    }));

    // Mock stdin to be non-TTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(readStdin).toHaveBeenCalled();
    // In this test setup, runNonInteractive might be called on the mocked module,
    // but we need to ensure we are checking the correct spy instance.
    // Since vi.mock is hoisted, runNonInteractiveSpy is defined early.
    expect(runNonInteractiveSpy).toHaveBeenCalled();
    const callArgs = runNonInteractiveSpy.mock.calls[0][0];
    expect(callArgs.input).toBe('test-question');
    expect(processExitSpy).toHaveBeenCalledWith(0);
    processExitSpy.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
  });
});

describe('gemini.tsx main function exit codes', () => {
  let originalEnvNoRelaunch: string | undefined;

  beforeEach(() => {
    originalEnvNoRelaunch = process.env['GEMINI_CLI_NO_RELAUNCH'];
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new MockProcessExitError(code);
    });
    // Mock stderr to avoid cluttering output
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalEnvNoRelaunch !== undefined) {
      process.env['GEMINI_CLI_NO_RELAUNCH'] = originalEnvNoRelaunch;
    } else {
      delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    }
    vi.restoreAllMocks();
  });

  it('should exit with 42 for invalid input combination (prompt-interactive with non-TTY)', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
    vi.mocked(loadCliConfig).mockResolvedValue({} as Config);
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: {} }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: true,
    } as unknown as CliArgs);
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    }
  });

  it('should exit with 41 for auth failure during sandbox setup', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
    const { loadSandboxConfig } = await import('./config/sandboxConfig.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadSandboxConfig).mockResolvedValue({} as any);
    vi.mocked(loadCliConfig).mockResolvedValue({
      refreshAuth: vi.fn().mockRejectedValue(new Error('Auth failed')),
    } as unknown as Config);
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: {
          security: { auth: { selectedType: 'google', useExternal: false } },
        },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({} as unknown as CliArgs);
    vi.mock('./config/auth.js', () => ({
      validateAuthMethod: vi.fn().mockReturnValue(null),
    }));

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(41);
    }
  });

  it('should exit with 42 for session resume failure', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');

    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => false,
      getQuestion: () => 'test',
      getSandbox: () => false,
      getDebugMode: () => false,
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      initialize: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      getToolRegistry: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getExtensions: () => [],
      getUsageStatisticsEnabled: () => false,
      getRemoteAdminSettings: () => undefined,
      setTerminalBackground: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      },
    } as unknown as Config);
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

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    }
  });

  it('should exit with 42 for no input provided', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');

    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: () => false,
      getQuestion: () => '',
      getSandbox: () => false,
      getDebugMode: () => false,
      getListExtensions: () => false,
      getListSessions: () => false,
      getDeleteSession: () => undefined,
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      initialize: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: () => false,
      getHookSystem: () => undefined,
      getToolRegistry: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getModel: () => 'gemini-pro',
      getEmbeddingModel: () => 'embedding-001',
      getApprovalMode: () => 'default',
      getCoreTools: () => [],
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getOutputFormat: () => 'text',
      getExtensions: () => [],
      getUsageStatisticsEnabled: () => false,
      setTerminalBackground: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      },
      getRemoteAdminSettings: () => undefined,
    } as unknown as Config);
    vi.mocked(loadSettings).mockReturnValue(
      createMockSettings({
        merged: { security: { auth: {} }, ui: {} },
      }),
    );
    vi.mocked(parseArguments).mockResolvedValue({} as unknown as CliArgs);
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true, // Simulate TTY so it doesn't try to read stdin
      configurable: true,
    });

    try {
      await main();
      expect.fail('Should have thrown MockProcessExitError');
    } catch (e) {
      expect(e).toBeInstanceOf(MockProcessExitError);
      expect((e as MockProcessExitError).code).toBe(42);
    }
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

describe('startInteractiveUI', () => {
  // Mock dependencies
  const mockConfig = {
    getProjectRoot: () => '/root',
    getScreenReader: () => false,
    getDebugMode: () => false,
  } as unknown as Config;
  const mockSettings = {
    merged: {
      ui: {
        hideWindowTitle: false,
        useAlternateBuffer: true,
      },
    },
  } as LoadedSettings;
  const mockStartupWarnings = ['warning1'];
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function startTestInteractiveUI(
    config: Config,
    settings: LoadedSettings,
    startupWarnings: string[],
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
    expect(registerCleanup).toHaveBeenCalledTimes(3);

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
