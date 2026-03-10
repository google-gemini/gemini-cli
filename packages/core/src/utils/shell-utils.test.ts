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
  parseCommandDetails,
  stripShellWrapper,
  hasRedirection,
  resolveExecutable,
  resetShellConfiguration,
} from './shell-utils.js';
import path from 'node:path';

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

const mockAccess = vi.hoisted(() => vi.fn());
const mockAccessSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockRealpathSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  default: {
    promises: {
      access: mockAccess,
    },
    constants: { X_OK: 1 },
    existsSync: mockExistsSync,
    realpathSync: mockRealpathSync,
    accessSync: mockAccessSync,
  },
  promises: {
    access: mockAccess,
  },
  constants: { X_OK: 1 },
  existsSync: mockExistsSync,
  realpathSync: mockRealpathSync,
  accessSync: mockAccessSync,
}));

const mockSpawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  spawn: vi.fn(),
}));

const mockQuote = vi.hoisted(() => vi.fn());
vi.mock('shell-quote', () => ({
  quote: mockQuote,
}));

const mockDebugLogger = vi.hoisted(() => ({
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('./debugLogger.js', () => ({
  debugLogger: mockDebugLogger,
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
  mockSpawnSync.mockReturnValue({
    stdout: Buffer.from(''),
    stderr: Buffer.from(''),
    status: 0,
    error: undefined,
  });
  mockExistsSync.mockReturnValue(false);
  mockRealpathSync.mockImplementation((p: string) => p);
  mockAccessSync.mockReturnValue(undefined); // Success by default
  resetShellConfiguration();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const mockPowerShellResult = (
  commands: Array<{ name: string; text: string }>,
  hasRedirection: boolean,
) => {
  mockSpawnSync.mockReturnValue({
    stdout: Buffer.from(
      JSON.stringify({
        success: true,
        commands,
        hasRedirection,
      }),
    ),
    stderr: Buffer.from(''),
    status: 0,
    error: undefined,
  });
};

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

  it('should include nested command substitutions in redirected statements', () => {
    const result = getCommandRoots('echo $(cat secret) > output.txt');
    expect(result).toEqual(['echo', 'cat']);
  });

  it('should correctly identify input redirection with explicit file descriptor', () => {
    const result = parseCommandDetails('ls 2< input.txt');
    const redirection = result?.details.find((d) =>
      d.name.startsWith('redirection'),
    );
    expect(redirection?.name).toBe('redirection (<)');
  });

  it('should filter out all redirections from getCommandRoots', () => {
    expect(getCommandRoots('cat < input.txt')).toEqual(['cat']);
    expect(getCommandRoots('ls 2> error.log')).toEqual(['ls']);
    expect(getCommandRoots('exec 3<&0')).toEqual(['exec']);
  });

  it('should handle parser initialization failures gracefully', async () => {
    // Reset modules to clear singleton state
    vi.resetModules();

    // Mock fileUtils to fail Wasm loading
    vi.doMock('./fileUtils.js', () => ({
      loadWasmBinary: vi.fn().mockRejectedValue(new Error('Wasm load failed')),
    }));

    // Re-import shell-utils with mocked dependencies
    const shellUtils = await import('./shell-utils.js');

    // Should catch the error and not throw
    await expect(shellUtils.initializeShellParsers()).resolves.not.toThrow();

    // Fallback: splitting commands depends on parser, so if parser fails, it returns empty
    const roots = shellUtils.getCommandRoots('ls -la');
    expect(roots).toEqual([]);
  });

  it('should handle bash parser timeouts', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    // Mock performance.now() to trigger timeout:
    // 1st call: start time = 0. deadline = 0 + 1000ms.
    // 2nd call (and onwards): inside progressCallback, return 2000ms.
    nowSpy.mockReturnValueOnce(0).mockReturnValue(2000);

    // Use a very complex command to ensure progressCallback is triggered at least once
    const complexCommand =
      'ls -la && ' + Array(100).fill('echo "hello"').join(' && ');
    const roots = getCommandRoots(complexCommand);
    expect(roots).toEqual([]);
    expect(nowSpy).toHaveBeenCalled();

    expect(mockDebugLogger.error).toHaveBeenCalledWith(
      'Bash command parsing timed out for command:',
      complexCommand,
    );

    nowSpy.mockRestore();
  });
});

describe('hasRedirection', () => {
  it('should detect output redirection', () => {
    expect(hasRedirection('echo hello > world')).toBe(true);
  });

  it('should detect input redirection', () => {
    expect(hasRedirection('cat < input')).toBe(true);
  });

  it('should detect redirection with explicit file descriptor', () => {
    expect(hasRedirection('ls 2> error.log')).toBe(true);
    expect(hasRedirection('exec 3<&0')).toBe(true);
  });

  it('should detect append redirection', () => {
    expect(hasRedirection('echo hello >> world')).toBe(true);
  });

  it('should detect heredoc', () => {
    expect(hasRedirection('cat <<EOF\nhello\nEOF')).toBe(true);
  });

  it('should detect herestring', () => {
    expect(hasRedirection('cat <<< "hello"')).toBe(true);
  });

  it('should return false for simple commands', () => {
    expect(hasRedirection('ls -la')).toBe(false);
  });

  it('should return false for pipes (pipes are not redirections in this context)', () => {
    // Note: pipes are often handled separately by splitCommands, but checking here confirms they don't trigger "redirection" flag if we don't want them to.
    // However, the current implementation checks for 'redirected_statement' nodes.
    // A pipe is a 'pipeline' node.
    expect(hasRedirection('echo hello | cat')).toBe(false);
  });

  it('should return false when redirection characters are inside quotes in bash', () => {
    mockPlatform.mockReturnValue('linux');
    expect(hasRedirection('echo "a > b"')).toBe(false);
  });
});

describeWindowsOnly('PowerShell integration', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    const systemRoot = 'C:\\\\Windows';
    vi.stubEnv('ComSpec', `${systemRoot}\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe`);
  });

  it('should return command roots using PowerShell AST output', () => {
    mockPowerShellResult(
      [
        { name: 'Get-ChildItem', text: 'Get-ChildItem' },
        { name: 'Select-Object', text: 'Select-Object Name' },
      ],
      false,
    );

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

    it('should return PowerShell configuration by default (powershell.exe) with absolute path', () => {
      vi.stubEnv('ComSpec', '');
      const systemRoot = 'C:\\Windows';
      vi.stubEnv('SystemRoot', systemRoot);
      const expectedPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      
      mockExistsSync.mockImplementation((p: string) => p === expectedPath);
      mockAccessSync.mockImplementation((p: string) => {
        if (p === expectedPath) return; // success
        throw new Error('ENOENT');
      });

      const config = getShellConfiguration();
      expect(config.executable).toBe(expectedPath);
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should prefer pwsh.exe if available in PATH with absolute directory', () => {
      vi.stubEnv('ComSpec', '');
      const pwshDir = path.resolve('C:\\Program Files\\PowerShell\\7');
      const pwshPath = path.join(pwshDir, 'pwsh.exe');
      vi.stubEnv('PATH', pwshDir);

      mockExistsSync.mockImplementation((p: string) => p === pwshPath);

      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.shell).toBe('powershell');
    });

    it('should ignore relative paths in PATH for security', () => {
      vi.stubEnv('ComSpec', '');
      vi.stubEnv('PATH', `relative_path${path.delimiter}C:\\Windows`);
      mockExistsSync.mockReturnValue(false);

      const config = getShellConfiguration();
      // Should fall back to absolute powershell.exe, not search in 'relative_path'
      expect(config.executable).toContain('powershell.exe');
      expect(config.executable).toContain('C:');
    });

    it('should ignore ComSpec when pointing to cmd.exe and prefer pwsh.exe in PATH', () => {
      const cmdPath = 'C:\\WINDOWS\\system32\\cmd.exe';
      vi.stubEnv('ComSpec', cmdPath);
      const pwshPath = path.join('C:\\pwsh', 'pwsh.exe');
      vi.stubEnv('PATH', 'C:\\pwsh');

      mockExistsSync.mockImplementation((p: string) => p === pwshPath);

      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.shell).toBe('powershell');
    });

    it('should prefer pwsh.exe in PATH even if ComSpec points to powershell.exe', () => {
      const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const pwshPath = path.resolve('C:\\pwsh', 'pwsh.exe');
      vi.stubEnv('ComSpec', psPath);
      vi.stubEnv('PATH', 'C:\\pwsh');

      mockExistsSync.mockImplementation((p: string) => p === pwshPath);

      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to powershell.exe and pwsh.exe is NOT in PATH', () => {
      const psPath =
        'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      vi.stubEnv('ComSpec', psPath);
      vi.stubEnv('PATH', ''); // Ensure pwsh is not found
      mockExistsSync.mockReturnValue(false);

      const config = getShellConfiguration();
      expect(config.executable).toBe(psPath);
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to pwsh.exe', () => {
      const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
      vi.stubEnv('ComSpec', pwshPath);
      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });

    it('should be case-insensitive when checking ComSpec', () => {
      vi.stubEnv('ComSpec', 'C:\\Path\\To\\POWERSHELL.EXE');
      const config = getShellConfiguration();
      expect(config.executable).toBe('C:\\Path\\To\\POWERSHELL.EXE');
      expect(config.argsPrefix).toEqual(['-NoProfile', '-Command']);
      expect(config.shell).toBe('powershell');
    });
  });
});

