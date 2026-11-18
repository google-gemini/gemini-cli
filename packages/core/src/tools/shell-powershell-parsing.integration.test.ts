/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const mockPlatform = vi.hoisted(() => vi.fn<() => NodeJS.Platform>());

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('node:os')>();
  return {
    ...actualOs,
    default: {
      ...actualOs,
      platform: mockPlatform,
    },
    platform: mockPlatform,
  };
});

import { MessageBusType } from '../confirmation-bus/types.js';
import type {
  SerializableConfirmationDetails,
  ToolCallsUpdateMessage,
  UpdatePolicy,
} from '../confirmation-bus/types.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { SafeRegExp } from '../policy/safe-regex.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import { buildArgsPatterns } from '../policy/utils.js';
import { isStrictlyApproved } from '../sandbox/windows/commandSafety.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { CoreToolCallStatus, ROOT_SCHEDULER_ID } from '../scheduler/types.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { initializeShellParsers } from '../utils/shell-utils.js';
import { ShellTool } from './shell.js';
import { SHELL_TOOL_NAME } from './tool-names.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolConfirmationOutcome } from './tools.js';

const PIPELINE_COMMAND =
  'Get-ChildItem | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name,Length,LastWriteTime';

const FAKE_POWERSHELL_DELAY_MS = 100;
const TIMER_INTERVAL_MS = 15;

