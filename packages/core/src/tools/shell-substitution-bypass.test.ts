/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';

const mockPlatform = vi.hoisted(() => vi.fn());
const mockShellExecutionService = vi.hoisted(() => vi.fn());

vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: {
    execute: mockShellExecutionService,
    background: vi.fn(),
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    default: {
      ...actualOs,
      platform: mockPlatform,
    },
    platform: mockPlatform,
  };
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  initializeShellParsers,
  stripShellWrapper,
  detectCommandSubstitution,
  hasRedirection,
} from '../utils/shell-utils.js';
import { ShellTool } from './shell.js';
import { type Config } from '../config/config.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import { buildArgsPatterns } from '../policy/utils.js';
import { SafeRegExp } from '../policy/safe-regex.js';

function createAllowShellWithoutSubstitutionEngine(): PolicyEngine {
  return new PolicyEngine({
    rules: [
      {
        toolName: 'run_shell_command',
        decision: PolicyDecision.ALLOW,
        priority: 100,
      },
    ],
    approvalMode: ApprovalMode.DEFAULT,
    defaultDecision: PolicyDecision.ASK_USER,
  });
}

function createDenyWhoamiInYoloEngine(): PolicyEngine {
  return new PolicyEngine({
    rules: [
      {
        toolName: 'run_shell_command',
        argsPattern: SafeRegExp.compile(
          buildArgsPatterns(undefined, 'whoami')[0]!,
        ),
        decision: PolicyDecision.DENY,
        priority: 500,
      },
      {
        toolName: '*',
        decision: PolicyDecision.ALLOW,
        priority: 100,
        allowRedirection: true,
        allowCommandSubstitution: true,
      },
    ],
    approvalMode: ApprovalMode.YOLO,
    defaultDecision: PolicyDecision.ALLOW,
  });
}

