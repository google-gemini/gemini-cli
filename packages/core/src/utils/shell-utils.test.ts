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
