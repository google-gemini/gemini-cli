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
  splitCommands,
  stripShellWrapper,
  normalizeCommand,
  hasRedirection,
  detectCommandSubstitution,
  resolveExecutable,
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

const mockAccessSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  default: {
    accessSync: mockAccessSync,
    constants: { X_OK: 1 },
  },
  accessSync: mockAccessSync,
  constants: { X_OK: 1 },
}));

const mockSpawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  spawn: vi.fn(),
}));

const mockQuote = vi.hoisted(() => vi.fn());
vi.mock('shell-quote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shell-quote')>();
  return {
    ...actual,
    quote: mockQuote,
  };
});

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
});

afterEach(() => {
  vi.clearAllMocks();
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

describe('normalizeCommand', () => {
  it('should lowercase the command', () => {
    expect(normalizeCommand('NPM')).toBe('npm');
  });

  it('should remove .exe extension', () => {
    expect(normalizeCommand('node.exe')).toBe('node');
  });

  it('should handle absolute paths', () => {
    expect(normalizeCommand('/usr/bin/npm')).toBe('npm');
    expect(normalizeCommand('C:\\Program Files\\nodejs\\node.exe')).toBe(
      'node',
    );
  });
});

describe('getCommandRoots', () => {
  it('should return a single command', () => {
    expect(getCommandRoots('ls -l')).toEqual(['ls']);
  });

  it('should handle paths and return the full path', () => {
    expect(getCommandRoots('/usr/local/bin/node script.js')).toEqual([
      '/usr/local/bin/node',
    ]);
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

describe('splitCommands', () => {
  it('should split chained commands', () => {
    expect(splitCommands('ls -l && git status')).toEqual([
      'ls -l',
      'git status',
    ]);
  });

  it('should filter out redirection tokens but keep command parts', () => {
    // Standard redirection
    expect(splitCommands('echo "hello" > file.txt')).toEqual(['echo "hello"']);
    expect(splitCommands('printf "test" >> log.txt')).toEqual([
      'printf "test"',
    ]);
    expect(splitCommands('cat < input.txt')).toEqual(['cat']);

    // Heredoc/Herestring
    expect(splitCommands('cat << EOF\nhello\nEOF')).toEqual(['cat']);
    // Note: The Tree-sitter bash parser includes the herestring in the main
    // command node's text, unlike standard redirections which are siblings.
    expect(splitCommands('grep "foo" <<< "foobar"')).toEqual([
      'grep "foo" <<< "foobar"',
    ]);
  });

  it('should extract nested commands from process substitution while filtering the redirection operator', () => {
    // This is the key security test: we want cat to be checked, but not the > >(...) wrapper part
    const parts = splitCommands('echo "foo" > >(cat)');
    expect(parts).toContain('echo "foo"');
    expect(parts).toContain('cat');
    expect(parts.some((p) => p.includes('>'))).toBe(false);
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

  it('should strip PowerShell wrappers with -NonInteractive, -NoLogo, and Windows paths', () => {
    expect(
      stripShellWrapper(
        'powershell.exe -NoProfile -NonInteractive -Command "git log -n 10 --oneline"',
      ),
    ).toEqual('git log -n 10 --oneline');
    expect(
      stripShellWrapper(
        'pwsh.exe -NonInteractive -NoProfile -NoLogo -c "Get-ChildItem"',
      ),
    ).toEqual('Get-ChildItem');
    expect(
      stripShellWrapper(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive -Command "git diff main...HEAD --stat"',
      ),
    ).toEqual('git diff main...HEAD --stat');
    expect(
      stripShellWrapper(
        '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -NonInteractive -Command "Get-Location"',
      ),
    ).toEqual('Get-Location');
  });

  it('should unescape C-argv escaped quotes inside outer PowerShell -Command "..." without corrupting compound commands', () => {
    expect(
      stripShellWrapper('powershell -Command "node -e \\"console.log(1)\\""'),
    ).toEqual('node -e "console.log(1)"');
    expect(
      stripShellWrapper(
        'powershell.exe -NoProfile -NonInteractive -Command "node -e \\"console.log(\\\\\\"hello (world)\\\\\\")\\""',
      ),
    ).toEqual('node -e "console.log(\\"hello (world)\\")"');
    expect(stripShellWrapper('powershell -Command "echo a"; whoami')).toEqual(
      '"echo a"; whoami',
    );
    expect(stripShellWrapper('powershell -Command "echo a"; echo "b"')).toEqual(
      'powershell -Command "echo a"; echo "b"',
    );
    expect(
      stripShellWrapper('cmd.exe /c "echo a" & whoami & echo "b"'),
    ).toEqual('cmd.exe /c "echo a" & whoami & echo "b"');
    expect(
      stripShellWrapper(
        'cmd.exe /c "powershell.exe -NoProfile -NonInteractive -Command \\"echo $(whoami)\\""',
      ),
    ).toEqual('echo $(whoami)');
    expect(stripShellWrapper('powershell -Command "echo `$(whoami)"')).toEqual(
      'echo $(whoami)',
    );
    // Refuse to unwrap when unwrapping would hide outer-shell substitution inside single quotes or escaped backticks
    expect(
      stripShellWrapper('powershell -Command "echo \'$(whoami)\'"'),
    ).toEqual('powershell -Command "echo \'$(whoami)\'"');
    expect(
      stripShellWrapper('powershell -Command "echo \'``$(whoami)\'"'),
    ).toEqual('powershell -Command "echo \'``$(whoami)\'"');
    expect(stripShellWrapper('powershell -Command "echo ``$(whoami)"')).toEqual(
      'echo `$(whoami)',
    );
    expect(stripShellWrapper('bash -c "echo \'$(whoami)\'"')).toEqual(
      'bash -c "echo \'$(whoami)\'"',
    );
    expect(stripShellWrapper('bash -c "echo \\\\$(whoami)"')).toEqual(
      'bash -c "echo \\\\$(whoami)"',
    );
    // Even backslashes before quote in cmd.exe /c close the quote rather than escaping it
    expect(
      stripShellWrapper('cmd.exe /c "echo \\\\"& whoami & echo \\""'),
    ).toEqual('cmd.exe /c "echo \\\\"& whoami & echo \\""');
    // Even backslashes before doubled quotes ("") or closing quote in cmd.exe /c and PowerShell are halved
    expect(stripShellWrapper('cmd.exe /c "echo foo\\\\""bar"')).toEqual(
      'echo foo\\"bar',
    );
    expect(stripShellWrapper('cmd.exe /c "echo C:\\\\"')).toEqual('echo C:\\');
    expect(stripShellWrapper('powershell -Command "echo C:\\\\"')).toEqual(
      'echo C:\\',
    );
  });

  it('should not strip anything if no wrapper is present', () => {
    expect(stripShellWrapper('ls -l')).toEqual('ls -l');
  });

  it('should handle multi-line escaped double quotes correctly', () => {
    const multiLine = 'bash -c "hg commit -m \\"title\n\nbody\\""';
    const expected = 'hg commit -m "title\n\nbody"';
    expect(stripShellWrapper(multiLine)).toEqual(expected);
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
        const result = escapeShellArg('hello "world"', 'cmd');
        expect(result).toBe('"hello ""world"""');
      });

      it('should handle empty strings', () => {
        const result = escapeShellArg('', 'cmd');
        expect(result).toBe('');
      });
    });

    describe('when shell is PowerShell', () => {
      it('should return simple alphanumeric arguments without quotes', () => {
        const result = escapeShellArg('my-argument-123.txt', 'powershell');
        expect(result).toBe('my-argument-123.txt');
      });

      it('should wrap arguments with spaces in single quotes', () => {
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
  afterEach(() => {
    vi.unstubAllEnvs();
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
      vi.stubEnv('ComSpec', '');
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
    });

    it('should return PowerShell configuration by default', () => {
      const config = getShellConfiguration();
      expect(config.executable).toBe('powershell.exe');
      expect(config.argsPrefix).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      expect(config.shell).toBe('powershell');
    });

    it.skipIf(!isWindowsRuntime)(
      'should prefer pwsh.exe over powershell.exe when pwsh is available in PATH',
      () => {
        const pwshDir = path.resolve('C:\\Program Files\\PowerShell\\7');
        const pwshPath = path.join(pwshDir, 'pwsh.exe');
        vi.stubEnv('PATH', pwshDir);
        mockAccessSync.mockImplementation((p: string) => {
          if (p === pwshPath) return;
          throw new Error('ENOENT');
        });
        const config = getShellConfiguration();
        expect(config.executable).toBe(pwshPath);
        expect(config.argsPrefix).toEqual([
          '-NoProfile',
          '-NonInteractive',
          '-Command',
        ]);
        expect(config.shell).toBe('powershell');
      },
    );

    it('should ignore ComSpec when pointing to cmd.exe', () => {
      vi.stubEnv('ComSpec', 'C:\\WINDOWS\\system32\\cmd.exe');
      const config = getShellConfiguration();
      expect(config.executable).toBe('powershell.exe');
      expect(config.argsPrefix).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to powershell.exe', () => {
      const psPath =
        'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      vi.stubEnv('ComSpec', psPath);
      const config = getShellConfiguration();
      expect(config.executable).toBe(psPath);
      expect(config.argsPrefix).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      expect(config.shell).toBe('powershell');
    });

    it('should return PowerShell configuration if ComSpec points to pwsh.exe', () => {
      const pwshPath = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
      vi.stubEnv('ComSpec', pwshPath);
      const config = getShellConfiguration();
      expect(config.executable).toBe(pwshPath);
      expect(config.argsPrefix).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      expect(config.shell).toBe('powershell');
    });

    it('should be case-insensitive when checking ComSpec', () => {
      vi.stubEnv('ComSpec', 'C:\\Path\\To\\POWERSHELL.EXE');
      const config = getShellConfiguration();
      expect(config.executable).toBe('C:\\Path\\To\\POWERSHELL.EXE');
      expect(config.argsPrefix).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      expect(config.shell).toBe('powershell');
    });
  });
});

describe('hasRedirection (PowerShell via mock)', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    process.env['ComSpec'] = 'powershell.exe';
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
    mockAccessSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return the absolute path if it exists and is executable', () => {
    const absPath = path.resolve('/usr/bin/git');
    mockAccessSync.mockImplementation(() => undefined);
    expect(resolveExecutable(absPath)).toBe(absPath);
    expect(mockAccessSync).toHaveBeenCalledWith(absPath, 1);
  });

  it('should return undefined for absolute path if it does not exist', () => {
    const absPath = path.resolve('/usr/bin/nonexistent');
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(resolveExecutable(absPath)).toBeUndefined();
  });

  it('should resolve executable in PATH', () => {
    const binDir = path.resolve('/bin');
    const usrBinDir = path.resolve('/usr/bin');
    vi.stubEnv('PATH', `${binDir}${path.delimiter}${usrBinDir}`);
    mockPlatform.mockReturnValue('linux');

    const targetPath = path.join(usrBinDir, 'ls');
    mockAccessSync.mockImplementation((p: string) => {
      if (p === targetPath) return undefined;
      throw new Error('ENOENT');
    });

    expect(resolveExecutable('ls')).toBe(targetPath);
  });

  it('should try extensions on Windows', () => {
    const sys32 = path.resolve('C:\\Windows\\System32');
    vi.stubEnv('PATH', sys32);
    mockPlatform.mockReturnValue('win32');
    mockAccessSync.mockImplementation((p: string) => {
      if (p.includes('cmd.exe')) return undefined;
      throw new Error('ENOENT');
    });

    expect(resolveExecutable('cmd')).toContain('cmd.exe');
  });

  it('should return undefined if not found in PATH', () => {
    vi.stubEnv('PATH', path.resolve('/bin'));
    mockPlatform.mockReturnValue('linux');
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(resolveExecutable('unknown')).toBeUndefined();
  });

  it('should return undefined if PATH is unset', () => {
    vi.stubEnv('PATH', '');
    mockPlatform.mockReturnValue('linux');

    expect(resolveExecutable('anything')).toBeUndefined();
  });
});

describe('detectCommandSubstitution (PowerShell)', () => {
  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    vi.stubEnv('ComSpec', 'powershell.exe');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should allow PowerShell instance and static method calls', () => {
    expect(detectCommandSubstitution('$str.Trim()')).toBe(false);
    expect(
      detectCommandSubstitution("[System.IO.Path]::GetFullPath('foo')"),
    ).toBe(false);
    expect(
      detectCommandSubstitution(
        "Get-ChildItem | Where-Object { $_.Name.EndsWith('.ts') }",
      ),
    ).toBe(false);
    expect(detectCommandSubstitution('$arr[0].ToString()')).toBe(false);
  });

  it('should allow PowerShell conditionals, compound boolean parens, and param blocks', () => {
    expect(
      detectCommandSubstitution(
        'if (($a -eq 1) -and ($b -eq 2)) { Write-Host ok }',
      ),
    ).toBe(false);
    expect(detectCommandSubstitution('if (-not ($x)) { Write-Host ok }')).toBe(
      false,
    );
    expect(detectCommandSubstitution('while (($i -lt 10)) { $i++ }')).toBe(
      false,
    );
    expect(
      detectCommandSubstitution('for ($i = 0; $i -lt 10; $i++) { $i }'),
    ).toBe(false);
    expect(
      detectCommandSubstitution('& { param($x, [string]$y) Write-Host $x }'),
    ).toBe(false);
    expect(
      detectCommandSubstitution(
        'function Test-Helper($x, [int]$y) { $x + $y }',
      ),
    ).toBe(false);
  });

  it('should allow Windows paths with parens, braced variables, comments, and here-strings without substitution', () => {
    expect(
      detectCommandSubstitution('dir "C:\\Program Files (x86)\\Git"'),
    ).toBe(false);
    expect(
      detectCommandSubstitution("dir 'C:\\Program Files (x86)\\Git'"),
    ).toBe(false);
    expect(detectCommandSubstitution('echo ${env:ProgramFiles(x86)}')).toBe(
      false,
    );
    expect(detectCommandSubstitution("git status # don't fail (check)")).toBe(
      false,
    );
    expect(
      detectCommandSubstitution('git status <# block (comment) $(safe) #>'),
    ).toBe(false);
    expect(detectCommandSubstitution('echo "hello ""(world)"""')).toBe(false);
    expect(detectCommandSubstitution("echo 'hello ''$(safe)'''")).toBe(false);
    expect(detectCommandSubstitution("@'\n$(not_expanded)\n(safe)\n'@")).toBe(
      false,
    );
    expect(detectCommandSubstitution('@"\nplain (parens) text\n"@')).toBe(
      false,
    );
    expect(detectCommandSubstitution('$sum = ($a + $b) * 2')).toBe(false);
  });

  it('should detect genuine PowerShell command substitutions and security edge cases', () => {
    expect(detectCommandSubstitution('echo $(whoami)')).toBe(true);
    expect(detectCommandSubstitution('echo "$(whoami)"')).toBe(true);
    expect(detectCommandSubstitution('@"\n$(whoami)\n"@')).toBe(true);
    expect(detectCommandSubstitution('echo @(whoami)')).toBe(true);
    expect(detectCommandSubstitution('echo (whoami)')).toBe(true);
    expect(detectCommandSubstitution('cmd.exe(whoami)')).toBe(true);
    expect(detectCommandSubstitution("$str.Replace((whoami), 'a')")).toBe(true);
    expect(detectCommandSubstitution('echo ($a | Invoke-Expression)')).toBe(
      true,
    );
    // In PowerShell, backslash does not escape quotes, so \" closes the string!
    expect(detectCommandSubstitution('echo "foo\\" @(whoami)"')).toBe(true);
    expect(detectCommandSubstitution('echo "foo\\" (whoami)"')).toBe(true);
    expect(detectCommandSubstitution('echo "\\$(whoami)"')).toBe(true);
    expect(detectCommandSubstitution("# don't\necho $(whoami)")).toBe(true);
    // Security hardening: assignments in parens, scriptblock .Invoke(), mid-token here-strings/comments, CR newlines, Unicode quotes
    expect(detectCommandSubstitution('echo ($x = whoami)')).toBe(true);
    expect(detectCommandSubstitution('if ($x = (whoami)) { }')).toBe(true);
    expect(detectCommandSubstitution('echo ((whoami))')).toBe(true);
    expect(detectCommandSubstitution('{ whoami }.Invoke()')).toBe(true);
    expect(detectCommandSubstitution('echo foo@"\n$(whoami)\n"@')).toBe(true);
    expect(detectCommandSubstitution("echo foo@'\n'$(whoami)\n'@")).toBe(true);
    expect(detectCommandSubstitution('echo foo<# $(whoami) #>')).toBe(true);
    expect(detectCommandSubstitution("@'\n'@; $(whoami)")).toBe(true);
    expect(detectCommandSubstitution("@'\n\r'@; $(whoami)")).toBe(true);
    expect(detectCommandSubstitution("echo 'hello\u2019 $(whoami) '")).toBe(
      true,
    );
    expect(detectCommandSubstitution('echo \u201c$(whoami)\u201d')).toBe(true);
    // Parameter defaults, assignments in conditions, pipelines in conditions, and comment-spoofed parens executing commands
    expect(detectCommandSubstitution('if ($a | (whoami)) { }')).toBe(true);
    expect(
      detectCommandSubstitution('for ($i = (whoami); $i -lt 1; $i++) { }'),
    ).toBe(true);
    expect(detectCommandSubstitution('& { param($x = (whoami)) }')).toBe(true);
    expect(detectCommandSubstitution('echo ($a <# ) #> ; whoami)')).toBe(true);
    expect(detectCommandSubstitution('if foo (whoami) { }')).toBe(true);
    expect(
      detectCommandSubstitution(
        stripShellWrapper('powershell -Command "echo \'$(whoami)\'"'),
      ),
    ).toBe(true);
    expect(
      detectCommandSubstitution(
        stripShellWrapper('powershell -Command "echo `$(whoami)"'),
      ),
    ).toBe(true);
    expect(
      detectCommandSubstitution(
        stripShellWrapper('powershell -Command "echo ``$(whoami)"'),
      ),
    ).toBe(true);
  });

  it('should run in linear time without ReDoS on large adversarial inputs', () => {
    const start = performance.now();
    expect(
      detectCommandSubstitution('('.repeat(25_000) + '$a' + ')'.repeat(25_000)),
    ).toBe(false);
    expect(
      detectCommandSubstitution(
        '($a + '.repeat(10_000) + '$b' + ')'.repeat(10_000),
      ),
    ).toBe(false);
    expect(detectCommandSubstitution(';if a'.repeat(10_000) + '(')).toBe(true);
    expect(detectCommandSubstitution('$a.b'.repeat(10_000) + '()')).toBe(false);
    expect(
      stripShellWrapper(
        'powershell.exe ' + '-NoProfile '.repeat(5_000) + 'git status',
      ),
    ).toContain('git status');
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
