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

describe('Windows PowerShell CLI UI non-blocking parsing (#30249)', () => {
  let tempDir: string;
  let fakePowerShellPath: string;
  let spawnLogPath: string;
  let getRecordedSpawnSyncCalls: () => ReadonlyArray<
    readonly unknown[]
  > = () => [];

  const getPowerShellSpawnSyncCount = (): number =>
    getRecordedSpawnSyncCalls().filter((call) => {
      const command = String(call[0] ?? '').toLowerCase();
      return command.includes('powershell') || command.includes('pwsh');
    }).length;

  const getAsyncSpawnCount = (): number => {
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
    fakePowerShellPath = path.join(tempDir, 'powershell.exe');
    spawnLogPath = path.join(tempDir, 'ps-spawns.log');
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
    fs.writeFileSync(fakePowerShellPath, helperScript, { mode: 0o755 });
  });

  afterAll(() => {
    syncBuiltinESMExports();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    fs.rmSync(spawnLogPath, { force: true });

    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const spy = vi.spyOn(childProcess, 'spawnSync');
    getRecordedSpawnSyncCalls = () => spy.mock.calls;
    syncBuiltinESMExports();

    vi.stubEnv('ComSpec', fakePowerShellPath);
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

  it('useTurnActivityMonitor never calls spawnSync during render and resolves PowerShell redirection asynchronously', async () => {
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
    expect(getAsyncSpawnCount()).toBe(0);
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
    await waitFor(() => {
      expect(getAsyncSpawnCount()).toBe(1);
    });
    expect(result.current.isRedirectionActive).toBe(false);

    // 3. Real PowerShell redirection without confirmationDetails resolves to true asynchronously
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
    await waitFor(() => {
      expect(result.current.isRedirectionActive).toBe(true);
    });
    expect(getAsyncSpawnCount()).toBe(2);
    expect(getPowerShellSpawnSyncCount()).toBe(0);
  });

  it('ToolConfirmationMessage uses precomputed confirmationDetails.hasRedirection without calling spawnSync or spawn', async () => {
    const config = createMockUiConfig();

    const quotedArrowDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'Write-Output "a -> b"',
      rootCommand: 'Write-Output',
      rootCommands: ['Write-Output'],
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
    expect(getAsyncSpawnCount()).toBe(0);
  });

  it('useExecutionLifecycle (!) Shell Mode never calls spawnSync on Windows PowerShell across normal, interactive, and ambiguous commands', async () => {
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
    expect(getAsyncSpawnCount()).toBe(0);
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
    expect(getAsyncSpawnCount()).toBe(0);
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
    expect(getAsyncSpawnCount()).toBe(1);
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
    expect(getAsyncSpawnCount()).toBe(2);
    expect(getPowerShellSpawnSyncCount()).toBe(0);
    expect(mockShellExecute).toHaveBeenCalledTimes(2);
    expect(addItemToHistory).toHaveBeenCalledWith(
      { type: 'error', text: INTERACTIVE_GEMINI_SHELL_ERROR },
      expect.any(Number),
    );

    unmount();
  });
});
