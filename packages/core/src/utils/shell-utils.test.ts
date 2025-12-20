/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  expect,
  describe,
  it,
  beforeEach,
  beforeAll,
  vi,
  afterEach,
} from 'vitest';
import {
  escapeShellArg,
  getCommandRoots,
  getShellConfiguration,
  initializeShellParsers,
  stripShellWrapper,
} from './shell-utils.js';

const mockPlatform = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn());
const mockSpawnSync = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  default: {
    platform: mockPlatform,
    homedir: mockHomedir,
  },
  platform: mockPlatform,
  homedir: mockHomedir,
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    spawnSync: mockSpawnSync,
  };
});

const mockQuote = vi.hoisted(() => vi.fn());
vi.mock('shell-quote', () => ({
  quote: mockQuote,
}));

const isWindowsRuntime = process.platform === 'win32';
const describeWindowsOnly = isWindowsRuntime ? describe : describe.skip;

beforeAll(async () => {
  mockPlatform.mockReturnValue('linux');
  await initializeShellParsers();
});

beforeEach(() => {
  mockPlatform.mockReturnValue('linux');
  mockQuote.mockImplementation((args: string[]) =>
    args.map((arg) => `'${arg}'`).join(' '),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getCommandRoots', () => {
  it('should return a single command', () => {
    expect(getCommandRoots('ls -l')).toEqual(['ls']);
  });

  it('should handle paths and return the binary name', () => {
    expect(getCommandRoots('/usr/local/bin/node script.js')).toEqual(['node']);
  });

  it('should return an empty array for an empty string', () => {
    expect(getCommandRoots('')).toEqual([]);
  });

  it('should handle a mix of operators', () => {
    const result = getCommandRoots('a;b|c&&d||e&f');
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('should correctly parse a chained command with quotes', () => {
    const result = getCommandRoots('echo "hello" && git commit -m "feat"');
    expect(result).toEqual(['echo', 'git']);
  });

  it('should include nested command substitutions', () => {
    const result = getCommandRoots('echo $(badCommand --danger)');
    expect(result).toEqual(['echo', 'badCommand']);
  });

  it('should include process substitutions', () => {
    const result = getCommandRoots('diff <(ls) <(ls -a)');
    expect(result).toEqual(['diff', 'ls', 'ls']);
  });

  it('should include backtick substitutions', () => {
    const result = getCommandRoots('echo `badCommand --danger`');
    expect(result).toEqual(['echo', 'badCommand']);
  });

  it('should treat parameter expansions with prompt transformations as unsafe', () => {
    const roots = getCommandRoots(
      'echo "${var1=aa\\140 env| ls -l\\140}${var1@P}"',
    );
    expect(roots).toEqual([]);
  });

  it('should not return roots for prompt transformation expansions', () => {
    const roots = getCommandRoots('echo ${foo@P}');
    expect(roots).toEqual([]);
  });
});

describeWindowsOnly('PowerShell integration', () => {
  const originalComSpec = process.env['ComSpec'];

  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    const systemRoot = process.env['SystemRoot'] || 'C:\\\\Windows';
    process.env['ComSpec'] =
      `${systemRoot}\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe`;
  });

  afterEach(() => {
    if (originalComSpec === undefined) {
      delete process.env['ComSpec'];
    } else {
      process.env['ComSpec'] = originalComSpec;
    }
  });

  it('should return command roots using PowerShell AST output', () => {
    const roots = getCommandRoots('Get-ChildItem | Select-Object Name');
    expect(roots.length).toBeGreaterThan(0);
    expect(roots).toContain('Get-ChildItem');
  });
});

describe('stripShellWrapper', () => {
  it('should strip sh -c with quotes', () => {
    expect(stripShellWrapper('sh -c "ls -l"')).toEqual('ls -l');
  });

  it('should strip bash -c with extra whitespace', () => {
    expect(stripShellWrapper('  bash  -c  "ls -l"  ')).toEqual('ls -l');
  });

  it('should strip zsh -c without quotes', () => {
    expect(stripShellWrapper('zsh -c ls -l')).toEqual('ls -l');
  });

  it('should strip cmd.exe /c', () => {
    expect(stripShellWrapper('cmd.exe /c "dir"')).toEqual('dir');
  });

  it('should strip powershell.exe -Command with optional -NoProfile', () => {
    expect(
      stripShellWrapper('powershell.exe -NoProfile -Command "Get-ChildItem"'),
    ).toEqual('Get-ChildItem');
    expect(
      stripShellWrapper('powershell.exe -Command "Get-ChildItem"'),
    ).toEqual('Get-ChildItem');
  });

  it('should strip pwsh -Command wrapper', () => {
    expect(
      stripShellWrapper('pwsh -NoProfile -Command "Get-ChildItem"'),
    ).toEqual('Get-ChildItem');
  });

  it('should not strip anything if no wrapper is present', () => {
    expect(stripShellWrapper('ls -l')).toEqual('ls -l');
  });
});

describe('escapeShellArg', () => {
  describe('POSIX (bash)', () => {
    it('should use shell-quote for escaping', () => {
      mockQuote.mockReturnValueOnce("'escaped value'");
      const result = escapeShellArg('raw value', 'bash');
      expect(mockQuote).toHaveBeenCalledWith(['raw value']);
      expect(result).toBe("'escaped value'");
    });

    it('should handle empty strings', () => {
      const result = escapeShellArg('', 'bash');
      expect(result).toBe('');
      expect(mockQuote).not.toHaveBeenCalled();
    });
  });

  describe('Windows', () => {
    describe('when shell is cmd.exe', () => {
      it('should wrap simple arguments in double quotes', () => {
        const result = escapeShellArg('search term', 'cmd');
        expect(result).toBe('"search term"');
      });

      it('should escape internal double quotes by doubling them', () => {
        const result = escapeShellArg('He said "Hello"', 'cmd');
        expect(result).toBe('"He said ""Hello"""');
      });

      it('should handle empty strings', () => {
        const result = escapeShellArg('', 'cmd');
        expect(result).toBe('');
      });
    });

    describe('when shell is PowerShell', () => {
      it('should wrap simple arguments in single quotes', () => {
        const result = escapeShellArg('search term', 'powershell');
        expect(result).toBe("'search term'");
      });

      it('should escape internal single quotes by doubling them', () => {
        const result = escapeShellArg("It's a test", 'powershell');
        expect(result).toBe("'It''s a test'");
      });

      it('should handle double quotes without escaping them', () => {
        const result = escapeShellArg('He said "Hello"', 'powershell');
        expect(result).toBe('\'He said "Hello"\'');
      });

      it('should handle empty strings', () => {
        const result = escapeShellArg('', 'powershell');
        expect(result).toBe('');
      });
    });
  });
});

describe('getShellConfiguration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return bash configuration on Linux', () => {
    mockPlatform.mockReturnValue('linux');
    const config = getShellConfiguration();
    expect(config.executable).toBe('bash');
    expect(config.argsPrefix).toEqual(['-c']);
    expect(config.shell).toBe('bash');
  });

  it('should return bash configuration on macOS (darwin)', () => {
    mockPlatform.mockReturnValue('darwin');
    const config = getShellConfiguration();
    expect(config.executable).toBe('bash');
    expect(config.argsPrefix).toEqual(['-c']);
    expect(config.shell).toBe('bash');
  });

  describeWindowsOnly('PowerShell invocation parsing', () => {
    const POWERSHELL_COMMAND_ENV = '__GCLI_POWERSHELL_COMMAND__';
    const originalComSpec = process.env['ComSpec'];

    type PowerShellScenario = {
      label: string;
      command: string;
      entries: Array<{ name: string; text: string }>;
      allowed: boolean;
      disallowed: string[];
      allowlistedCommands?: string[];
    };

    const scenarios: PowerShellScenario[] = [
      {
        label: 'allows a single allowlisted command',
        command: 'dir',
        entries: [{ name: 'dir', text: 'dir' }],
        allowed: true,
        disallowed: [],
      },
      {
        label: 'allows looping with only allowlisted commands',
        command: 'for ($i=0; $i -lt 2; $i++) { dir }',
        entries: [{ name: 'dir', text: 'dir' }],
        allowed: true,
        disallowed: [],
      },
      {
        label: 'allows redirection when root command is allowed',
        command: 'dir *> out.txt',
        entries: [{ name: 'dir', text: 'dir *> out.txt' }],
        allowed: true,
        disallowed: [],
      },
      {
        label: 'blocks additional pipeline commands',
        command: 'dir; whoami',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: false,
        disallowed: ['whoami'],
      },
      {
        label: 'allows additional pipeline commands when allowlisted',
        command: 'dir; whoami',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', 'whoami'],
      },
      {
        label: 'blocks commands hidden inside conditionals',
        command: 'if ($true) { whoami }',
        entries: [{ name: 'whoami', text: 'whoami' }],
        allowed: false,
        disallowed: ['whoami'],
      },
      {
        label: 'allows commands inside conditionals when allowlisted',
        command: 'if ($true) { whoami }',
        entries: [{ name: 'whoami', text: 'whoami' }],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['whoami'],
      },
      {
        label: 'detects static scriptblock creation and invocation',
        command: "dir; [scriptblock]::Create('calc').Invoke()",
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '[scriptblock]::Create',
            text: "[scriptblock]::Create('calc')",
          },
          {
            name: "[scriptblock]::Create('calc').Invoke",
            text: "[scriptblock]::Create('calc').Invoke()",
          },
        ],
        allowed: false,
        disallowed: [
          "[scriptblock]::Create('calc')",
          "[scriptblock]::Create('calc').Invoke()",
        ],
      },
      {
        label: 'allows static scriptblock invocation when allowlisted',
        command: "dir; [scriptblock]::Create('calc').Invoke()",
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '[scriptblock]::Create',
            text: "[scriptblock]::Create('calc')",
          },
          {
            name: "[scriptblock]::Create('calc').Invoke",
            text: "[scriptblock]::Create('calc').Invoke()",
          },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: [
          'dir',
          "[scriptblock]::Create('calc')",
          "[scriptblock]::Create('calc').Invoke()",
        ],
      },
      {
        label: 'detects call operator invocations via variables',
        command: "dir; $cmd = 'whoami'; & $cmd",
        entries: [
          { name: 'dir', text: 'dir' },
          { name: '& $cmd', text: '& $cmd' },
        ],
        allowed: false,
        disallowed: ['& $cmd'],
      },
      {
        label: 'allows variable call operator when allowlisted',
        command: "dir; $cmd = 'whoami'; & $cmd",
        entries: [
          { name: 'dir', text: 'dir' },
          { name: '& $cmd', text: '& $cmd' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', '& $cmd'],
      },
      {
        label: 'detects call operator invocations of scriptblocks',
        command: 'dir; & { whoami }',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: '& { whoami }', text: '& { whoami }' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: false,
        disallowed: ['& { whoami }', 'whoami'],
      },
      {
        label: 'allows scriptblock call operator when allowlisted',
        command: 'dir; & { whoami }',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: '& { whoami }', text: '& { whoami }' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', '& { whoami }', 'whoami'],
      },
      {
        label: 'detects static .NET method invocation',
        command: "dir; [Diagnostics.Process]::Start('whoami')",
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '[Diagnostics.Process]::Start',
            text: "[Diagnostics.Process]::Start('whoami')",
          },
        ],
        allowed: false,
        disallowed: ["[Diagnostics.Process]::Start('whoami')"],
      },
      {
        label: 'allows static .NET invocation when allowlisted',
        command: "dir; [Diagnostics.Process]::Start('whoami')",
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '[Diagnostics.Process]::Start',
            text: "[Diagnostics.Process]::Start('whoami')",
          },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', "[Diagnostics.Process]::Start('whoami')"],
      },
      {
        label: 'detects instance method invocation',
        command: 'dir; (Get-Process)[0].Kill()',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Get-Process', text: 'Get-Process' },
          { name: '(Get-Process)[0].Kill', text: '((Get-Process)[0]).Kill()' },
        ],
        allowed: false,
        disallowed: ['Get-Process', '((Get-Process)[0]).Kill()'],
      },
      {
        label: 'allows instance method invocation when allowlisted',
        command: 'dir; (Get-Process)[0].Kill()',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Get-Process', text: 'Get-Process' },
          { name: '(Get-Process)[0].Kill', text: '((Get-Process)[0]).Kill()' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: [
          'dir',
          'Get-Process',
          '((Get-Process)[0]).Kill()',
        ],
      },
      {
        label: 'detects scriptblock delegates invoked via variables',
        command: 'dir; $sb = { whoami }; $sb.Invoke()',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'whoami', text: 'whoami' },
          { name: '$sb.Invoke', text: '$sb.Invoke()' },
        ],
        allowed: false,
        disallowed: ['whoami', '$sb.Invoke()'],
      },
      {
        label: 'allows scriptblock delegate invocation when allowlisted',
        command: 'dir; $sb = { whoami }; $sb.Invoke()',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'whoami', text: 'whoami' },
          { name: '$sb.Invoke', text: '$sb.Invoke()' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', 'whoami', '$sb.Invoke()'],
      },
      {
        label: 'detects call operator with expandable strings',
        command: 'dir; & "$env:ComSpec" /c whoami',
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '& "$env:ComSpec" /c whoami',
            text: '& "$env:ComSpec" /c whoami',
          },
        ],
        allowed: false,
        disallowed: ['& "$env:ComSpec" /c whoami'],
      },
      {
        label: 'allows call operator expandable string when allowlisted',
        command: 'dir; & "$env:ComSpec" /c whoami',
        entries: [
          { name: 'dir', text: 'dir' },
          {
            name: '& "$env:ComSpec" /c whoami',
            text: '& "$env:ComSpec" /c whoami',
          },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', '& "$env:ComSpec" /c whoami'],
      },
      {
        label: 'detects call operator with nested command expressions',
        command: "dir; & (Join-Path $pwd 'whoami.exe')",
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Join-Path', text: "Join-Path $pwd 'whoami.exe'" },
          {
            name: "& (Join-Path $pwd 'whoami.exe')",
            text: "& (Join-Path $pwd 'whoami.exe')",
          },
        ],
        allowed: false,
        disallowed: [
          "Join-Path $pwd 'whoami.exe'",
          "& (Join-Path $pwd 'whoami.exe')",
        ],
      },
      {
        label: 'allows nested command expression when allowlisted',
        command: "dir; & (Join-Path $pwd 'whoami.exe')",
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Join-Path', text: "Join-Path $pwd 'whoami.exe'" },
          {
            name: "& (Join-Path $pwd 'whoami.exe')",
            text: "& (Join-Path $pwd 'whoami.exe')",
          },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: [
          'dir',
          "Join-Path $pwd 'whoami.exe'",
          "& (Join-Path $pwd 'whoami.exe')",
        ],
      },
      {
        label: 'detects subexpression command substitution',
        command: 'dir; Write-Output $(whoami)',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Write-Output', text: 'Write-Output $(whoami)' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: false,
        disallowed: ['Write-Output $(whoami)', 'whoami'],
      },
      {
        label:
          'allows subexpression command when all invocations are allowlisted',
        command: 'dir; Write-Output $(whoami)',
        entries: [
          { name: 'dir', text: 'dir' },
          { name: 'Write-Output', text: 'Write-Output $(whoami)' },
          { name: 'whoami', text: 'whoami' },
        ],
        allowed: true,
        disallowed: [],
        allowlistedCommands: ['dir', 'Write-Output $(whoami)', 'whoami'],
      },
    ];

    beforeEach(() => {
      mockPlatform.mockReturnValue('win32');
      process.env['ComSpec'] =
        'C\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

      const scenarioResults = new Map(
        scenarios.map((scenario) => [
          scenario.command,
          {
            success: true,
            commands: scenario.entries,
          },
        ]),
      );

      mockSpawnSync.mockImplementation((_exe, _args, options) => {
        const env = (options as { env?: NodeJS.ProcessEnv } | undefined)?.env;
        const commandText = env?.[POWERSHELL_COMMAND_ENV] ?? '';
        const payload = scenarioResults.get(commandText);
        if (!payload) {
          return {
            status: 1,
            stdout: '',
            stderr: '',
          } as unknown as ReturnType<typeof mockSpawnSync>;
        }

        const stdout = JSON.stringify(payload);
        return {
          status: 0,
          stdout,
          stderr: '',
        } as unknown as ReturnType<typeof mockSpawnSync>;
      });
    });

    afterEach(() => {
      mockSpawnSync.mockReset();
      if (originalComSpec === undefined) {
        delete process.env['ComSpec'];
      } else {
        process.env['ComSpec'] = originalComSpec;
      }
    });

    describe.each(scenarios)(
      '$label',
      ({ command, allowed, disallowed, allowlistedCommands }) => {
        it('applies the allowlist expectations', () => {
          const configForTest = {
            getCoreTools: () => [],
            getExcludeTools: () => [],
            getAllowedTools: () => [],
          } as unknown as Config;

          const result = checkCommandPermissions(
            command,
            configForTest,
            new Set(allowlistedCommands ?? ['dir']),
          );

          if (allowed) {
            expect(result.allAllowed).toBe(true);
            expect(result.disallowedCommands).toEqual([]);
          } else {
            expect(result.allAllowed).toBe(false);
            expect(result.disallowedCommands).toEqual(disallowed);
            expect(result.blockReason ?? '').toContain('Disallowed commands');
          }
        });
      },
    );
  });

  describe('on Windows', () => {
    beforeEach(() => {
      mockPlatform.mockReturnValue('win32');
    });

    it('should return PowerShell configuration by default', () => {
      delete process.env['ComSpec'];
      const config = getShellConfiguration();
      expect(config.executable).toBe('powershell.exe');
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should ignore ComSpec when pointing to cmd.exe', () => {
      const cmdPath = 'C:\\WINDOWS\\system32\\cmd.exe';
      process.env['ComSpec'] = cmdPath;
      const config = getShellConfiguration();
      expect(config.executable).toBe('powershell.exe');
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to powershell.exe', () => {
      const psPath =
        'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      process.env['ComSpec'] = psPath;
      const config = getShellConfiguration();
      expect(config.executable).toBe(psPath);
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to pwsh.exe', () => {
      const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
      process.env['ComSpec'] = pwshPath;
      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should be case-insensitive when checking ComSpec', () => {
      process.env['ComSpec'] = 'C:\\Path\\To\\POWERSHELL.EXE';
      const config = getShellConfiguration();
      expect(config.executable).toBe('C:\\Path\\To\\POWERSHELL.EXE');
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });
  });
});
