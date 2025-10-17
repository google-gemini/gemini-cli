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
  checkCommandPermissions,
  checkForUnsafeRedirections,
  escapeShellArg,
  getCommandRoots,
  getShellConfiguration,
  isCommandAllowed,
  initializeShellParsers,
  stripShellWrapper,
} from './shell-utils.js';
import type { Config } from '../config/config.js';
import type { WorkspaceContext } from './workspaceContext.js';

const mockPlatform = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  default: {
    platform: mockPlatform,
    homedir: mockHomedir,
  },
  platform: mockPlatform,
  homedir: mockHomedir,
}));

const mockQuote = vi.hoisted(() => vi.fn());
vi.mock('shell-quote', () => ({
  quote: mockQuote,
}));

let config: Config;
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
  config = {
    getCoreTools: () => [],
    getExcludeTools: () => [],
    getAllowedTools: () => [],
    getTargetDir: () => '/workspace',
  } as unknown as Config;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isCommandAllowed', () => {
  it('should allow a command if no restrictions are provided', () => {
    const result = isCommandAllowed('goodCommand --safe', config);
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the global allowlist', () => {
    config.getCoreTools = () => ['ShellTool(goodCommand)'];
    const result = isCommandAllowed('goodCommand --safe', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in a strict global allowlist', () => {
    config.getCoreTools = () => ['ShellTool(goodCommand --safe)'];
    const result = isCommandAllowed('badCommand --danger', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command(s) not in the allowed commands list. Disallowed commands: "badCommand --danger"`,
    );
  });

  it('should block a command if it is in the blocked list', () => {
    config.getExcludeTools = () => ['ShellTool(badCommand --danger)'];
    const result = isCommandAllowed('badCommand --danger', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'badCommand --danger' is blocked by configuration`,
    );
  });

  it('should prioritize the blocklist over the allowlist', () => {
    config.getCoreTools = () => ['ShellTool(badCommand --danger)'];
    config.getExcludeTools = () => ['ShellTool(badCommand --danger)'];
    const result = isCommandAllowed('badCommand --danger', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'badCommand --danger' is blocked by configuration`,
    );
  });

  it('should allow any command when a wildcard is in coreTools', () => {
    config.getCoreTools = () => ['ShellTool'];
    const result = isCommandAllowed('any random command', config);
    expect(result.allowed).toBe(true);
  });

  it('should block any command when a wildcard is in excludeTools', () => {
    config.getExcludeTools = () => ['run_shell_command'];
    const result = isCommandAllowed('any random command', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('should block a command on the blocklist even with a wildcard allow', () => {
    config.getCoreTools = () => ['ShellTool'];
    config.getExcludeTools = () => ['ShellTool(badCommand --danger)'];
    const result = isCommandAllowed('badCommand --danger', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'badCommand --danger' is blocked by configuration`,
    );
  });

  it('should allow a chained command if all parts are on the global allowlist', () => {
    config.getCoreTools = () => [
      'run_shell_command(echo)',
      'run_shell_command(goodCommand)',
    ];
    const result = isCommandAllowed(
      'echo "hello" && goodCommand --safe',
      config,
    );
    expect(result.allowed).toBe(true);
  });

  it('should block a chained command if any part is blocked', () => {
    config.getExcludeTools = () => ['run_shell_command(badCommand)'];
    const result = isCommandAllowed(
      'echo "hello" && badCommand --danger',
      config,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'badCommand --danger' is blocked by configuration`,
    );
  });

  describe('command substitution', () => {
    it('should allow command substitution using `$(...)`', () => {
      const result = isCommandAllowed('echo $(goodCommand --safe)', config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow command substitution using `<(...)`', () => {
      const result = isCommandAllowed('diff <(ls) <(ls -a)', config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow command substitution using `>(...)`', () => {
      const result = isCommandAllowed(
        'echo "Log message" > >(tee log.txt)',
        config,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow command substitution using backticks', () => {
      const result = isCommandAllowed('echo `goodCommand --safe`', config);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow substitution-like patterns inside single quotes', () => {
      config.getCoreTools = () => ['ShellTool(echo)'];
      const result = isCommandAllowed("echo '$(pwd)'", config);
      expect(result.allowed).toBe(true);
    });

    it('should block a command when parsing fails', () => {
      const result = isCommandAllowed('ls &&', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        'Command rejected because it could not be parsed safely',
      );
    });
  });

  describe('with unsafe redirections', () => {
    beforeEach(() => {
      config.getWorkspaceContext = () =>
        ({
          getDirectories: () => ['/workspace'],
        }) as Partial<WorkspaceContext> as WorkspaceContext;
    });

    it('should block output redirection to home directory', () => {
      mockHomedir.mockReturnValue('/home/user');
      const result = isCommandAllowed('wc README.md > ~/output.txt', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('file redirection');
      expect(result.reason).toContain('outside the workspace');
      expect(result.reason).toContain('~/output.txt');
    });

    it('should block output redirection to /tmp', () => {
      const result = isCommandAllowed('echo secret > /tmp/data.txt', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('/tmp/data.txt');
    });

    it('should allow redirections within workspace', () => {
      const result = isCommandAllowed('echo test > output.txt', config);
      expect(result.allowed).toBe(true);
    });

    it('should allow absolute paths within workspace', () => {
      const result = isCommandAllowed(
        'echo test > /workspace/logs/out.txt',
        config,
      );
      expect(result.allowed).toBe(true);
    });

    it('should block path traversal attempts', () => {
      config.getWorkspaceContext = () =>
        ({
          getDirectories: () => ['/workspace/project/subdir'],
        }) as Partial<WorkspaceContext> as WorkspaceContext;
      const result = isCommandAllowed(
        'cat secret > ../../../etc/passwd',
        config,
      );
      expect(result.allowed).toBe(false);
    });
  });
});

describe('checkCommandPermissions', () => {
  describe('in "Default Allow" mode (no sessionAllowlist)', () => {
    it('should return a detailed success object for an allowed command', () => {
      const result = checkCommandPermissions('goodCommand --safe', config);
      expect(result).toEqual({
        allAllowed: true,
        disallowedCommands: [],
      });
    });

    it('should block commands that cannot be parsed safely', () => {
      const result = checkCommandPermissions('ls &&', config);
      expect(result).toEqual({
        allAllowed: false,
        disallowedCommands: ['ls &&'],
        blockReason: 'Command rejected because it could not be parsed safely',
        isHardDenial: true,
      });
    });

    it('should return a detailed failure object for a blocked command', () => {
      config.getExcludeTools = () => ['ShellTool(badCommand)'];
      const result = checkCommandPermissions('badCommand --danger', config);
      expect(result).toEqual({
        allAllowed: false,
        disallowedCommands: ['badCommand --danger'],
        blockReason: `Command 'badCommand --danger' is blocked by configuration`,
        isHardDenial: true,
      });
    });

    it('should return a detailed failure object for a command not on a strict allowlist', () => {
      config.getCoreTools = () => ['ShellTool(goodCommand)'];
      const result = checkCommandPermissions(
        'git status && goodCommand',
        config,
      );
      expect(result).toEqual({
        allAllowed: false,
        disallowedCommands: ['git status'],
        blockReason: `Command(s) not in the allowed commands list. Disallowed commands: "git status"`,
        isHardDenial: false,
      });
    });
  });

  describe('in "Default Deny" mode (with sessionAllowlist)', () => {
    it('should allow a command on the sessionAllowlist', () => {
      const result = checkCommandPermissions(
        'goodCommand --safe',
        config,
        new Set(['goodCommand --safe']),
      );
      expect(result.allAllowed).toBe(true);
    });

    it('should block a command not on the sessionAllowlist or global allowlist', () => {
      const result = checkCommandPermissions(
        'badCommand --danger',
        config,
        new Set(['goodCommand --safe']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.blockReason).toContain(
        'not on the global or session allowlist',
      );
      expect(result.disallowedCommands).toEqual(['badCommand --danger']);
    });

    it('should allow a command on the global allowlist even if not on the session allowlist', () => {
      config.getCoreTools = () => ['ShellTool(git status)'];
      const result = checkCommandPermissions(
        'git status',
        config,
        new Set(['goodCommand --safe']),
      );
      expect(result.allAllowed).toBe(true);
    });

    it('should allow a chained command if parts are on different allowlists', () => {
      config.getCoreTools = () => ['ShellTool(git status)'];
      const result = checkCommandPermissions(
        'git status && git commit',
        config,
        new Set(['git commit']),
      );
      expect(result.allAllowed).toBe(true);
    });

    it('should block a command on the sessionAllowlist if it is also globally blocked', () => {
      config.getExcludeTools = () => ['run_shell_command(badCommand)'];
      const result = checkCommandPermissions(
        'badCommand --danger',
        config,
        new Set(['badCommand --danger']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.blockReason).toContain('is blocked by configuration');
    });

    it('should block a chained command if one part is not on any allowlist', () => {
      config.getCoreTools = () => ['run_shell_command(echo)'];
      const result = checkCommandPermissions(
        'echo "hello" && badCommand --danger',
        config,
        new Set(['echo']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.disallowedCommands).toEqual(['badCommand --danger']);
    });
  });
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

  it('should block commands when PowerShell parser reports errors', () => {
    const { allowed, reason } = isCommandAllowed('Get-ChildItem |', config);
    expect(allowed).toBe(false);
    expect(reason).toBe(
      'Command rejected because it could not be parsed safely',
    );
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

describe('checkForUnsafeRedirections', () => {
  beforeEach(() => {
    mockHomedir.mockReturnValue('/home/user');
  });

  it('should detect output redirection to home directory', () => {
    const result = checkForUnsafeRedirections(
      'wc README.md > ~/output.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets).toContain('~/output.txt');
  });

  it('should detect append redirection (>>)', () => {
    const result = checkForUnsafeRedirections(
      'echo test >> /tmp/log.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets).toContain('/tmp/log.txt');
  });

  it('should detect input redirection (<)', () => {
    const result = checkForUnsafeRedirections(
      'cat < /etc/passwd',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets).toContain('/etc/passwd');
  });

  it('should detect pipe operators', () => {
    const result = checkForUnsafeRedirections(
      'ls | grep test',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.redirections.some((r) => r.type === 'pipe')).toBe(true);
  });

  it('should allow redirections within workspace', () => {
    const result = checkForUnsafeRedirections(
      'echo test > output.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(false);
    expect(result.unsafeTargets).toHaveLength(0);
  });

  it('should allow absolute paths within workspace', () => {
    const result = checkForUnsafeRedirections(
      'echo test > /workspace/subdir/output.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(false);
    expect(result.unsafeTargets).toHaveLength(0);
  });

  it('should block absolute paths outside workspace', () => {
    const result = checkForUnsafeRedirections(
      'cat data > /tmp/exposed.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets).toContain('/tmp/exposed.txt');
  });

  it('should handle quoted file paths', () => {
    const result = checkForUnsafeRedirections(
      'echo test > "/tmp/output file.txt"',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
  });

  it('should detect path traversal with ../', () => {
    const result = checkForUnsafeRedirections(
      'echo secret > ../../outside.txt',
      ['/workspace/proj/subdir'],
      '/workspace/proj/subdir',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
  });

  it('should allow relative paths within workspace', () => {
    const result = checkForUnsafeRedirections(
      'echo test > ./logs/output.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(false);
  });

  it('should handle multiple redirections in one command', () => {
    const result = checkForUnsafeRedirections(
      'cat input.txt > /tmp/out.txt 2> /tmp/err.txt',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets.length).toBeGreaterThan(0);
  });

  it('should allow heredocs (no target to validate)', () => {
    const result = checkForUnsafeRedirections(
      'cat << EOF\ntest\nEOF',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.redirections.some((r) => r.type === 'heredoc')).toBe(true);
    expect(result.isOutsideWorkspace).toBe(false);
  });

  it('should return empty result for commands without redirections', () => {
    const result = checkForUnsafeRedirections(
      'ls -la',
      ['/workspace'],
      '/workspace',
    );
    expect(result.hasRedirection).toBe(false);
    expect(result.isOutsideWorkspace).toBe(false);
    expect(result.unsafeTargets).toHaveLength(0);
  });

  it('should handle commands with multiple workspace directories', () => {
    const result = checkForUnsafeRedirections(
      'echo test > /workspace2/output.txt',
      ['/workspace1', '/workspace2', '/workspace3'],
      '/workspace2',
    );
    expect(result.hasRedirection).toBe(true);
    expect(result.isOutsideWorkspace).toBe(false);
  });

  it('should block absolute path redirections when no workspace dirs specified', () => {
    const result = checkForUnsafeRedirections(
      'echo test > /tmp/file.txt',
      [],
      '/some/dir',
    );
    // When no workspace directories are defined, absolute paths are considered unsafe
    // since there's no workspace boundary to validate against
    expect(result.isOutsideWorkspace).toBe(true);
    expect(result.unsafeTargets).toContain('/tmp/file.txt');
  });
});
