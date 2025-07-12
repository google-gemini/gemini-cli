/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { ShellTool } from './shell.js';
import { Config } from '../config/config.js';

describe('ShellTool', () => {
  it('should allow a command if no restrictions are provided', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
    } as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should block a command if it is in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a command if it is not in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in both the allowed and blocked lists', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(rm -rf /)'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow any command when ShellTool is in coreTools without specific commands', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('should block any command when ShellTool is in excludeTools without specific commands', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['ShellTool'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('should allow a command if it is in the allowed list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in the blocked list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_shell_command(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should block any command when ShellTool is in excludeTools using the public-facing name', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Shell tool is globally disabled in configuration',
    );
  });

  it('should block any command if coreTools contains an empty ShellTool command list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('should block any command if coreTools contains an empty ShellTool command list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'any command' is not in the allowed commands list",
    );
  });

  it('should block a command with extra whitespace if it is in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(' rm  -rf  / ');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow any command when ShellTool is present with specific commands', async () => {
    const config = {
      getCoreTools: () => ['ShellTool', 'ShellTool(ls)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('should block a command on the blocklist even with a wildcard allow', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a command that starts with an allowed command prefix', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('should allow a command that starts with an allowed command prefix using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that starts with an allowed command prefix but is chained with another command', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue edit&&rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is a prefix of an allowed command', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'gh issue' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is a prefix of a blocked command', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command(gh issue edit)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a pipe', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list | rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should not allow a command that is chained with a semicolon', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list; rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });

  it('should block a chained command if any part is blocked', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo "hello")'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should block a command if its prefix is on the blocklist, even if the command itself is on the allowlist', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(git push)'],
      getExcludeTools: () => ['run_shell_command(git)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('git push');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'git push' is blocked by configuration",
    );
  });

  it('should be case-sensitive in its matching', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ECHO "hello"');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command \'ECHO "hello"\' is not in the allowed commands list',
    );
  });

  it('should correctly handle commands with extra whitespace around chaining operators', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => ['run_shell_command(rm)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l  ;  rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is blocked by configuration",
    );
  });

  it('should allow a chained command if all parts are allowed', async () => {
    const config = {
      getCoreTools: () => [
        'run_shell_command(echo)',
        'run_shell_command(ls -l)',
      ],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should allow a command with command substitution using backticks', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo `rm -rf /`');
    expect(result.allowed).toBe(true);
  });

  it('should block a command with command substitution using $()', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo $(rm -rf /)');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $() is not allowed for security reasons',
    );
  });

  it('should allow a command with I/O redirection', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" > file.txt');
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a double pipe', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list || rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });
});
