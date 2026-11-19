/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision } from './types.js';

const { execFile, spawnSync } = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile,
  spawnSync,
}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: { ...actual, platform: () => 'win32' },
    platform: () => 'win32',
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('PowerShell policy parsing lifecycle', () => {
  it('prepares unmatched YOLO children before checking their redirection', async () => {
    vi.stubEnv('ComSpec', 'powershell.exe');
    spawnSync.mockReturnValue({ status: 1 });
    const first = 'Write-Output hi';
    const second = 'Get-Content a > b';
    const command = `${first}; ${second}`;
    execFile.mockImplementation((_exe, _args, options, callback) => {
      const text = options.env['__GCLI_POWERSHELL_COMMAND__'];
      const texts = text === command ? [first, second] : [text];
      callback(
        null,
        JSON.stringify({
          success: true,
          commands: texts.map((text, index) => ({
            name: text.split(' ')[0],
            text,
            startIndex: index === 0 ? 0 : first.length + 2,
          })),
          hasRedirection: text.includes('>'),
        }),
      );
    });
    const engine = new PolicyEngine({
      approvalMode: ApprovalMode.YOLO,
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: /Write-Output/,
          decision: PolicyDecision.ALLOW,
          priority: 1,
        },
      ],
    });
    const result = await engine.check(
      { name: 'run_shell_command', args: { command } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(
      execFile.mock.calls.some(
        (call) => call[2].env['__GCLI_POWERSHELL_COMMAND__'] === second,
      ),
    ).toBe(true);
  });
  it.each([
    {
      command: 'Write-Output hi',
      redirection: false,
      substitution: false,
      expected: PolicyDecision.ALLOW,
    },
    {
      command: 'Write-Output hi > out.txt',
      redirection: false,
      substitution: false,
      expected: PolicyDecision.ASK_USER,
    },
    {
      command: 'Write-Output hi > out.txt',
      redirection: true,
      substitution: false,
      expected: PolicyDecision.ALLOW,
    },
    {
      command: 'Write-Output $(Get-Date)',
      redirection: false,
      substitution: false,
      expected: PolicyDecision.ASK_USER,
    },
    {
      command: 'Write-Output $(Get-Date)',
      redirection: false,
      substitution: true,
      expected: PolicyDecision.ALLOW,
    },
    {
      command: 'Write-Output $(',
      redirection: false,
      substitution: false,
      expected: PolicyDecision.ASK_USER,
    },
  ])(
    'preserves policy decision for $command (redirect=$redirection substitute=$substitution)',
    async ({ command, redirection, substitution, expected }) => {
      vi.stubEnv('ComSpec', 'powershell.exe');
      spawnSync.mockReturnValue({ status: 1 });
      execFile.mockImplementation((_exe, _args, options, callback) => {
        const text = options.env['__GCLI_POWERSHELL_COMMAND__'];
        callback(
          null,
          JSON.stringify({
            success: text !== 'Write-Output $(',
            commands: [
              { name: text.split(' ')[0], text, startIndex: 0, args: [] },
            ],
            hasRedirection: text.includes('>'),
            hasCommandSubstitution: text.includes('$('),
          }),
        );
      });
      const engine = new PolicyEngine({
        rules: [
          {
            toolName: 'run_shell_command',
            decision: PolicyDecision.ALLOW,
            priority: 1,
            allowRedirection: redirection,
            allowCommandSubstitution: substitution,
          },
        ],
      });
      expect(
        (
          await engine.check(
            { name: 'run_shell_command', args: { command } },
            undefined,
          )
        ).decision,
      ).toBe(expected);
      expect(spawnSync).not.toHaveBeenCalled();
    },
  );
});