describe('shell wrapper and command substitution bypass prevention', () => {
  let tempRootDir: string;

  beforeAll(async () => {
    await initializeShellParsers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-bypass-repro-'));

    mockShellExecutionService.mockImplementation(() => ({
      pid: 12345,
      result: Promise.resolve({
        output: 'executed',
        rawOutput: Buffer.from('executed'),
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
        backgrounded: false,
      }),
    }));
  });

  afterEach(() => {
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  });

  function createShellTool(policyEngine: PolicyEngine): ShellTool {
    const sandboxManager = new NoopSandboxManager();
    const workspaceContext = new WorkspaceContext(tempRootDir);
    const mockConfig = {
      get config() {
        return this;
      },
      geminiClient: {
        stripThoughtsFromHistory: vi.fn(),
      },
      getAllowedTools: vi.fn().mockReturnValue([]),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue(new Set()),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue(tempRootDir),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getWorkspaceContext: vi.fn().mockReturnValue(workspaceContext),
      getPolicyEngine: vi.fn().mockReturnValue(policyEngine),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(tempRootDir),
      },
      isPathAllowed: vi.fn().mockReturnValue(true),
      validatePathAccess: vi.fn().mockReturnValue(null),
      getGeminiClient: vi.fn().mockReturnValue({}),
      getShellToolInactivityTimeout: vi.fn().mockReturnValue(1000),
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(false),
      getShellBackgroundCompletionBehavior: vi.fn().mockReturnValue('silent'),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      getSandboxEnabled: vi.fn().mockReturnValue(false),
      sanitizationConfig: {},
      sandboxManager,
      sandboxPolicyManager: {
        getCommandPermissions: vi.fn().mockReturnValue({
          fileSystem: { read: [], write: [] },
          network: false,
        }),
        getModeConfig: vi.fn().mockReturnValue({ readonly: false }),
        addPersistentApproval: vi.fn(),
        addSessionApproval: vi.fn(),
      },
    } as unknown as Config;

    return new ShellTool(mockConfig, createMockMessageBus());
  }

  describe('negative controls (direct unwrapped form is caught on HEAD)', () => {
    it('blocks direct sh -c command substitution across detector, ShellTool, and PolicyEngine', async () => {
      const cmd = "sh -c '$(whoami)'";
      const engine = createAllowShellWithoutSubstitutionEngine();
      const tool = createShellTool(engine);

      expect(detectCommandSubstitution(stripShellWrapper(cmd))).toBe(true);

      const policyResult = await engine.check(
        { name: 'run_shell_command', args: { command: cmd } },
        undefined,
      );
      expect(policyResult.decision).toBe(PolicyDecision.ASK_USER);

      const execResult = await tool.build({ command: cmd }).execute({
        abortSignal: new AbortController().signal,
      });
      expect(execResult.returnDisplay).toContain('Blocked');
      expect(mockShellExecutionService).not.toHaveBeenCalled();

      const denyEngine = createDenyWhoamiInYoloEngine();
      const denyResult = await denyEngine.check(
        { name: 'run_shell_command', args: { command: "sh -c 'whoami'" } },
        undefined,
      );
      expect(denyResult.decision).toBe(PolicyDecision.DENY);
    });
  });

  describe('ShellTool.execute() command substitution gate bypasses', () => {
    const posixBypassCases = [
      // Prefix-utility & environment-assignment wrappers
      "env sh -c '$(whoami)'",
      "/usr/bin/env sh -c '$(whoami)'",
      "env -i FOO=1 nice -n 5 timeout -k 2 10 sh -c '$(whoami)'",
      'env -S "sh -c \'$(whoami)\'"',
      'env -S"sh -c \'$(whoami)\'"',
      "busybox sh -c '$(whoami)'",
      "eval '$(whoami)'",
      'sh -c "eval \'echo \\$(whoami)\'"',
      "nice sh -c '$(whoami)'",
      "timeout 10 sh -c '$(whoami)'",
      "nohup sh -c '$(whoami)'",
      "setsid sh -c '$(whoami)'",
      "command sh -c '$(whoami)'",
      "exec -a mysh sh -c '$(whoami)'",
      "sudo -u root sh -c '$(whoami)'",
      "stdbuf -oL sh -c '$(whoami)'",
      "FOO=1 sh -c '$(whoami)'",
      // Trailing-character & compound-command shaping
      "sh -c '$(whoami)' &",
      "sh -c '$(whoami)' ;",
      "sh -c '$(whoami)' >/tmp/x",
      "sh >/tmp/x -c '$(whoami)'",
      "sh -c '$(whoami)' 2>&1",
      "sh -c '$(whoami)' # comment",
      "true && sh -c '$(whoami)'",
      "(env sh -c '$(whoami)')",
      "if true; then timeout 5 bash -lc '$(whoami)'; fi",
      // Flag, shell, POSIX $0 arg, ANSI-C, backtick, process-subst, and escaped-quote shaping
      "bash -lc '$(whoami)'",
      "bash -c -e '$(whoami)'",
      "sh -c -- '$(whoami)'",
      "sh -o errexit -c '$(whoami)'",
      "sh -e -c '$(whoami)'",
      "dash -c '$(whoami)'",
      "ksh -c '$(whoami)'",
      "'sh' -c '$(whoami)'",
      "\\sh -c '$(whoami)'",
      "sh -c '$(whoami)' _",
      "sh -c 'echo '\\''hi'\\''; $(whoami)'",
      "sh -c $'$(whoami)'",
      "sh -c $'\\x24(whoami)'",
      "env sh -c '`whoami`'",
      "env bash -c 'cat <(whoami)'",
      "env bash -c 'tee >(whoami)'",
      "pwsh -c '@(whoami)'",
    ];

    it.each(posixBypassCases)(
      'blocks unconfirmed POSIX wrapped substitution: %s',
      async (command) => {
        const engine = createAllowShellWithoutSubstitutionEngine();
        const tool = createShellTool(engine);

        const result = await tool.build({ command }).execute({
          abortSignal: new AbortController().signal,
        });

        expect(result.returnDisplay).toContain('Blocked');
        expect(mockShellExecutionService).not.toHaveBeenCalled();
      },
    );

    const encodedWhoamiSub = Buffer.from('$(whoami)', 'utf16le').toString(
      'base64',
    );
    const windowsBypassCases = [
      'cmd.exe /k \'powershell -c "$(whoami)"\'',
      'cmd.exe /d /v:on /k \'powershell -c "$(whoami)"\'',
      "pwsh -ExecutionPolicy Bypass -c '$(whoami)'",
      "pwsh -ep:Bypass -WindowStyle Hidden -c '$(whoami)'",
      "pwsh -c '$(whoami)'; echo ok",
      'powershell -Command "echo `$(whoami)"; echo ok',
      "& pwsh -c '$(whoami)'",
      `pwsh -EncodedCommand ${encodedWhoamiSub}`,
      'pwsh -c \u2018$(whoami)\u2019',
      "pwsh \u2013c '$(whoami)'",
      "bash -c '`whoami`'",
    ];

    it.each(windowsBypassCases)(
      'blocks unconfirmed Windows/PowerShell wrapped substitution: %s',
      async (command) => {
        mockPlatform.mockReturnValue('win32');
        const engine = createAllowShellWithoutSubstitutionEngine();
        const tool = createShellTool(engine);

        const result = await tool.build({ command }).execute({
          abortSignal: new AbortController().signal,
        });

        expect(result.returnDisplay).toContain('Blocked');
        expect(mockShellExecutionService).not.toHaveBeenCalled();
      },
    );
  });

  describe('PolicyEngine allowCommandSubstitution downgrade bypasses', () => {
    const policySubstitutionBypasses = [
      "env sh -c '$(whoami)'",
      "/usr/bin/env sh -c '$(whoami)'",
      'env -S "sh -c \'$(whoami)\'"',
      "nice sh -c '$(whoami)'",
      "timeout 10 sh -c '$(whoami)'",
      "nohup sh -c '$(whoami)'",
      "setsid sh -c '$(whoami)'",
      "FOO=1 sh -c '$(whoami)'",
      "bash -lc '$(whoami)'",
      "bash -c -e '$(whoami)'",
      "sh -c -- '$(whoami)'",
      "sh -e -c '$(whoami)'",
      "dash -c '$(whoami)'",
      "sh -c '$(whoami)' _",
      "sh -c 'echo '\\''hi'\\''; $(whoami)'",
      "sh -c $'\\x24(whoami)'",
      "pwsh -ExecutionPolicy Bypass -c '$(whoami)'",
    ];

    it.each(policySubstitutionBypasses)(
      'downgrades ALLOW without allowCommandSubstitution to ASK_USER: %s',
      async (command) => {
        const engine = createAllowShellWithoutSubstitutionEngine();
        const result = await engine.check(
          { name: 'run_shell_command', args: { command } },
          undefined,
        );
        expect(result.decision).toBe(PolicyDecision.ASK_USER);
      },
    );
  });

  describe('PolicyEngine DENY rule bypasses via wrapped shells', () => {
    const encodedWhoami = Buffer.from('whoami', 'utf16le').toString('base64');
    const denyBypassCases = [
      "env sh -c 'whoami'",
      'env -S "sh -c \'whoami\'"',
      'env -S"sh -c \'whoami\'"',
      "busybox sh -c 'whoami'",
      "eval 'whoami'",
      "timeout 10 sh -c 'whoami'",
      "FOO=1 sh -c 'whoami'",
      "bash -lc 'whoami'",
      "sh -c -- 'whoami'",
      "sh -c 'whoami' _",
      "sh -c $'\\x77hoami'",
      'cmd.exe /k "whoami"',
      'cmd.exe /k"whoami"',
      "pwsh -ExecutionPolicy Bypass -c 'whoami'",
      `pwsh -ec ${encodedWhoami}`,
    ];

    it.each(denyBypassCases)(
      'enforces DENY rule on wrapped inner command: %s',
      async (command) => {
        const engine = createDenyWhoamiInYoloEngine();
        const result = await engine.check(
          { name: 'run_shell_command', args: { command } },
          undefined,
        );
        expect(result.decision).toBe(PolicyDecision.DENY);
      },
    );
  });

  describe('safety invariants: no false positives, no privilege escalation, and linear performance', () => {
    it.each([
      "echo '$(not substituted)'",
      "grep '$(foo)' file.txt",
      "env FOO=1 echo '$(not substituted)'",
      "command -v sh -c '$(whoami)'",
      "env sh -c 'echo hello'",
      "bash -lc 'git status && echo ok'",
      "sh -c 'echo \"$1\"' _ '$(not_evaled)'",
      "sh -c 'echo hi' >/tmp/x",
    ])('does not false-positive on benign command: %s', (command) => {
      expect(detectCommandSubstitution(stripShellWrapper(command))).toBe(false);
    });

    it('preserves redirection detection when stripShellWrapper declines partial stripping', () => {
      const cmd = "sh -c 'echo hi' >/tmp/x";
      expect(hasRedirection(stripShellWrapper(cmd))).toBe(true);
    });

    it.each([
      "sudo sh -c 'echo hello'",
      "LD_PRELOAD=/tmp/evil.so sh -c 'echo hello'",
      "env LD_PRELOAD=/tmp/evil.so sh -c 'echo hello'",
      "timeout 10 sh -c 'echo hello'",
      "pwsh -ExecutionPolicy Bypass -c 'echo hello'",
    ])(
      'never upgrades prefix-wrapped/shaped shell command to ALLOW when only inner command is allowed: %s',
      async (command) => {
        const echoOnlyEngine = new PolicyEngine({
          rules: [
            {
              toolName: 'run_shell_command',
              argsPattern: SafeRegExp.compile(
                buildArgsPatterns(undefined, 'echo')[0]!,
              ),
              decision: PolicyDecision.ALLOW,
              priority: 100,
            },
          ],
          approvalMode: ApprovalMode.DEFAULT,
          defaultDecision: PolicyDecision.ASK_USER,
        });

        const result = await echoOnlyEngine.check(
          { name: 'run_shell_command', args: { command } },
          undefined,
        );
        expect(result.decision).toBe(PolicyDecision.ASK_USER);
      },
    );

    it('downgrades env-allowed policy when env wraps an unauthorized shell command', async () => {
      const envOnlyEngine = new PolicyEngine({
        rules: [
          {
            toolName: 'run_shell_command',
            argsPattern: SafeRegExp.compile(
              buildArgsPatterns(undefined, 'env')[0]!,
            ),
            decision: PolicyDecision.ALLOW,
            priority: 100,
          },
        ],
        approvalMode: ApprovalMode.DEFAULT,
        defaultDecision: PolicyDecision.ASK_USER,
      });

      const result = await envOnlyEngine.check(
        {
          name: 'run_shell_command',
          args: { command: "env sh -c 'rm -rf /'" },
        },
        undefined,
      );
      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });

    it('still allows wrapped substitution when PolicyEngine explicitly sets allowCommandSubstitution', async () => {
      const yoloEngine = new PolicyEngine({
        rules: [
          {
            toolName: '*',
            decision: PolicyDecision.ALLOW,
            priority: 100,
            allowRedirection: true,
            allowCommandSubstitution: true,
          },
        ],
        approvalMode: ApprovalMode.YOLO,
        defaultDecision: PolicyDecision.ALLOW,
      });
      const tool = createShellTool(yoloEngine);

      const result = await tool
        .build({ command: "env sh -c '$(echo hi)'" })
        .execute({ abortSignal: new AbortController().signal });
      expect(result.returnDisplay).not.toContain('Blocked');
      expect(mockShellExecutionService).toHaveBeenCalledTimes(1);
    });

    it('handles large adversarial wrapper-shaped inputs in linear time', () => {
      const start = performance.now();
      expect(
        detectCommandSubstitution('sh ' + '-e '.repeat(10_000) + 'echo hi'),
      ).toBe(false);
      expect(detectCommandSubstitution('env '.repeat(5_000) + 'echo hi')).toBe(
        false,
      );
      expect(detectCommandSubstitution('sh -c ' + "'a'".repeat(5_000))).toBe(
        false,
      );
      expect(performance.now() - start).toBeLessThan(1000);
    });
  });
});
