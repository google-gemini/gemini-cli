/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { act } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mockShellExecute = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    ShellExecutionService: {
      execute: mockShellExecute,
      kill: vi.fn(),
      background: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      onExit: vi.fn(() => vi.fn()),
    },
  };
});

import {
  ApprovalMode,
  CoreToolCallStatus,
  INTERACTIVE_GEMINI_SHELL_ERROR,
  NoopSandboxManager,
  initializeShellParsers,
  type Config,
  type GeminiClient,
  type SerializableConfirmationDetails,
} from '@google/gemini-cli-core';
import { waitFor } from '../../test-utils/async.js';
import {
  render,
  renderHook,
  renderWithProviders,
} from '../../test-utils/render.js';
import { ToolConfirmationMessage } from '../components/messages/ToolConfirmationMessage.js';
import { StreamingState } from '../types.js';
import { useExecutionLifecycle } from './useExecutionLifecycle.js';
import {
  useTurnActivityMonitor,
  type MinimalTrackedToolCall,
} from './useTurnActivityMonitor.js';

function createMockUiConfig(approvalMode: ApprovalMode = ApprovalMode.DEFAULT) {
  const candidate: unknown = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getDisableAlwaysAllow: () => false,
    getApprovalMode: () => approvalMode,
    getTargetDir: () => 'C:\\workspace',
    getEnableInteractiveShell: () => false,
    getSessionId: () => 'win-ps-ui-session',
    getShellExecutionConfig: () => ({
      terminalHeight: 24,
      terminalWidth: 100,
      sandboxManager: new NoopSandboxManager(),
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
    }),
  };
  return candidate as Config;
}

const ASYNC_POWERSHELL_WAIT_TIMEOUT_MS = 15_000;
const REAL_POWERSHELL_TEST_TIMEOUT_MS = 30_000;

