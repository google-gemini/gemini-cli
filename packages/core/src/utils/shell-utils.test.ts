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
  hasRedirection,
} from './shell-utils.js';

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
