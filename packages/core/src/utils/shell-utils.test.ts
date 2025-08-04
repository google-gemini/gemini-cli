/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach } from 'vitest';
import {
  checkCommandPermissions,
  getCommandRoots,
  isCommandAllowed,
  stripShellWrapper,
} from './shell-utils.js';
import { Config } from '../config/config.js';

let config: Config;

beforeEach(() => {
  config = {
    getCoreTools: () => [],
    getExcludeTools: () => [],
  } as unknown as Config;
});

describe('isCommandAllowed', () => {
  it('should allow a command if no restrictions are provided', () => {
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the global allowlist', () => {
    config.getCoreTools = () => ['ShellTool(ls)'];
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in a strict global allowlist', () => {
    config.getCoreTools = () => ['ShellTool(ls -l)'];
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(`Command(s) not in the allowed commands list.`);
  });

  it('should block a command if it is in the blocked list', () => {
    config.getExcludeTools = () => ['ShellTool(rm -rf /)'];
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'rm -rf /' is blocked by configuration`,
    );
  });

  it('should prioritize the blocklist over the allowlist', () => {
    config.getCoreTools = () => ['ShellTool(rm -rf /)'];
    config.getExcludeTools = () => ['ShellTool(rm -rf /)'];
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'rm -rf /' is blocked by configuration`,
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
    config.getExcludeTools = () => ['ShellTool(rm -rf /)'];
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'rm -rf /' is blocked by configuration`,
    );
  });

  it('should allow a chained command if all parts are on the global allowlist', () => {
    config.getCoreTools = () => [
      'run_shell_command(echo)',
      'run_shell_command(ls)',
    ];
    const result = isCommandAllowed('echo "hello" && ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a chained command if any part is blocked', () => {
    config.getExcludeTools = () => ['run_shell_command(rm)'];
    const result = isCommandAllowed('echo "hello" && rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      `Command 'rm -rf /' is blocked by configuration`,
    );
  });

  describe('command substitution', () => {
    it('should block command substitution using `$(...)`', () => {
      const result = isCommandAllowed('echo $(rm -rf /)', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Command substitution');
    });

    it('should block command substitution using `<(...)`', () => {
      const result = isCommandAllowed('diff <(ls) <(ls -a)', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Command substitution');
    });

    it('should block command substitution using backticks', () => {
      const result = isCommandAllowed('echo `rm -rf /`', config);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Command substitution');
    });

    it('should allow substitution-like patterns inside single quotes', () => {
      config.getCoreTools = () => ['ShellTool(echo)'];
      const result = isCommandAllowed("echo '$(pwd)'", config);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('checkCommandPermissions', () => {
  describe('in "Default Allow" mode (no sessionAllowlist)', () => {
    it('should return a detailed success object for an allowed command', () => {
      const result = checkCommandPermissions('ls -l', config);
      expect(result).toEqual({
        allAllowed: true,
        disallowedCommands: [],
      });
    });

    it('should return a detailed failure object for a blocked command', () => {
      config.getExcludeTools = () => ['ShellTool(rm)'];
      const result = checkCommandPermissions('rm -rf /', config);
      expect(result).toEqual({
        allAllowed: false,
        disallowedCommands: ['rm -rf /'],
        blockReason: `Command 'rm -rf /' is blocked by configuration`,
        isHardDenial: true,
      });
    });

    it('should return a detailed failure object for a command not on a strict allowlist', () => {
      config.getCoreTools = () => ['ShellTool(ls)'];
      const result = checkCommandPermissions('git status && ls', config);
      expect(result).toEqual({
        allAllowed: false,
        disallowedCommands: ['git status'],
        blockReason: `Command(s) not in the allowed commands list.`,
        isHardDenial: false,
      });
    });
  });

  describe('in "Default Deny" mode (with sessionAllowlist)', () => {
    it('should allow a command on the sessionAllowlist', () => {
      const result = checkCommandPermissions(
        'ls -l',
        config,
        new Set(['ls -l']),
      );
      expect(result.allAllowed).toBe(true);
    });

    it('should block a command not on the sessionAllowlist or global allowlist', () => {
      const result = checkCommandPermissions(
        'rm -rf /',
        config,
        new Set(['ls -l']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.blockReason).toContain(
        'not on the global or session allowlist',
      );
      expect(result.disallowedCommands).toEqual(['rm -rf /']);
    });

    it('should allow a command on the global allowlist even if not on the session allowlist', () => {
      config.getCoreTools = () => ['ShellTool(git status)'];
      const result = checkCommandPermissions(
        'git status',
        config,
        new Set(['ls -l']),
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
      config.getExcludeTools = () => ['run_shell_command(rm)'];
      const result = checkCommandPermissions(
        'rm -rf /',
        config,
        new Set(['rm -rf /']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.blockReason).toContain('is blocked by configuration');
    });

    it('should block a chained command if one part is not on any allowlist', () => {
      config.getCoreTools = () => ['run_shell_command(echo)'];
      const result = checkCommandPermissions(
        'echo "hello" && rm -rf /',
        config,
        new Set(['echo']),
      );
      expect(result.allAllowed).toBe(false);
      expect(result.disallowedCommands).toEqual(['rm -rf /']);
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

  it('should not strip anything if no wrapper is present', () => {
    expect(stripShellWrapper('ls -l')).toEqual('ls -l');
  });
});
