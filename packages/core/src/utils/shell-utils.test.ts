/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach } from 'vitest';
import {
  getCommandRoots,
  isCommandAllowed,
  stripShellWrapper,
} from './shell-utils.js';
import { Config } from '../config/config.js';

describe('isCommandAllowed', () => {
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
    } as unknown as Config;
  });

  it('should allow a command if no restrictions are provided', async () => {
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the allowed list', async () => {
    config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in the allowed list', async () => {
    config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should block a command if it is in the blocked list', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a command if it is not in the blocked list', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in both the allowed and blocked lists', async () => {
    config = {
      getCoreTools: () => ['ShellTool(rm -rf /)'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow any command when ShellTool is in coreTools without specific commands', async () => {
    config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(true);
  });

  it('should block any command when ShellTool is in excludeTools without specific commands', async () => {
    config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['ShellTool'],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('should allow a command if it is in the allowed list using the public-facing name', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const result = isCommandAllowed('ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in the blocked list using the public-facing name', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_shell_command(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should block any command when ShellTool is in excludeTools using the public-facing name', async () => {
    config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command'],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('should block any command if coreTools contains an empty ShellTool command list using the public-facing name', async () => {
    config = {
      getCoreTools: () => ['run_shell_command()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('should block any command if coreTools contains an empty ShellTool command list', async () => {
    config = {
      getCoreTools: () => ['ShellTool()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('should block a command with extra whitespace if it is in the blocked list', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed(' rm  -rf  / ', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow any command when ShellTool is in present with specific commands', async () => {
    config = {
      getCoreTools: () => ['ShellTool', 'ShellTool(ls)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('any command', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command on the blocklist even with a wildcard allow', async () => {
    config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const result = isCommandAllowed('rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a command that starts with an allowed command prefix', async () => {
    config = {
      getCoreTools: () => ['ShellTool(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
      config,
    );
    expect(result.allowed).toBe(true);
  });

  it('should allow a command that starts with an allowed command prefix using the public-facing name', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
      config,
    );
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that starts with an allowed command prefix but is chained with another command', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue edit&&rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is a prefix of an allowed command', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'gh issue' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is a prefix of a blocked command', async () => {
    config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command(gh issue edit)'],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue', config);
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a pipe', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue list | rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is chained with a semicolon', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue list; rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should block a chained command if any part is blocked', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo "hello")'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const result = isCommandAllowed('echo "hello" && rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should block a command if its prefix is on the blocklist, even if the command itself is on the allowlist', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(git push)'],
      getExcludeTools: () => ['run_shell_command(git)'],
    } as unknown as Config;
    const result = isCommandAllowed('git push', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'git push' is blocked by configuration",
    );
  });

  it('should be case-sensitive in its matching', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('ECHO "hello"', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command \'ECHO "hello"\' is not in the allowed commands list',
    );
  });

  it('should correctly handle commands with extra whitespace around chaining operators', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const result = isCommandAllowed('ls -l  ;  rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a chained command if all parts are allowed', async () => {
    config = {
      getCoreTools: () => [
        'run_shell_command(echo)',
        'run_shell_command(ls -l)',
      ],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('echo "hello" && ls -l', config);
    expect(result.allowed).toBe(true);
  });

  it('should block a command with command substitution using backticks', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('echo `rm -rf /`', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $(), <(), or >() is not allowed for security reasons',
    );
  });

  it('should block a command with command substitution using $()', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('echo $(rm -rf /)', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $(), <(), or >() is not allowed for security reasons',
    );
  });

  it('should block a command with process substitution using <()', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(diff)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('diff <(ls) <(ls -a)', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $(), <(), or >() is not allowed for security reasons',
    );
  });

  it('should allow a command with I/O redirection', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('echo "hello" > file.txt', config);
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a double pipe', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const result = isCommandAllowed('gh issue list || rm -rf /', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });
});

describe('getCommandRoots', () => {
  it('should return a single command', () => {
    const result = getCommandRoots('ls -l');
    expect(result).toEqual(['ls']);
  });

  it('should return multiple commands', () => {
    const result = getCommandRoots('ls -l | grep "test"');
    expect(result).toEqual(['ls', 'grep']);
  });

  it('should handle multiple commands with &&', () => {
    const result = getCommandRoots('npm run build && npm test');
    expect(result).toEqual(['npm', 'npm']);
  });

  it('should handle multiple commands with ;', () => {
    const result = getCommandRoots('echo "hello"; echo "world"');
    expect(result).toEqual(['echo', 'echo']);
  });

  it('should handle a mix of operators', () => {
    const result = getCommandRoots(
      'cat package.json | grep "version" && echo "done"',
    );
    expect(result).toEqual(['cat', 'grep', 'echo']);
  });

  it('should handle commands with paths', () => {
    const result = getCommandRoots('/usr/local/bin/node script.js');
    expect(result).toEqual(['node']);
  });

  it('should return an empty array for an empty string', () => {
    const result = getCommandRoots('');
    expect(result).toEqual([]);
  });
});

describe('stripShellWrapper', () => {
  it('should strip sh -c from the beginning of the command', () => {
    const result = stripShellWrapper('sh -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should strip bash -c from the beginning of the command', () => {
    const result = stripShellWrapper('bash -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should strip zsh -c from the beginning of the command', () => {
    const result = stripShellWrapper('zsh -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should not strip anything if the command does not start with a shell wrapper', () => {
    const result = stripShellWrapper('ls -l');
    expect(result).toEqual('ls -l');
  });

  it('should handle extra whitespace', () => {
    const result = stripShellWrapper('  sh   -c   "ls -l"  ');
    expect(result).toEqual('ls -l');
  });

  it('should handle commands without quotes', () => {
    const result = stripShellWrapper('sh -c ls -l');
    expect(result).toEqual('ls -l');
  });

  it('should strip cmd.exe /c from the beginning of the command', () => {
    const result = stripShellWrapper('cmd.exe /c "dir"');
    expect(result).toEqual('dir');
  });
});

describe('getCommandRoots', () => {
  it('should handle multiple commands with &', () => {
    const result = getCommandRoots('echo "hello" & echo "world"');
    expect(result).toEqual(['echo', 'echo']);
  });
});

describe('command substitution', () => {
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)', 'run_shell_command(gh)'],
      getExcludeTools: () => [],
    } as unknown as Config;
  });

  it('should block unquoted command substitution `$(...)`', () => {
    const result = isCommandAllowed('echo $(pwd)', config);
    expect(result.allowed).toBe(false);
  });

  it('should block unquoted command substitution `<(...)`', () => {
    const result = isCommandAllowed('echo <(pwd)', config);
    expect(result.allowed).toBe(false);
  });

  it('should allow command substitution in single quotes', () => {
    const result = isCommandAllowed("echo '$(pwd)'", config);
    expect(result.allowed).toBe(true);
  });

  it('should allow backticks in single quotes', () => {
    const result = isCommandAllowed("echo '`rm -rf /`'", config);
    expect(result.allowed).toBe(true);
  });

  it('should block command substitution in double quotes', () => {
    const result = isCommandAllowed('echo "$(pwd)"', config);
    expect(result.allowed).toBe(false);
  });

  it('should allow escaped command substitution', () => {
    const result = isCommandAllowed('echo \\$(pwd)', config);
    expect(result.allowed).toBe(true);
  });

  it('should allow complex commands with quoted substitution-like patterns', () => {
    const command =
      "gh pr comment 4795 --body 'This is a test comment with $(pwd) style text'";
    const result = isCommandAllowed(command, config);
    expect(result.allowed).toBe(true);
  });

  it('should block complex commands with unquoted substitution-like patterns', () => {
    const command =
      'gh pr comment 4795 --body "This is a test comment with $(pwd) style text"';
    const result = isCommandAllowed(command, config);
    expect(result.allowed).toBe(false);
  });

  it('should allow a command with markdown content using proper quoting', () => {
    // Simple test with safe content in single quotes
    const result = isCommandAllowed(
      "gh pr comment 4795 --body 'This is safe markdown content'",
      config,
    );
    expect(result.allowed).toBe(true);
  });
});

describe('getCommandRoots with quote handling', () => {
  it('should correctly parse a simple command', () => {
    const result = getCommandRoots('git status');
    expect(result).toEqual(['git']);
  });

  it('should correctly parse a command with a quoted argument', () => {
    const result = getCommandRoots('git commit -m "feat: new feature"');
    expect(result).toEqual(['git']);
  });

  it('should correctly parse a command with single quotes', () => {
    const result = getCommandRoots("echo 'hello world'");
    expect(result).toEqual(['echo']);
  });

  it('should correctly parse a chained command with quotes', () => {
    const result = getCommandRoots('echo "hello" && git status');
    expect(result).toEqual(['echo', 'git']);
  });

  it('should correctly parse a complex chained command', () => {
    const result = getCommandRoots(
      'git commit -m "feat: new feature" && echo "done"',
    );
    expect(result).toEqual(['git', 'echo']);
  });

  it('should handle escaped quotes', () => {
    const result = getCommandRoots('echo "this is a "quote""');
    expect(result).toEqual(['echo']);
  });

  it('should handle commands with no spaces', () => {
    const result = getCommandRoots('command');
    expect(result).toEqual(['command']);
  });

  it('should handle multiple separators', () => {
    const result = getCommandRoots('a;b|c&&d||e&f');
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