describe('Windows PowerShell CLI UI non-blocking parsing (#30249)', () => {
  const originalSpawn = childProcess.spawn.bind(childProcess);
  let tempDir: string;
  let powerShellExecutable: string;
  let spawnLogPath: string;
  let startedAsyncSpawnCount = 0;
  let completedAsyncSpawnCount = 0;
  let getRecordedSpawnSyncCalls: () => ReadonlyArray<
    readonly unknown[]
  > = () => [];

  const getPowerShellSpawnSyncCount = (): number =>
    getRecordedSpawnSyncCalls().filter((call) => {
      const command = String(call[0] ?? '').toLowerCase();
      return command.includes('powershell') || command.includes('pwsh');
    }).length;

  const getStartedAsyncSpawnCount = (): number => startedAsyncSpawnCount;
  const getCompletedAsyncSpawnCount = (): number => completedAsyncSpawnCount;

  const getLoggedAsyncSpawnCount = (): number => {
    if (!fs.existsSync(spawnLogPath)) {
      return 0;
    }
    return fs
      .readFileSync(spawnLogPath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean).length;
  };

  beforeAll(async () => {
    await initializeShellParsers();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcli-cli-ps-ui-'));
    spawnLogPath = path.join(tempDir, 'ps-spawns.log');

    if (process.platform === 'win32') {
      // Windows CreateProcessW cannot execute Unix `#!` shebang scripts named `.exe`.
      // Use the real Windows PowerShell executable so the test exercises real AST parsing.
      const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
      const winPsPath = path.win32.join(
        systemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      );
      powerShellExecutable = fs.existsSync(winPsPath)
        ? winPsPath
        : 'powershell.exe';
    } else {
      powerShellExecutable = path.join(tempDir, 'powershell.exe');
      const helperScript = [
        `#!${process.execPath}`,
        'const fs = require("node:fs");',
        'const logPath = process.env.__GCLI_UI_PS_LOG_PATH;',
        'const cmd = process.env.__GCLI_POWERSHELL_COMMAND__ ?? "";',
        'if (logPath) {',
        '  fs.appendFileSync(logPath, JSON.stringify(cmd) + "\\n");',
        '}',
        'setTimeout(() => {',
        '  if (!cmd.trim()) {',
        '    process.stdout.write(JSON.stringify({ success: false }) + "\\n");',
        '    process.exit(0);',
        '  }',
        '  const unquoted = cmd.replace(/"[^"]*"|\'[^\']*\'/g, "");',
        '  const hasRedirection = /[><]/.test(unquoted);',
        '  const commands = [];',
        '  if (cmd.includes("ForEach-Object { gemini }")) {',
        '    commands.push({ name: "Get-Item", text: "Get-Item foo", startIndex: 0, args: ["foo"] });',
        '    commands.push({ name: "gemini", text: "gemini", startIndex: 29, args: [] });',
        '  } else {',
        '    const withoutRedir = cmd.replace(/\\s*>+\\s*\\S+$/, "").trim();',
        '    const tokens = withoutRedir.split(/\\s+/);',
        '    commands.push({ name: tokens[0] ?? "", text: cmd, startIndex: 0, args: tokens.slice(1) });',
        '  }',
        '  process.stdout.write(JSON.stringify({',
        '    success: true,',
        '    commands,',
        '    hasRedirection,',
        '    hasCommandSubstitution: false,',
        '  }) + "\\n");',
        '  process.exit(0);',
        '}, 25);',
        '',
      ].join('\n');
      fs.writeFileSync(powerShellExecutable, helperScript, { mode: 0o755 });
    }
  });

  afterAll(() => {
    syncBuiltinESMExports();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    fs.rmSync(spawnLogPath, { force: true });
    startedAsyncSpawnCount = 0;
    completedAsyncSpawnCount = 0;

    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const spawnSyncSpy = vi.spyOn(childProcess, 'spawnSync');
    getRecordedSpawnSyncCalls = () => spawnSyncSpy.mock.calls;
    vi.spyOn(childProcess, 'spawn').mockImplementation(
      (command, args, options) => {
        const child = originalSpawn(command, args, options);
        const lowerCommand = command.toLowerCase();
        if (
          (lowerCommand.includes('powershell') ||
            lowerCommand.includes('pwsh')) &&
          Array.isArray(args) &&
          args.includes('-EncodedCommand')
        ) {
          startedAsyncSpawnCount += 1;
          child.once('close', (code) => {
            if (code === 0) {
              completedAsyncSpawnCount += 1;
            }
          });
        }
        return child;
      },
    );
    syncBuiltinESMExports();

    vi.stubEnv('ComSpec', powerShellExecutable);
    vi.stubEnv('__GCLI_UI_PS_LOG_PATH', spawnLogPath);
    mockShellExecute.mockReset();
    mockShellExecute.mockResolvedValue({
      pid: 4242,
      result: Promise.resolve({
        rawOutput: Buffer.from('ok'),
        output: 'ok',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 4242,
        executionMethod: 'child_process',
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    vi.unstubAllEnvs();
  });

  it(
    'useTurnActivityMonitor never calls spawnSync during render and resolves PowerShell redirection asynchronously',
    async () => {
      const { result, rerender } = await renderHook(
        ({ state, calls }) => useTurnActivityMonitor(state, 'pty-1', calls),
        {
          initialProps: {
            state: StreamingState.Responding,
            calls: [] as MinimalTrackedToolCall[],
          },
        },
      );

      // 1. Precomputed confirmationDetails.hasRedirection resolves synchronously with zero spawns
      rerender({
        state: StreamingState.Responding,
        calls: [
          {
            status: CoreToolCallStatus.AwaitingApproval,
            request: {
              callId: 'call-precomputed',
              name: 'run_shell_command',
              args: { command: 'Get-ChildItem > precomputed.txt' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
            confirmationDetails: {
              type: 'exec',
              title: 'Confirm Shell Command',
              command: 'Get-ChildItem > precomputed.txt',
              rootCommand: 'Get-ChildItem',
              rootCommands: ['Get-ChildItem'],
              hasRedirection: true,
            },
          },
        ],
      });
      expect(result.current.isRedirectionActive).toBe(true);
      expect(getStartedAsyncSpawnCount()).toBe(0);
      expect(getCompletedAsyncSpawnCount()).toBe(0);
      expect(getPowerShellSpawnSyncCount()).toBe(0);

      // 2. Quoted arrow without confirmationDetails uses async spawn (0 spawnSync) and stays false
      rerender({
        state: StreamingState.Responding,
        calls: [
          {
            status: CoreToolCallStatus.Executing,
            request: {
              callId: 'call-quoted',
              name: 'run_shell_command',
              args: { command: 'Write-Output "a -> b"' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
          },
        ],
      });
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      await waitFor(
        () => {
          expect(getCompletedAsyncSpawnCount()).toBe(1);
        },
        { timeout: ASYNC_POWERSHELL_WAIT_TIMEOUT_MS },
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(getStartedAsyncSpawnCount()).toBe(1);
      if (process.platform !== 'win32') {
        expect(getLoggedAsyncSpawnCount()).toBe(1);
      }
      expect(result.current.isRedirectionActive).toBe(false);

      // 3. Real PowerShell redirection still resolves even if pendingToolCalls updates (Validating -> Executing) while in-flight
      rerender({
        state: StreamingState.Responding,
        calls: [
          {
            status: CoreToolCallStatus.Validating,
            request: {
              callId: 'call-redir',
              name: 'run_shell_command',
              args: { command: 'Get-ChildItem > out.txt' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
          },
        ],
      });
      // Trigger an intermediate pendingToolCalls update before the async PowerShell parse finishes
      rerender({
        state: StreamingState.Responding,
        calls: [
          {
            status: CoreToolCallStatus.Executing,
            request: {
              callId: 'call-redir',
              name: 'run_shell_command',
              args: { command: 'Get-ChildItem > out.txt' },
              isClientInitiated: false,
              prompt_id: 'p1',
            },
          },
        ],
      });
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      await waitFor(
        () => {
          expect(result.current.isRedirectionActive).toBe(true);
        },
        { timeout: ASYNC_POWERSHELL_WAIT_TIMEOUT_MS },
      );
      expect(getStartedAsyncSpawnCount()).toBe(2);
      expect(getCompletedAsyncSpawnCount()).toBe(2);
      if (process.platform !== 'win32') {
        expect(getLoggedAsyncSpawnCount()).toBe(2);
      }
      expect(getPowerShellSpawnSyncCount()).toBe(0);
    },
    REAL_POWERSHELL_TEST_TIMEOUT_MS,
  );

  it('ToolConfirmationMessage uses precomputed confirmationDetails.hasRedirection (including multi-command details) without calling spawnSync or spawn', async () => {
    const config = createMockUiConfig();

    const quotedArrowDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'Get-ChildItem; Write-Output "a -> b"',
      commands: ['Get-ChildItem', 'Write-Output "a -> b"'],
      rootCommand: 'Get-ChildItem, Write-Output',
      rootCommands: ['Get-ChildItem', 'Write-Output'],
      hasRedirection: false,
    };

    const firstRender = await renderWithProviders(
      <ToolConfirmationMessage
        callId="call-quoted-arrow"
        confirmationDetails={quotedArrowDetails}
        config={config}
        getPreferredEditor={() => undefined}
        availableTerminalHeight={30}
        terminalWidth={100}
        toolName="run_shell_command"
      />,
    );
    expect(firstRender.lastFrame()).not.toContain('Redirection detected.');
    firstRender.unmount();

    const redirectedDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'Get-ChildItem > out.txt',
      rootCommand: 'Get-ChildItem',
      rootCommands: ['Get-ChildItem'],
      hasRedirection: true,
    };

    const secondRender = await renderWithProviders(
      <ToolConfirmationMessage
        callId="call-redirected"
        confirmationDetails={redirectedDetails}
        config={config}
        getPreferredEditor={() => undefined}
        availableTerminalHeight={30}
        terminalWidth={100}
        toolName="run_shell_command"
      />,
    );
    expect(secondRender.lastFrame()).toContain('Redirection detected.');
    secondRender.unmount();

    expect(getPowerShellSpawnSyncCount()).toBe(0);
    expect(getStartedAsyncSpawnCount()).toBe(0);
    expect(getCompletedAsyncSpawnCount()).toBe(0);
    if (process.platform !== 'win32') {
      expect(getLoggedAsyncSpawnCount()).toBe(0);
    }
  });

  it(
    'useExecutionLifecycle (!) Shell Mode never calls spawnSync on Windows PowerShell across normal, interactive, and ambiguous commands',
    async () => {
      const addItemToHistory = vi.fn();
      const setPendingHistoryItem = vi.fn();
      const execPromises: Array<Promise<void>> = [];
      const onExec = vi.fn((promise: Promise<void>) => {
        execPromises.push(promise);
      });
      const onDebugMessage = vi.fn();
      const setShellInputFocused = vi.fn();
      const config = createMockUiConfig();
      const geminiClientCandidate: unknown = { addHistory: vi.fn() };
      const geminiClient = geminiClientCandidate as GeminiClient;

      let lifecycleApi!: ReturnType<typeof useExecutionLifecycle>;
      function Harness() {
        lifecycleApi = useExecutionLifecycle(
          addItemToHistory,
          setPendingHistoryItem,
          onExec,
          onDebugMessage,
          config,
          geminiClient,
          setShellInputFocused,
        );
        return null;
      }

      const { unmount } = await render(<Harness />);

      // Case A: Non-gemini command (`! Get-ChildItem`) -> 0 spawns, executes directly
      await act(async () => {
        lifecycleApi.handleShellCommand(
          'Get-ChildItem',
          new AbortController().signal,
        );
        await Promise.all(execPromises);
      });
      expect(mockShellExecute).toHaveBeenCalledTimes(1);
      expect(getStartedAsyncSpawnCount()).toBe(0);
      expect(getCompletedAsyncSpawnCount()).toBe(0);
      expect(getPowerShellSpawnSyncCount()).toBe(0);

      // Case B: Obvious interactive gemini command -> blocked synchronously with 0 spawns
      execPromises.length = 0;
      act(() => {
        lifecycleApi.handleShellCommand(
          'gemini config set default-model gemini-2.5 -y',
          new AbortController().signal,
        );
      });
      expect(execPromises).toHaveLength(0);
      expect(addItemToHistory).toHaveBeenCalledWith(
        { type: 'error', text: INTERACTIVE_GEMINI_SHELL_ERROR },
        expect.any(Number),
      );
      expect(getStartedAsyncSpawnCount()).toBe(0);
      expect(getCompletedAsyncSpawnCount()).toBe(0);
      expect(getPowerShellSpawnSyncCount()).toBe(0);

      // Case C: Ambiguous command containing "gemini" (`Get-Content GEMINI.md`) -> async spawn, 0 spawnSync, allowed
      execPromises.length = 0;
      await act(async () => {
        lifecycleApi.handleShellCommand(
          'Get-Content GEMINI.md',
          new AbortController().signal,
        );
        await Promise.all(execPromises);
      });
      expect(getStartedAsyncSpawnCount()).toBe(1);
      expect(getCompletedAsyncSpawnCount()).toBe(1);
      if (process.platform !== 'win32') {
        expect(getLoggedAsyncSpawnCount()).toBe(1);
      }
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      expect(mockShellExecute).toHaveBeenCalledTimes(2);

      // Case D: PowerShell scriptblock invoking interactive gemini -> async spawn, 0 spawnSync, blocked before PTY
      addItemToHistory.mockClear();
      execPromises.length = 0;
      await act(async () => {
        lifecycleApi.handleShellCommand(
          'Get-Item foo | ForEach-Object { gemini }',
          new AbortController().signal,
        );
        await Promise.all(execPromises);
      });
      expect(getStartedAsyncSpawnCount()).toBe(2);
      expect(getCompletedAsyncSpawnCount()).toBe(2);
      if (process.platform !== 'win32') {
        expect(getLoggedAsyncSpawnCount()).toBe(2);
      }
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      expect(mockShellExecute).toHaveBeenCalledTimes(2);
      expect(addItemToHistory).toHaveBeenCalledWith(
        { type: 'error', text: INTERACTIVE_GEMINI_SHELL_ERROR },
        expect.any(Number),
      );

      // Case E: Pre-aborted signal on ambiguous recursive gemini command -> 0 extra spawns, never executes PTY
      addItemToHistory.mockClear();
      setPendingHistoryItem.mockClear();
      setShellInputFocused.mockClear();
      execPromises.length = 0;
      const preAborted = new AbortController();
      preAborted.abort();
      await act(async () => {
        lifecycleApi.handleShellCommand(
          'Get-Item foo | ForEach-Object { gemini }',
          preAborted.signal,
        );
        await Promise.all(execPromises);
      });
      expect(getStartedAsyncSpawnCount()).toBe(2);
      expect(getCompletedAsyncSpawnCount()).toBe(2);
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      expect(mockShellExecute).toHaveBeenCalledTimes(2);
      expect(setPendingHistoryItem).toHaveBeenCalledWith(null);
      expect(setShellInputFocused).toHaveBeenCalledWith(false);
      expect(addItemToHistory).not.toHaveBeenCalledWith(
        { type: 'error', text: INTERACTIVE_GEMINI_SHELL_ERROR },
        expect.any(Number),
      );

      // Case F: Aborted mid-parse on ambiguous recursive gemini command -> parser aborted, PTY never spawned
      addItemToHistory.mockClear();
      setPendingHistoryItem.mockClear();
      setShellInputFocused.mockClear();
      execPromises.length = 0;
      const inFlightAbort = new AbortController();
      await act(async () => {
        lifecycleApi.handleShellCommand(
          'Get-Item foo | ForEach-Object { gemini }',
          inFlightAbort.signal,
        );
        expect(getStartedAsyncSpawnCount()).toBe(3);
        inFlightAbort.abort();
        await Promise.all(execPromises);
      });
      expect(getPowerShellSpawnSyncCount()).toBe(0);
      expect(mockShellExecute).toHaveBeenCalledTimes(2);
      expect(setPendingHistoryItem).toHaveBeenCalledWith(null);
      expect(setShellInputFocused).toHaveBeenCalledWith(false);
      expect(addItemToHistory).not.toHaveBeenCalledWith(
        { type: 'error', text: INTERACTIVE_GEMINI_SHELL_ERROR },
        expect.any(Number),
      );

      unmount();
    },
    REAL_POWERSHELL_TEST_TIMEOUT_MS,
  );
});
