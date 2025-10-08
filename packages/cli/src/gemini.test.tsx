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
} from './gemini.js';
import { type LoadedSettings } from './config/settings.js';
import { appEvents, AppEvent } from './utils/events.js';
import type { Config } from '@google/gemini-cli-core';

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
    loadSettings: vi.fn(),
  };
});

vi.mock('./config/config.js', () => ({
  loadCliConfig: vi.fn().mockResolvedValue({
    getSandbox: vi.fn(() => false),
    getQuestion: vi.fn(() => ''),
    isInteractive: () => false,
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
}));

vi.mock('./config/sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(),
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
    const addedListener = currentListeners.find(
      (listener) => !initialUnhandledRejectionListeners.includes(listener),
    );

    if (addedListener) {
      process.removeListener('unhandledRejection', addedListener);
    }
    vi.restoreAllMocks();
  });

  it('verifies that we dont load the config before relaunchAppInChildProcess', async () => {
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });
    const { relaunchAppInChildProcess } = await import('./utils/relaunch.js');
    const { loadCliConfig } = await import('./config/config.js');
    const { loadSettings } = await import('./config/settings.js');
    const { loadSandboxConfig } = await import('./config/sandboxConfig.js');
    vi.mocked(loadSandboxConfig).mockResolvedValue(undefined);

    const callOrder: string[] = [];
    vi.mocked(relaunchAppInChildProcess).mockImplementation(async () => {
      callOrder.push('relaunch');
    });
    vi.mocked(loadCliConfig).mockImplementation(async () => {
      callOrder.push('loadCliConfig');
      return {
        isInteractive: () => false,
        getQuestion: () => '',
        getSandbox: () => false,
        getDebugMode: () => false,
        getListExtensions: () => false,
        getMcpServers: () => ({}),
        initialize: vi.fn(),
        getIdeMode: () => false,
        getExperimentalZedIntegration: () => false,
        getScreenReader: () => false,
        getGeminiMdFileCount: () => 0,
        getProjectRoot: () => '/',
      } as unknown as Config;
    });
    vi.mocked(loadSettings).mockReturnValue({
      errors: [],
      merged: {
        advanced: { autoConfigureMemory: true },
        security: { auth: {} },
        ui: {},
      },
      setValue: vi.fn(),
      forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
    } as never);
    try {
      await main();
    } catch (e) {
      // Mocked process exit throws an error.
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    // It is critical that we call relaunch before loadCliConfig to avoid
    // loading config in the outer process when we are going to relaunch.
    // By ensuring we don't load the config we also ensure we don't trigger any
    // operations that might require loading the config such as such as
    // initializing mcp servers.
    // For the sandbox case we still have to load a partial cli config.
    // we can authorize outside the sandbox.
    expect(callOrder).toEqual(['relaunch', 'loadCliConfig']);
    processExitSpy.mockRestore();
  });

  it('should log unhandled promise rejections and open debug console on first error', async () => {
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });
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
  });

  it('should call setRawMode and detectAndEnableKittyProtocol when isInteractive is true', async () => {
    const { detectAndEnableKittyProtocol } = await import(
      './ui/utils/kittyProtocolDetector.js'
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
      getMcpServers: () => ({}),
      initialize: vi.fn(),
      getIdeMode: () => false,
      getExperimentalZedIntegration: () => false,
      getScreenReader: () => false,
      getGeminiMdFileCount: () => 0,
    } as unknown as Config);
    vi.mocked(loadSettings).mockReturnValue({
      errors: [],
      merged: {
        advanced: {},
        security: { auth: {} },
        ui: {},
      },
      setValue: vi.fn(),
      forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
    } as never);
    vi.mocked(parseArguments).mockResolvedValue({
      model: undefined,
      sandbox: undefined,
      sandboxImage: undefined,
      debug: undefined,
      prompt: undefined,
      promptInteractive: undefined,
      query: undefined,
      allFiles: undefined,
      showMemoryUsage: undefined,
      yolo: undefined,
      approvalMode: undefined,
      telemetry: undefined,
      checkpointing: undefined,
      telemetryTarget: undefined,
      telemetryOtlpEndpoint: undefined,
      telemetryOtlpProtocol: undefined,
      telemetryLogPrompts: undefined,
      telemetryOutfile: undefined,
      allowedMcpServerNames: undefined,
      allowedTools: undefined,
      experimentalAcp: undefined,
      extensions: undefined,
      listExtensions: undefined,
      proxy: undefined,
      includeDirectories: undefined,
      screenReader: undefined,
      useSmartEdit: undefined,
      useWriteTodos: undefined,
      outputFormat: undefined,
    });

    await main();

    expect(setRawModeSpy).toHaveBeenCalledWith(true);
    expect(detectAndEnableKittyProtocol).toHaveBeenCalledTimes(1);
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

describe('startInteractiveUI', () => {
  // Mock dependencies
  const mockConfig = {
    getProjectRoot: () => '/root',
    getScreenReader: () => false,
  } as Config;
  const mockSettings = {
    merged: {
      ui: {
        hideWindowTitle: false,
      },
    },
  } as LoadedSettings;
  const mockStartupWarnings = ['warning1'];
  const mockWorkspaceRoot = '/root';

  vi.mock('./utils/version.js', () => ({
    getCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
  }));

  vi.mock('./ui/utils/kittyProtocolDetector.js', () => ({
    detectAndEnableKittyProtocol: vi.fn(() => Promise.resolve(true)),
  }));

  vi.mock('./ui/utils/updateCheck.js', () => ({
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
  }));

  vi.mock('./utils/cleanup.js', () => ({
    cleanupCheckpoints: vi.fn(() => Promise.resolve()),
    registerCleanup: vi.fn(),
  }));

  vi.mock('ink', () => ({
    render: vi.fn().mockReturnValue({ unmount: vi.fn() }),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the UI with proper React context and exitOnCtrlC disabled', async () => {
    const { render } = await import('ink');
    const renderSpy = vi.mocked(render);

    const mockInitializationResult = {
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 0,
    };

    await startInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      mockInitializationResult,
    );

    // Verify render was called with correct options
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const [reactElement, options] = renderSpy.mock.calls[0];

    // Verify render options
    expect(options).toEqual({
      exitOnCtrlC: false,
      isScreenReaderEnabled: false,
    });

    // Verify React element structure is valid (but don't deep dive into JSX internals)
    expect(reactElement).toBeDefined();
  });

  it('should perform all startup tasks in correct order', async () => {
    const { getCliVersion } = await import('./utils/version.js');
    const { checkForUpdates } = await import('./ui/utils/updateCheck.js');
    const { registerCleanup } = await import('./utils/cleanup.js');

    const mockInitializationResult = {
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 0,
    };

    await startInteractiveUI(
      mockConfig,
      mockSettings,
      mockStartupWarnings,
      mockWorkspaceRoot,
      mockInitializationResult,
    );

    // Verify all startup tasks were called
    expect(getCliVersion).toHaveBeenCalledTimes(1);
    expect(registerCleanup).toHaveBeenCalledTimes(1);

    // Verify cleanup handler is registered with unmount function
    const cleanupFn = vi.mocked(registerCleanup).mock.calls[0][0];
    expect(typeof cleanupFn).toBe('function');

    // checkForUpdates should be called asynchronously (not waited for)
    // We need a small delay to let it execute
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