describe('hasRedirection (PowerShell via mock)', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    vi.stubEnv('ComSpec', 'powershell.exe');
  });

  it('should return true when PowerShell parser detects redirection', () => {
    mockPowerShellResult([{ name: 'echo', text: 'echo hello' }], true);
    expect(hasRedirection('echo hello > file.txt')).toBe(true);
  });

  it('should return false when PowerShell parser does not detect redirection', () => {
    mockPowerShellResult([{ name: 'echo', text: 'echo hello' }], false);
    expect(hasRedirection('echo hello')).toBe(false);
  });

  it('should return false when quoted redirection chars are used but not actual redirection', () => {
    mockPowerShellResult(
      [{ name: 'echo', text: 'echo "-> arrow"' }],
      false, // Parser says NO redirection
    );
    expect(hasRedirection('echo "-> arrow"')).toBe(false);
  });

  it('should fallback to regex if parsing fails (simulating safety)', () => {
    mockSpawnSync.mockReturnValue({
      stdout: Buffer.from('invalid json'),
      status: 0,
    });
    // Fallback regex sees '>' in arrow
    expect(hasRedirection('echo "-> arrow"')).toBe(true);
  });
});

describe('resolveExecutable', () => {
  beforeEach(() => {
    mockAccess.mockReset();
  });

  it('should return the absolute path if it exists and is executable', async () => {
    const absPath = path.resolve('/usr/bin/git');
    mockAccess.mockResolvedValue(undefined); // success
    expect(await resolveExecutable(absPath)).toBe(absPath);
    expect(mockAccess).toHaveBeenCalledWith(absPath, 1);
  });

  it('should return undefined for absolute path if it does not exist', async () => {
    const absPath = path.resolve('/usr/bin/nonexistent');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    expect(await resolveExecutable(absPath)).toBeUndefined();
  });

  it('should resolve executable in PATH', async () => {
    const binDir = path.resolve('/bin');
    const usrBinDir = path.resolve('/usr/bin');
    vi.stubEnv('PATH', `${binDir}${path.delimiter}${usrBinDir}`);
    mockPlatform.mockReturnValue('linux');

    const targetPath = path.join(usrBinDir, 'ls');
    mockAccess.mockImplementation(async (p: string) => {
      if (p === targetPath) return undefined;
      throw new Error('ENOENT');
    });

    expect(await resolveExecutable('ls')).toBe(targetPath);
  });

  it('should try extensions on Windows', async () => {
    const sys32 = path.resolve('C:\\Windows\\System32');
    vi.stubEnv('PATH', sys32);
    mockPlatform.mockReturnValue('win32');
    mockAccess.mockImplementation(async (p: string) => {
      // Use includes because on Windows path separators might differ
      if (p.includes('cmd.exe')) return undefined;
      throw new Error('ENOENT');
    });

    expect(await resolveExecutable('cmd')).toContain('cmd.exe');
  });

  it('should return undefined if not found in PATH', async () => {
    vi.stubEnv('PATH', path.resolve('/bin'));
    mockPlatform.mockReturnValue('linux');
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    expect(await resolveExecutable('unknown')).toBeUndefined();
  });
});
