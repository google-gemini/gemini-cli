/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, vi } from 'vitest';
import { ShellTool } from './shell.js';
import { Config } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';

describe('ShellTool', () => {
  describe('existing tests', () => {
    it('should allow a command if no restrictions are provided', async () => {
      const config = {
        getCoreTools: () => undefined,
        getExcludeTools: () => undefined,
      } as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('ls -l');
      expect(isAllowed).toBe(true);
    });

    it('should allow a command if it is in the allowed list', async () => {
      const config = {
        getCoreTools: () => ['ShellTool(ls -l)'],
        getExcludeTools: () => undefined,
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('ls -l');
      expect(isAllowed).toBe(true);
    });

    it('should block a command if it is not in the allowed list', async () => {
      const config = {
        getCoreTools: () => ['ShellTool(ls -l)'],
        getExcludeTools: () => undefined,
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('rm -rf /');
      expect(isAllowed).toBe(false);
    });

    it('should block a command if it is in the blocked list', async () => {
      const config = {
        getCoreTools: () => undefined,
        getExcludeTools: () => ['ShellTool(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('rm -rf /');
      expect(isAllowed).toBe(false);
    });

    it('should allow a command if it is not in the blocked list', async () => {
      const config = {
        getCoreTools: () => undefined,
        getExcludeTools: () => ['ShellTool(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('ls -l');
      expect(isAllowed).toBe(true);
    });

    it('should block a command if it is in both the allowed and blocked lists', async () => {
      const config = {
        getCoreTools: () => ['ShellTool(rm -rf /)'],
        getExcludeTools: () => ['ShellTool(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('rm -rf /');
      expect(isAllowed).toBe(false);
    });

    it('should allow any command when ShellTool is in coreTools without specific commands', async () => {
      const config = {
        getCoreTools: () => ['ShellTool'],
        getExcludeTools: () => [],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(true);
    });

    it('should block any command when ShellTool is in excludeTools without specific commands', async () => {
      const config = {
        getCoreTools: () => [],
        getExcludeTools: () => ['ShellTool'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(false);
    });

    it('should allow a command if it is in the allowed list using the public-facing name', async () => {
      const config = {
        getCoreTools: () => ['run_shell_command(ls -l)'],
        getExcludeTools: () => undefined,
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('ls -l');
      expect(isAllowed).toBe(true);
    });

    it('should block a command if it is in the blocked list using the public-facing name', async () => {
      const config = {
        getCoreTools: () => undefined,
        getExcludeTools: () => ['run_shell_command(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('rm -rf /');
      expect(isAllowed).toBe(false);
    });

    it('should block any command when ShellTool is in excludeTools using the public-facing name', async () => {
      const config = {
        getCoreTools: () => [],
        getExcludeTools: () => ['run_shell_command'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(false);
    });

    it('should block any command if coreTools contains an empty ShellTool command list using the public-facing name', async () => {
      const config = {
        getCoreTools: () => ['run_shell_command()'],
        getExcludeTools: () => [],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(false);
    });

    it('should block any command if coreTools contains an empty ShellTool command list', async () => {
      const config = {
        getCoreTools: () => ['ShellTool()'],
        getExcludeTools: () => [],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(false);
    });

    it('should block a command with extra whitespace if it is in the blocked list', async () => {
      const config = {
        getCoreTools: () => undefined,
        getExcludeTools: () => ['ShellTool(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed(' rm  -rf  / ');
      expect(isAllowed).toBe(false);
    });

    it('should allow any command when ShellTool is present with specific commands', async () => {
      const config = {
        getCoreTools: () => ['ShellTool', 'ShellTool(ls)'],
        getExcludeTools: () => [],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('any command');
      expect(isAllowed).toBe(true);
    });

    it('should block a command on the blocklist even with a wildcard allow', async () => {
      const config = {
        getCoreTools: () => ['ShellTool'],
        getExcludeTools: () => ['ShellTool(rm -rf /)'],
      } as unknown as Config;
      const shellTool = new ShellTool(config);
      const isAllowed = shellTool.isCommandAllowed('rm -rf /');
      expect(isAllowed).toBe(false);
    });
  });

  describe('allowCommands pattern matching', () => {
    let config: Config;
    let shellTool: ShellTool;

    beforeEach(() => {
      config = {
        getAllowCommands: vi.fn(),
        getDenyCommands: vi.fn(),
        getTargetDir: () => '/test/dir',
        getDebugMode: () => false,
        getCoreTools: () => undefined,
        getExcludeTools: () => undefined,
      } as unknown as Config;

      // Default mock returns
      vi.mocked(config.getDenyCommands).mockReturnValue(undefined);

      shellTool = new ShellTool(config);
    });

    describe('matchesAllowPattern', () => {
      describe('exact match', () => {
        it('should match exact command', () => {
          expect(shellTool.matchesAllowPattern('ls', 'ls')).toBe(true);
          expect(shellTool.matchesAllowPattern('ls', 'pwd')).toBe(false);
        });

        it('should be case sensitive', () => {
          expect(shellTool.matchesAllowPattern('LS', 'ls')).toBe(false);
          expect(shellTool.matchesAllowPattern('ls', 'LS')).toBe(false);
        });
      });

      describe('glob patterns', () => {
        it('should match with * wildcard', () => {
          expect(shellTool.matchesAllowPattern('git', 'git*')).toBe(true);
          expect(shellTool.matchesAllowPattern('gitk', 'git*')).toBe(true);
          expect(shellTool.matchesAllowPattern('github', 'git*')).toBe(true);
          expect(shellTool.matchesAllowPattern('sgit', 'git*')).toBe(false);
        });

        it('should match with ? wildcard', () => {
          expect(shellTool.matchesAllowPattern('ls', 'l?')).toBe(true);
          expect(shellTool.matchesAllowPattern('ll', 'l?')).toBe(true);
          expect(shellTool.matchesAllowPattern('lss', 'l?')).toBe(false);
          expect(shellTool.matchesAllowPattern('l', 'l?')).toBe(false);
        });

        it('should match complex glob patterns', () => {
          expect(shellTool.matchesAllowPattern('test.js', '*.js')).toBe(true);
          expect(shellTool.matchesAllowPattern('test.ts', '*.js')).toBe(false);
          expect(shellTool.matchesAllowPattern('npm', 'n?m')).toBe(true);
          expect(shellTool.matchesAllowPattern('n2m', 'n?m')).toBe(true);
        });

        it('should escape special regex characters in glob', () => {
          expect(shellTool.matchesAllowPattern('a.b', 'a.b')).toBe(true);
          expect(shellTool.matchesAllowPattern('aXb', 'a.b')).toBe(false);
          expect(shellTool.matchesAllowPattern('a+b', 'a+b')).toBe(true);
          expect(shellTool.matchesAllowPattern('a++b', 'a+b')).toBe(false);
        });
      });

      describe('regex patterns', () => {
        it('should match valid regex patterns', () => {
          expect(shellTool.matchesAllowPattern('ls', '/^ls$/')).toBe(true);
          expect(shellTool.matchesAllowPattern('ls', '/ls/')).toBe(true);
          expect(shellTool.matchesAllowPattern('lsof', '/^ls/')).toBe(true);
          expect(shellTool.matchesAllowPattern('ls', '/^lsof$/')).toBe(false);
        });

        it('should match complex regex patterns', () => {
          expect(
            shellTool.matchesAllowPattern(
              'npm test',
              '/^npm\\s+(test|install)$/',
            ),
          ).toBe(true);
          expect(
            shellTool.matchesAllowPattern(
              'npm install',
              '/^npm\\s+(test|install)$/',
            ),
          ).toBe(true);
          expect(
            shellTool.matchesAllowPattern(
              'npm run',
              '/^npm\\s+(test|install)$/',
            ),
          ).toBe(false);
        });

        it('should match make regex pattern', () => {
          // Test safe regex patterns
          const pattern = '/^make\\s+\\w+$/';
          expect(shellTool.matchesAllowPattern('make build', pattern)).toBe(
            true,
          );
          expect(shellTool.matchesAllowPattern('make test', pattern)).toBe(
            true,
          );
          expect(shellTool.matchesAllowPattern('make', pattern)).toBe(false);
          expect(shellTool.matchesAllowPattern('cmake build', pattern)).toBe(
            false,
          );
        });

        it('should handle invalid regex gracefully', () => {
          const warnSpy = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => {});
          expect(shellTool.matchesAllowPattern('ls', '/[/')).toBe(false);
          expect(warnSpy).toHaveBeenCalledWith(
            'Potentially unsafe regex pattern detected (ReDoS risk): /[/',
          );
          warnSpy.mockRestore();
        });

        it('should not treat non-regex patterns as regex', () => {
          expect(
            shellTool.matchesAllowPattern('/usr/bin/ls', '/usr/bin/ls'),
          ).toBe(true);
          expect(shellTool.matchesAllowPattern('test/path', 'test/path')).toBe(
            true,
          );
        });
      });

      describe('edge cases', () => {
        it('should handle empty strings', () => {
          expect(shellTool.matchesAllowPattern('', '')).toBe(true);
          expect(shellTool.matchesAllowPattern('ls', '')).toBe(false);
          expect(shellTool.matchesAllowPattern('', 'ls')).toBe(false);
        });

        it('should handle whitespace', () => {
          expect(
            shellTool.matchesAllowPattern('git status', 'git status'),
          ).toBe(true);
          expect(
            shellTool.matchesAllowPattern('git  status', 'git status'),
          ).toBe(false);
        });

        it('should do prefix matching for patterns with spaces', () => {
          expect(shellTool.matchesAllowPattern('rm -rf /', 'rm -rf')).toBe(
            true,
          );
          expect(shellTool.matchesAllowPattern('rm -rf /tmp', 'rm -rf')).toBe(
            true,
          );
          expect(
            shellTool.matchesAllowPattern('git push --force', 'git push'),
          ).toBe(true);
          expect(shellTool.matchesAllowPattern('git pull', 'git push')).toBe(
            false,
          );
        });

        it('should handle special characters', () => {
          expect(shellTool.matchesAllowPattern('git-flow', 'git-flow')).toBe(
            true,
          );
          expect(
            shellTool.matchesAllowPattern('npm@latest', 'npm@latest'),
          ).toBe(true);
          expect(
            shellTool.matchesAllowPattern('test_command', 'test_command'),
          ).toBe(true);
        });
      });

      describe('getCommandToMatch', () => {
        it('should return full command for patterns with spaces', () => {
          expect(
            shellTool['getCommandToMatch']('git push --force', 'git push'),
          ).toBe('git push --force');
          expect(shellTool['getCommandToMatch']('rm -rf /', 'rm -rf')).toBe(
            'rm -rf /',
          );
          expect(
            shellTool['getCommandToMatch']('npm install --save', 'npm install'),
          ).toBe('npm install --save');
        });

        it('should return full command for regex patterns', () => {
          expect(shellTool['getCommandToMatch']('git status', '/^git.*/')).toBe(
            'git status',
          );
          expect(
            shellTool['getCommandToMatch']('rm -rf /', '/^rm\\s+-rf/'),
          ).toBe('rm -rf /');
        });

        it('should return command root for single-word patterns', () => {
          expect(shellTool['getCommandToMatch']('git status', 'git')).toBe(
            'git',
          );
          expect(shellTool['getCommandToMatch']('rm -rf /', 'rm')).toBe('rm');
          expect(shellTool['getCommandToMatch']('/usr/bin/ls -la', 'ls')).toBe(
            'ls',
          );
        });

        it('should return command root for glob patterns without spaces', () => {
          expect(shellTool['getCommandToMatch']('git status', 'git*')).toBe(
            'git',
          );
          expect(shellTool['getCommandToMatch']('npm install', 'npm*')).toBe(
            'npm',
          );
          expect(shellTool['getCommandToMatch']('ls -la', 'l?')).toBe('ls');
        });
      });
    });

    describe('getCommandRoot', () => {
      it('should extract simple commands', () => {
        expect(shellTool.getCommandRoot('ls')).toBe('ls');
        expect(shellTool.getCommandRoot('pwd')).toBe('pwd');
        expect(shellTool.getCommandRoot('git')).toBe('git');
      });

      it('should extract command from paths', () => {
        expect(shellTool.getCommandRoot('/usr/bin/ls')).toBe('ls');
        expect(shellTool.getCommandRoot('/bin/bash')).toBe('bash');
        expect(shellTool.getCommandRoot('C:\\Windows\\System32\\cmd.exe')).toBe(
          'cmd.exe',
        );
      });

      it('should handle commands with arguments', () => {
        expect(shellTool.getCommandRoot('ls -la')).toBe('ls');
        expect(shellTool.getCommandRoot('git status')).toBe('git');
        expect(shellTool.getCommandRoot('npm install --save')).toBe('npm');
      });

      it('should handle complex command lines', () => {
        expect(shellTool.getCommandRoot('ls -la | grep test')).toBe('ls');
        expect(shellTool.getCommandRoot('git status && npm test')).toBe('git');
        expect(shellTool.getCommandRoot('echo "hello" ; pwd')).toBe('echo');
      });

      it('should handle grouping operators', () => {
        expect(shellTool.getCommandRoot('(ls -la)')).toBe('ls');
        expect(shellTool.getCommandRoot('{git status}')).toBe('git');
        expect(shellTool.getCommandRoot('(cd /tmp && ls)')).toBe('cd');
      });

      it('should handle edge cases', () => {
        expect(shellTool.getCommandRoot('')).toBe('');
        expect(shellTool.getCommandRoot('   ')).toBe('');
        expect(shellTool.getCommandRoot('|||')).toBe('');
        expect(shellTool.getCommandRoot('   ls   ')).toBe('ls');
      });
    });

    describe('shouldConfirmExecute with allowCommands', () => {
      it('should skip confirmation for allowed exact matches', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue(['ls', 'pwd']);

        const result = await shellTool.shouldConfirmExecute(
          { command: 'ls -la' },
          new AbortController().signal,
        );

        expect(result).toBe(false);
      });

      it('should skip confirmation for allowed glob patterns', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue(['git*', 'npm*']);

        let result = await shellTool.shouldConfirmExecute(
          { command: 'git status' },
          new AbortController().signal,
        );
        expect(result).toBe(false);

        result = await shellTool.shouldConfirmExecute(
          { command: 'npm install' },
          new AbortController().signal,
        );
        expect(result).toBe(false);
      });

      it('should skip confirmation for allowed regex patterns', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue([
          '/^make\\s+\\w+$/',
        ]);

        const result = await shellTool.shouldConfirmExecute(
          { command: 'make build' },
          new AbortController().signal,
        );

        expect(result).toBe(false);
      });

      it('should require confirmation for non-allowed commands', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue(['ls', 'pwd']);

        const result = await shellTool.shouldConfirmExecute(
          { command: 'rm -rf /' },
          new AbortController().signal,
        );

        expect(result).not.toBe(false);
        expect(result).toHaveProperty('type', 'exec');
        expect(result).toHaveProperty('command', 'rm -rf /');
      });

      it('should handle empty allowCommands', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue([]);

        const result = await shellTool.shouldConfirmExecute(
          { command: 'ls' },
          new AbortController().signal,
        );

        expect(result).not.toBe(false);
      });

      it('should handle undefined allowCommands', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue(undefined);

        const result = await shellTool.shouldConfirmExecute(
          { command: 'ls' },
          new AbortController().signal,
        );

        expect(result).not.toBe(false);
      });

      it('should properly match multi-word patterns', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue([
          'git status',
          'npm install',
          '/^make\\s+\\w+$/',
        ]);

        // Multi-word exact match should work
        let result = await shellTool.shouldConfirmExecute(
          { command: 'git status' },
          new AbortController().signal,
        );
        expect(result).toBe(false);

        // Multi-word pattern should match full command, not just root
        result = await shellTool.shouldConfirmExecute(
          { command: 'git push' },
          new AbortController().signal,
        );
        expect(result).not.toBe(false); // 'git push' doesn't match 'git status'

        // Multi-word with extra args will match as prefix
        result = await shellTool.shouldConfirmExecute(
          { command: 'npm install --save-dev' },
          new AbortController().signal,
        );
        expect(result).toBe(false); // 'npm install' pattern matches 'npm install --save-dev' as prefix

        // Regex pattern should match full command
        result = await shellTool.shouldConfirmExecute(
          { command: 'make test' },
          new AbortController().signal,
        );
        expect(result).toBe(false);
      });

      it('should check session whitelist after allowCommands', async () => {
        vi.mocked(config.getAllowCommands).mockReturnValue(['pwd']);

        // First execution of 'ls' should require confirmation
        let result = await shellTool.shouldConfirmExecute(
          { command: 'ls' },
          new AbortController().signal,
        );
        expect(result).not.toBe(false);

        // Simulate user approving 'ls' for the session
        if (result && typeof result === 'object' && 'onConfirm' in result) {
          await result.onConfirm(ToolConfirmationOutcome.ProceedAlways);
        }

        // Second execution should skip confirmation
        result = await shellTool.shouldConfirmExecute(
          { command: 'ls -la' },
          new AbortController().signal,
        );
        expect(result).toBe(false);
      });
    });

    describe('getWhitelist', () => {
      it('should return a copy of the whitelist', () => {
        const whitelist1 = shellTool.getWhitelist();
        const whitelist2 = shellTool.getWhitelist();

        expect(whitelist1).not.toBe(whitelist2); // Different instances
        expect(whitelist1).toEqual(whitelist2); // Same content
      });

      it('should not allow external modification', () => {
        const whitelist = shellTool.getWhitelist();
        whitelist.add('malicious');

        const newWhitelist = shellTool.getWhitelist();
        expect(newWhitelist.has('malicious')).toBe(false);
      });
    });
  });

  describe('denyCommands', () => {
    let config: Config;
    let shellTool: ShellTool;

    beforeEach(() => {
      config = {
        getAllowCommands: vi.fn(),
        getDenyCommands: vi.fn(),
        getTargetDir: () => '/test/dir',
        getDebugMode: () => false,
        getCoreTools: () => undefined,
        getExcludeTools: () => undefined,
      } as unknown as Config;
      shellTool = new ShellTool(config);
    });

    it('should require confirmation for commands matching deny patterns', async () => {
      vi.mocked(config.getDenyCommands).mockReturnValue([
        'rm',
        'del*',
        '/^sudo/',
      ]);
      vi.mocked(config.getAllowCommands).mockReturnValue(undefined);

      // Test exact match
      const result1 = await shellTool.shouldConfirmExecute(
        { command: 'rm -rf /' },
        new AbortController().signal,
      );
      expect(result1).not.toBe(false);
      expect(result1).toHaveProperty('title', 'Confirm Denied Command');

      // Test glob pattern
      const result2 = await shellTool.shouldConfirmExecute(
        { command: 'delete file.txt' },
        new AbortController().signal,
      );
      expect(result2).not.toBe(false);
      expect(result2).toHaveProperty('title', 'Confirm Denied Command');

      // Test regex pattern
      const result3 = await shellTool.shouldConfirmExecute(
        { command: 'sudo apt-get update' },
        new AbortController().signal,
      );
      expect(result3).not.toBe(false);
      expect(result3).toHaveProperty('title', 'Confirm Denied Command');
    });

    it('should check denyCommands before allowCommands', async () => {
      vi.mocked(config.getAllowCommands).mockReturnValue(['rm', 'git*']);
      vi.mocked(config.getDenyCommands).mockReturnValue([
        'rm -rf',
        'git push --force',
      ]);

      // rm is allowed
      const result1 = await shellTool.shouldConfirmExecute(
        { command: 'rm file.txt' },
        new AbortController().signal,
      );
      expect(result1).toBe(false); // rm is allowed

      // rm -rf / matches the deny pattern 'rm -rf' (patterns with spaces match full command)
      const result1b = await shellTool.shouldConfirmExecute(
        { command: 'rm -rf /' },
        new AbortController().signal,
      );
      expect(result1b).not.toBe(false);
      expect(result1b).toHaveProperty('title', 'Confirm Denied Command');

      // git is allowed with glob
      const result2 = await shellTool.shouldConfirmExecute(
        { command: 'git status' },
        new AbortController().signal,
      );
      expect(result2).toBe(false); // git is allowed by glob

      // git push --force matches deny pattern (patterns with spaces match full command)
      const result3 = await shellTool.shouldConfirmExecute(
        { command: 'git push --force' },
        new AbortController().signal,
      );
      expect(result3).not.toBe(false);
      expect(result3).toHaveProperty('title', 'Confirm Denied Command');
    });

    it('should handle empty denyCommands array', async () => {
      vi.mocked(config.getDenyCommands).mockReturnValue([]);
      vi.mocked(config.getAllowCommands).mockReturnValue(['ls']);

      const result = await shellTool.shouldConfirmExecute(
        { command: 'ls -la' },
        new AbortController().signal,
      );
      expect(result).toBe(false); // Should proceed to allowCommands check
    });

    it('should handle undefined denyCommands', async () => {
      vi.mocked(config.getDenyCommands).mockReturnValue(undefined);
      vi.mocked(config.getAllowCommands).mockReturnValue(['ls']);

      const result = await shellTool.shouldConfirmExecute(
        { command: 'ls -la' },
        new AbortController().signal,
      );
      expect(result).toBe(false); // Should proceed to allowCommands check
    });

    it('should add denied commands to whitelist if user confirms with always', async () => {
      vi.mocked(config.getDenyCommands).mockReturnValue(['rm']);
      vi.mocked(config.getAllowCommands).mockReturnValue(undefined);

      const confirmResult = await shellTool.shouldConfirmExecute(
        { command: 'rm file.txt' },
        new AbortController().signal,
      );

      expect(confirmResult).not.toBe(false);
      expect(confirmResult).toHaveProperty('onConfirm');

      // Simulate user confirming with "always"
      if (
        confirmResult &&
        'onConfirm' in confirmResult &&
        confirmResult.onConfirm
      ) {
        await confirmResult.onConfirm(ToolConfirmationOutcome.ProceedAlways);
      }

      // Check that rm is now whitelisted
      const whitelist = shellTool.getWhitelist();
      expect(whitelist.has('rm')).toBe(true);

      // Subsequent calls should still require confirmation since denyCommands is checked first
      const result2 = await shellTool.shouldConfirmExecute(
        { command: 'rm another.txt' },
        new AbortController().signal,
      );
      expect(result2).not.toBe(false);
      expect(result2).toHaveProperty('title', 'Confirm Denied Command');
    });

    it('should support complex deny patterns', async () => {
      vi.mocked(config.getDenyCommands).mockReturnValue([
        '/^rm\\s+-rf\\s+/', // regex: rm -rf commands (matches full command)
        'sudo*', // glob: any sudo command
        'chmod 777', // exact: specific chmod (pattern with space, matches as prefix)
        '*.sh', // glob: any .sh script
        'curl*--output*', // glob: curl with output flag
      ]);
      vi.mocked(config.getAllowCommands).mockReturnValue(undefined);

      // Test each pattern type
      const testCases = [
        { command: 'rm -rf /', shouldDeny: true }, // Regex pattern matches full command
        { command: 'sudo apt update', shouldDeny: true },
        { command: 'chmod 777 /etc/passwd', shouldDeny: true }, // Pattern with space matches as prefix
        { command: 'script.sh', shouldDeny: true },
        { command: 'curl-test', shouldDeny: false }, // 'curl-test' doesn't match 'curl*--output*'
      ];

      for (const testCase of testCases) {
        const result = await shellTool.shouldConfirmExecute(
          { command: testCase.command },
          new AbortController().signal,
        );

        if (testCase.shouldDeny) {
          expect(result).not.toBe(false);
          expect(result).toHaveProperty('title', 'Confirm Denied Command');
        } else {
          // May or may not require confirmation based on other rules
          // But should not have 'Confirm Denied Command' title
          if (result && typeof result !== 'boolean') {
            expect(result).toHaveProperty('title');
            expect((result as { title: string }).title).not.toBe(
              'Confirm Denied Command',
            );
          }
        }
      }
    });

    it('should work with allowCommands and denyCommands together', async () => {
      vi.mocked(config.getAllowCommands).mockReturnValue([
        'git*',
        'npm*',
        'ls',
      ]);
      vi.mocked(config.getDenyCommands).mockReturnValue([
        'git push --force',
        'npm publish',
        'sudo*',
      ]);

      // Allowed by glob pattern
      let result = await shellTool.shouldConfirmExecute(
        { command: 'git status' },
        new AbortController().signal,
      );
      expect(result).toBe(false);

      // Denied despite matching allow pattern (patterns with spaces match full command)
      result = await shellTool.shouldConfirmExecute(
        { command: 'git push --force' },
        new AbortController().signal,
      );
      expect(result).not.toBe(false); // Denied by 'git push --force' pattern
      expect(result).toHaveProperty('title', 'Confirm Denied Command');

      // Not in allow or deny list
      result = await shellTool.shouldConfirmExecute(
        { command: 'echo hello' },
        new AbortController().signal,
      );
      expect(result).not.toBe(false);
      expect(result).toHaveProperty('title', 'Confirm Shell Command');
    });
  });
});