describe('PowerShell command parsing event-loop responsiveness (#30249)', () => {
  let tempDir: string;
  let powerShellExecutable: string;
  let spawnLogPath: string;

  beforeAll(async () => {
    mockPlatform.mockReturnValue(process.platform);
    await initializeShellParsers();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcli-ps-responsiveness-'));
    spawnLogPath = path.join(tempDir, 'ps-spawns.log');

    if (process.platform === 'win32') {
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
      const script = [
        `#!${process.execPath}`,
        'const fs = require("node:fs");',
        'const delayMs = Number(process.env.__GCLI_FAKE_PS_DELAY_MS ?? "100");',
        'const exitCode = Number(process.env.__GCLI_FAKE_PS_EXIT_CODE ?? "0");',
        'const logPath = process.env.__GCLI_FAKE_PS_LOG_PATH;',
        'const commandText = process.env.__GCLI_POWERSHELL_COMMAND__ ?? "";',
        'if (logPath) {',
        '  fs.appendFileSync(logPath, JSON.stringify(commandText) + "\\n");',
        '}',
        'setTimeout(() => {',
        '  if (exitCode !== 0) {',
        '    process.stderr.write("Simulated PowerShell failure\\n");',
        '    process.exit(exitCode);',
        '  }',
        '  if (!commandText.trim()) {',
        '    process.stdout.write(JSON.stringify({ success: false }) + "\\n");',
        '    process.exit(0);',
        '  }',
        '  const segments = commandText.split("|");',
        '  let searchFrom = 0;',
        '  const commands = [];',
        '  let hasRedirection = false;',
        '  for (const rawSegment of segments) {',
        '    const rawIdx = commandText.indexOf(rawSegment, searchFrom);',
        '    const trimmed = rawSegment.trim();',
        '    if (trimmed) {',
        '      const unquoted = trimmed.replace(/"[^"]*"|\'[^\']*\'/g, "");',
        '      if (/[><]/.test(unquoted)) {',
        '        hasRedirection = true;',
        '      }',
        '      const withoutRedir = trimmed.replace(/\\s*>+\\s*\\S+$/, "").trim();',
        '      const leadingWs = rawSegment.indexOf(trimmed);',
        '      const tokens = withoutRedir.split(/\\s+/);',
        '      commands.push({',
        '        name: tokens[0],',
        '        text: trimmed,',
        '        startIndex: rawIdx + leadingWs,',
        '        args: tokens.slice(1),',
        '      });',
        '    }',
        '    searchFrom = rawIdx + rawSegment.length;',
        '  }',
        '  process.stdout.write(',
        '    JSON.stringify({',
        '      success: true,',
        '      commands,',
        '      hasRedirection,',
        '      hasCommandSubstitution: commandText.includes("$(") || commandText.includes("@("),',
        '    }) + "\\n",',
        '  );',
        '  process.exit(0);',
        '}, delayMs);',
        '',
      ].join('\n');
      fs.writeFileSync(powerShellExecutable, script, { mode: 0o755 });
    }
  });

  afterAll(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    fs.rmSync(spawnLogPath, { force: true });
    mockPlatform.mockReturnValue('win32');
    vi.stubEnv('ComSpec', powerShellExecutable);
    vi.stubEnv('__GCLI_FAKE_PS_DELAY_MS', String(FAKE_POWERSHELL_DELAY_MS));
    vi.stubEnv('__GCLI_FAKE_PS_LOG_PATH', spawnLogPath);
  });

  afterEach(() => {
    mockPlatform.mockReturnValue(process.platform);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('keeps interval timers responsive and reuses cached parses while Scheduler validates a PowerShell pipeline for confirmation', async () => {
    const config = makeFakeConfig({
      interactive: true,
      usageStatisticsEnabled: false,
      targetDir: tempDir,
      cwd: tempDir,
      approvalMode: ApprovalMode.DEFAULT,
      policyEngineConfig: {
        rules: [
          {
            toolName: SHELL_TOOL_NAME,
            decision: PolicyDecision.ASK_USER,
            priority: 1.01,
            interactive: true,
          },
        ],
        defaultDecision: PolicyDecision.ASK_USER,
      },
    });

    vi.spyOn(config.geminiClient, 'getHistory').mockReturnValue([]);
    const messageBus = config.getMessageBus();
    const toolRegistry = new ToolRegistry(config, messageBus, true);
    toolRegistry.registerTool(new ShellTool(config, messageBus));
    config.toolRegistry = toolRegistry;

    const scheduler = new Scheduler({
      context: config,
      messageBus,
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    });

    let ticksWhileValidating = 0;
    let reachedAwaitingApproval = false;
    let capturedDetails: SerializableConfirmationDetails | undefined;

    const timer = setInterval(() => {
      if (!reachedAwaitingApproval) {
        ticksWhileValidating++;
      }
    }, TIMER_INTERVAL_MS);

    messageBus.subscribe<ToolCallsUpdateMessage>(
      MessageBusType.TOOL_CALLS_UPDATE,
      (event) => {
        for (const tc of event.toolCalls) {
          if (
            tc.status === CoreToolCallStatus.AwaitingApproval &&
            tc.correlationId &&
            !reachedAwaitingApproval
          ) {
            reachedAwaitingApproval = true;
            capturedDetails = tc.confirmationDetails;
            const { correlationId } = tc;
            setTimeout(() => {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId,
                confirmed: false,
                outcome: ToolConfirmationOutcome.Cancel,
              });
            }, 0);
          }
        }
      },
    );

    let completedCalls;
    try {
      completedCalls = await scheduler.schedule(
        [
          {
            callId: 'call-ps-pipeline-1',
            name: SHELL_TOOL_NAME,
            args: { command: PIPELINE_COMMAND },
            isClientInitiated: false,
            prompt_id: 'prompt-ps-pipeline-1',
          },
        ],
        new AbortController().signal,
      );
    } finally {
      clearInterval(timer);
      scheduler.dispose();
    }

    expect(completedCalls[0]?.response.error).toBeUndefined();
    expect(reachedAwaitingApproval).toBe(true);
    expect(capturedDetails?.type).toBe('exec');
    if (capturedDetails?.type === 'exec') {
      expect(capturedDetails.rootCommands).toEqual([
        'Get-ChildItem',
        'Sort-Object',
        'Select-Object',
      ]);
      expect(capturedDetails.rootCommand).toBe(
        'Get-ChildItem, Sort-Object, Select-Object',
      );
      expect(capturedDetails.hasRedirection).toBe(false);
    }

    expect(ticksWhileValidating).toBeGreaterThanOrEqual(2);

    if (process.platform !== 'win32') {
      const loggedSpawns = fs
        .readFileSync(spawnLogPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean);
      // 1 full pipeline parse + 3 unique segment parses (reused across MessageBus, taint checks, and confirmation details)
      expect(loggedSpawns).toHaveLength(4);
    }
  });

  it('keeps interval timers responsive across ProceedAlways policy update and full ShellTool execution', async () => {
    const config = makeFakeConfig({
      interactive: true,
      usageStatisticsEnabled: false,
      targetDir: tempDir,
      cwd: tempDir,
      approvalMode: ApprovalMode.DEFAULT,
      policyEngineConfig: {
        rules: [
          {
            toolName: SHELL_TOOL_NAME,
            decision: PolicyDecision.ASK_USER,
            priority: 1.01,
            interactive: true,
          },
        ],
        defaultDecision: PolicyDecision.ASK_USER,
      },
    });

    vi.spyOn(config.geminiClient, 'getHistory').mockReturnValue([]);
    vi.spyOn(ShellExecutionService, 'execute').mockResolvedValue({
      pid: 9999,
      result: Promise.resolve({
        rawOutput: Buffer.from('file1.txt\n'),
        output: 'file1.txt\n',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 9999,
        executionMethod: 'child_process',
      }),
    });

    const messageBus = config.getMessageBus();
    const policyUpdates: UpdatePolicy[] = [];
    messageBus.subscribe<UpdatePolicy>(MessageBusType.UPDATE_POLICY, (msg) => {
      policyUpdates.push(msg);
    });

    const toolRegistry = new ToolRegistry(config, messageBus, true);
    toolRegistry.registerTool(new ShellTool(config, messageBus));
    config.toolRegistry = toolRegistry;

    const scheduler = new Scheduler({
      context: config,
      messageBus,
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    });

    let totalTicks = 0;
    const timer = setInterval(() => {
      totalTicks++;
    }, TIMER_INTERVAL_MS);

    messageBus.subscribe<ToolCallsUpdateMessage>(
      MessageBusType.TOOL_CALLS_UPDATE,
      (event) => {
        for (const tc of event.toolCalls) {
          if (
            tc.status === CoreToolCallStatus.AwaitingApproval &&
            tc.correlationId
          ) {
            const { correlationId } = tc;
            setTimeout(() => {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId,
                confirmed: true,
                outcome: ToolConfirmationOutcome.ProceedAlways,
              });
            }, 0);
          }
        }
      },
    );

    let completedCalls;
    try {
      completedCalls = await scheduler.schedule(
        [
          {
            callId: 'call-ps-exec-1',
            name: SHELL_TOOL_NAME,
            args: { command: PIPELINE_COMMAND },
            isClientInitiated: false,
            prompt_id: 'prompt-ps-exec-1',
          },
        ],
        new AbortController().signal,
      );
    } finally {
      clearInterval(timer);
      scheduler.dispose();
    }

    expect(completedCalls[0]?.status).toBe(CoreToolCallStatus.Success);
    expect(policyUpdates).toHaveLength(1);
    expect(policyUpdates[0]?.commandPrefix).toEqual([
      'Get-ChildItem',
      'Sort-Object',
      'Select-Object',
    ]);
    expect(totalTicks).toBeGreaterThanOrEqual(2);

    if (process.platform !== 'win32') {
      const loggedSpawns = fs
        .readFileSync(spawnLogPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean);
      // Zero extra parser spawns during ProceedAlways policy update or pre/post execution checks
      expect(loggedSpawns).toHaveLength(4);
    }
  });

  it('keeps interval timers responsive during PolicyEngine.check on allowed, redirected, and quoted-arrow PowerShell commands', async () => {
    const patterns = buildArgsPatterns(undefined, [
      'Get-ChildItem',
      'Sort-Object',
      'Select-Object',
      'Write-Output',
    ]);
    const rules = patterns
      .filter((pattern): pattern is string => pattern !== undefined)
      .map((pattern) => ({
        toolName: SHELL_TOOL_NAME,
        decision: PolicyDecision.ALLOW,
        argsPattern: SafeRegExp.compile(pattern),
        priority: 10,
      }));

    const policyEngine = new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.DEFAULT,
      defaultDecision: PolicyDecision.ASK_USER,
    });

    let ticksDuringPolicyChecks = 0;
    const timer = setInterval(() => {
      ticksDuringPolicyChecks++;
    }, TIMER_INTERVAL_MS);

    try {
      const pipelineRes = await policyEngine.check(
        { name: SHELL_TOOL_NAME, args: { command: PIPELINE_COMMAND } },
        undefined,
      );
      expect(pipelineRes.decision).toBe(PolicyDecision.ALLOW);

      const redirectedRes = await policyEngine.check(
        {
          name: SHELL_TOOL_NAME,
          args: { command: 'Get-ChildItem > out.txt' },
        },
        undefined,
      );
      expect(redirectedRes.decision).toBe(PolicyDecision.ASK_USER);

      const quotedArrowRes = await policyEngine.check(
        {
          name: SHELL_TOOL_NAME,
          args: { command: 'Write-Output "a -> b"' },
        },
        undefined,
      );
      expect(quotedArrowRes.decision).toBe(PolicyDecision.ALLOW);
    } finally {
      clearInterval(timer);
    }

    expect(ticksDuringPolicyChecks).toBeGreaterThanOrEqual(4);
  });

  it('keeps interval timers responsive during Windows sandbox isStrictlyApproved check', async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, TIMER_INTERVAL_MS);

    let approved = false;
    try {
      approved = await isStrictlyApproved(
        'powershell.exe',
        ['-NoProfile', '-Command', 'Get-ChildItem | Get-Content'],
        ['Get-ChildItem', 'Get-Content'],
        tempDir,
        tempDir,
      );
    } finally {
      clearInterval(timer);
    }

    expect(approved).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it('populates confirmationDetails.hasRedirection accurately for redirected and quoted-arrow commands without blocking timers', async () => {
    const config = makeFakeConfig({
      interactive: true,
      usageStatisticsEnabled: false,
      targetDir: tempDir,
      cwd: tempDir,
      approvalMode: ApprovalMode.DEFAULT,
      policyEngineConfig: {
        rules: [
          {
            toolName: SHELL_TOOL_NAME,
            decision: PolicyDecision.ASK_USER,
            priority: 1.01,
            interactive: true,
          },
        ],
        defaultDecision: PolicyDecision.ASK_USER,
      },
    });

    vi.spyOn(config.geminiClient, 'getHistory').mockReturnValue([]);
    const messageBus = config.getMessageBus();
    const toolRegistry = new ToolRegistry(config, messageBus, true);
    toolRegistry.registerTool(new ShellTool(config, messageBus));
    config.toolRegistry = toolRegistry;

    const scheduler = new Scheduler({
      context: config,
      messageBus,
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    });

    const seenConfirmations = new Map<
      string,
      SerializableConfirmationDetails
    >();
    const respondedCorrelations = new Set<string>();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, TIMER_INTERVAL_MS);

    messageBus.subscribe<ToolCallsUpdateMessage>(
      MessageBusType.TOOL_CALLS_UPDATE,
      (event) => {
        for (const tc of event.toolCalls) {
          if (
            tc.status === CoreToolCallStatus.AwaitingApproval &&
            tc.correlationId &&
            tc.confirmationDetails &&
            !respondedCorrelations.has(tc.correlationId)
          ) {
            respondedCorrelations.add(tc.correlationId);
            seenConfirmations.set(tc.request.callId, tc.confirmationDetails);
            const { correlationId } = tc;
            setTimeout(() => {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId,
                confirmed: false,
                outcome: ToolConfirmationOutcome.Cancel,
              });
            }, 0);
          }
        }
      },
    );

    try {
      await scheduler.schedule(
        [
          {
            callId: 'call-redir',
            name: SHELL_TOOL_NAME,
            args: { command: 'Get-ChildItem > out.txt' },
            isClientInitiated: false,
            prompt_id: 'prompt-redir',
          },
          {
            callId: 'call-quoted-arrow',
            name: SHELL_TOOL_NAME,
            args: { command: 'Write-Output "a -> b"' },
            isClientInitiated: false,
            prompt_id: 'prompt-redir',
          },
        ],
        new AbortController().signal,
      );
    } finally {
      clearInterval(timer);
      scheduler.dispose();
    }

    const redirDetails = seenConfirmations.get('call-redir');
    const quotedDetails = seenConfirmations.get('call-quoted-arrow');
    expect(redirDetails?.type).toBe('exec');
    expect(quotedDetails?.type).toBe('exec');
    if (redirDetails?.type === 'exec') {
      expect(redirDetails.hasRedirection).toBe(true);
    }
    if (quotedDetails?.type === 'exec') {
      expect(quotedDetails.hasRedirection).toBe(false);
    }
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it('caches failed PowerShell exits within an invocation so ProceedAlways does not respawn repeatedly or block timers', async () => {
    if (process.platform === 'win32') {
      return;
    }
    vi.stubEnv('__GCLI_FAKE_PS_EXIT_CODE', '1');

    const config = makeFakeConfig({
      interactive: true,
      usageStatisticsEnabled: false,
      targetDir: tempDir,
      cwd: tempDir,
      approvalMode: ApprovalMode.DEFAULT,
      policyEngineConfig: {
        rules: [
          {
            toolName: SHELL_TOOL_NAME,
            decision: PolicyDecision.ASK_USER,
            priority: 1.01,
            interactive: true,
          },
        ],
        defaultDecision: PolicyDecision.ASK_USER,
      },
    });

    vi.spyOn(config.geminiClient, 'getHistory').mockReturnValue([]);
    vi.spyOn(ShellExecutionService, 'execute').mockResolvedValue({
      pid: 9998,
      result: Promise.resolve({
        rawOutput: Buffer.from('ok\n'),
        output: 'ok\n',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 9998,
        executionMethod: 'child_process',
      }),
    });

    const messageBus = config.getMessageBus();
    const toolRegistry = new ToolRegistry(config, messageBus, true);
    toolRegistry.registerTool(new ShellTool(config, messageBus));
    config.toolRegistry = toolRegistry;

    const scheduler = new Scheduler({
      context: config,
      messageBus,
      getPreferredEditor: () => undefined,
      schedulerId: ROOT_SCHEDULER_ID,
    });

    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, TIMER_INTERVAL_MS);

    messageBus.subscribe<ToolCallsUpdateMessage>(
      MessageBusType.TOOL_CALLS_UPDATE,
      (event) => {
        for (const tc of event.toolCalls) {
          if (
            tc.status === CoreToolCallStatus.AwaitingApproval &&
            tc.correlationId
          ) {
            const { correlationId } = tc;
            setTimeout(() => {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId,
                confirmed: true,
                outcome: ToolConfirmationOutcome.ProceedAlways,
              });
            }, 0);
          }
        }
      },
    );

    try {
      const completed = await scheduler.schedule(
        [
          {
            callId: 'call-ps-fail-1',
            name: SHELL_TOOL_NAME,
            args: { command: 'git status && echo ok' },
            isClientInitiated: false,
            prompt_id: 'prompt-ps-fail-1',
          },
        ],
        new AbortController().signal,
      );
      expect(completed[0]?.status).toBe(CoreToolCallStatus.Success);
    } finally {
      clearInterval(timer);
      scheduler.dispose();
    }

    expect(ticks).toBeGreaterThanOrEqual(2);
    const loggedSpawns = fs
      .readFileSync(spawnLogPath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    // Cached null ensures each unique command string (1 compound + 2 fallback sub-commands)
    // is spawned only once across policy, confirmation, ProceedAlways, and execution.
    expect(loggedSpawns).toEqual([
      JSON.stringify('git status && echo ok'),
      JSON.stringify('git status'),
      JSON.stringify('echo ok'),
    ]);
  });
});
