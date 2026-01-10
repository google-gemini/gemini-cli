/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './gemini.js';
import { debugLogger } from '@google/gemini-cli-core';
import { type Config } from '@google/gemini-cli-core';

// Custom error to identify mock process.exit calls
class MockProcessExitError extends Error {
  constructor(readonly code?: string | number | null | undefined) {
    super('PROCESS_EXIT_MOCKED');
    this.name = 'MockProcessExitError';
  }
}

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    writeToStdout: vi.fn(),
    patchStdio: vi.fn(() => () => {}),
    createWorkingStdio: vi.fn(() => ({
      stdout: {
        write: vi.fn(),
        columns: 80,
        rows: 24,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      stderr: { write: vi.fn() },
    })),
    enableMouseEvents: vi.fn(),
    disableMouseEvents: vi.fn(),
    enterAlternateScreen: vi.fn(),
    disableLineWrapping: vi.fn(),
  };
});

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    render: vi.fn(() => ({
      unmount: vi.fn(),
      rerender: vi.fn(),
      cleanup: vi.fn(),
      waitUntilExit: vi.fn(),
    })),
  };
});

vi.mock('./config/settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/settings.js')>();
  return {
    ...actual,
    loadSettings: vi.fn().mockReturnValue({
      merged: { advanced: {}, security: { auth: {} }, ui: {} },
      workspace: { settings: {} },
      setValue: vi.fn(),
      forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      errors: [],
    }),
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
  default: vi.fn(() => ({ notify: vi.fn() })),
}));

vi.mock('./utils/events.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/events.js')>();
  return { ...actual, appEvents: { emit: vi.fn() } };
});

vi.mock('./utils/sandbox.js', () => ({
  sandbox_command: vi.fn(() => ''),
  start_sandbox: vi.fn(() => Promise.resolve()),
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

vi.mock('./validateNonInterActiveAuth.js', () => ({
  validateNonInteractiveAuth: vi.fn().mockResolvedValue({}),
}));

vi.mock('./nonInteractiveCli.js', () => ({
  runNonInteractive: vi.fn().mockResolvedValue(undefined),
}));

const { cleanupMockState } = vi.hoisted(() => ({
  cleanupMockState: { shouldThrow: false, called: false },
}));

// Mock sessionCleanup.js at the top level
vi.mock('./utils/sessionCleanup.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./utils/sessionCleanup.js')>();
  return {
    ...actual,
    cleanupExpiredSessions: async () => {
      cleanupMockState.called = true;
      if (cleanupMockState.shouldThrow) {
        throw new Error('Cleanup failed');
      }
    },
  };
});

describe('gemini.tsx main function cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['GEMINI_CLI_NO_RELAUNCH'] = 'true';
  });

  afterEach(() => {
    delete process.env['GEMINI_CLI_NO_RELAUNCH'];
    vi.restoreAllMocks();
  });

  it('should log error when cleanupExpiredSessions fails', async () => {
    const { loadCliConfig, parseArguments } = await import(
      './config/config.js'
    );
    const { loadSettings } = await import('./config/settings.js');
    cleanupMockState.shouldThrow = true;
    cleanupMockState.called = false;

    const debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new MockProcessExitError(code);
      });

    vi.mocked(loadSettings).mockReturnValue({
      merged: { advanced: {}, security: { auth: {} }, ui: {} },
      workspace: { settings: {} },
      setValue: vi.fn(),
      forScope: () => ({ settings: {}, originalSettings: {}, path: '' }),
      errors: [],
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.mocked(parseArguments).mockResolvedValue({
      promptInteractive: false,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(loadCliConfig).mockResolvedValue({
      isInteractive: vi.fn(() => false),
      getQuestion: vi.fn(() => 'test'),
      getSandbox: vi.fn(() => false),
      getDebugMode: vi.fn(() => false),
      getPolicyEngine: vi.fn(),
      getMessageBus: () => ({ subscribe: vi.fn() }),
      getEnableHooks: vi.fn(() => false),
      getHookSystem: () => undefined,
      initialize: vi.fn(),
      getContentGeneratorConfig: vi.fn(),
      getMcpServers: () => ({}),
      getMcpClientManager: vi.fn(),
      getIdeMode: vi.fn(() => false),
      getExperimentalZedIntegration: vi.fn(() => false),
      getScreenReader: vi.fn(() => false),
      getGeminiMdFileCount: vi.fn(() => 0),
      getProjectRoot: vi.fn(() => '/'),
      getListExtensions: vi.fn(() => false),
      getListSessions: vi.fn(() => false),
      getDeleteSession: vi.fn(() => undefined),
      getToolRegistry: vi.fn(),
      getExtensions: vi.fn(() => []),
      getModel: vi.fn(() => 'gemini-pro'),
      getEmbeddingModel: vi.fn(() => 'embedding-001'),
      getApprovalMode: vi.fn(() => 'default'),
      getCoreTools: vi.fn(() => []),
      getTelemetryEnabled: vi.fn(() => false),
      getTelemetryLogPromptsEnabled: vi.fn(() => false),
      getFileFilteringRespectGitIgnore: vi.fn(() => true),
      getOutputFormat: vi.fn(() => 'text'),
      getUsageStatisticsEnabled: vi.fn(() => false),
      setTerminalBackground: vi.fn(),
      refreshAuth: vi.fn(),
      getRemoteAdminSettings: vi.fn(() => undefined),
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    try {
      await main();
    } catch (e) {
      if (!(e instanceof MockProcessExitError)) throw e;
    }

    expect(cleanupMockState.called).toBe(true);
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      'Failed to cleanup expired sessions:',
      expect.objectContaining({ message: 'Cleanup failed' }),
    );
    expect(processExitSpy).toHaveBeenCalledWith(0); // Should not exit on cleanup failure
    processExitSpy.mockRestore();
  });
});
