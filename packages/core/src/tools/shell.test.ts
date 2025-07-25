/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, vi, beforeEach } from 'vitest';
import { ShellTool } from './shell.js';
import { Config } from '../config/config.js';
import * as summarizer from '../utils/summarizer.js';
import { GeminiClient } from '../core/client.js';

describe('ShellTool', () => {
  let shellTool: ShellTool;
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
    } as unknown as Config;
    shellTool = new ShellTool(config);
  });

  it('should allow a command if no restrictions are provided', async () => {
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the allowed list', async () => {
    config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in the allowed list', async () => {
    config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in both the allowed and blocked lists', async () => {
    config = {
      getCoreTools: () => ['ShellTool(rm -rf /)'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('should block any command when ShellTool is in excludeTools without specific commands', async () => {
    config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['ShellTool'],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in the blocked list using the public-facing name', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_shell_command(rm -rf /)'],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(' rm  -rf  / ');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('any command');
    expect(result.allowed).toBe(true);
  });

  it('should block a command on the blocklist even with a wildcard allow', async () => {
    config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('should allow a command that starts with an allowed command prefix using the public-facing name', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed(
      'gh issue edit 1 --add-label "kind/feature"',
    );
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that starts with an allowed command prefix but is chained with another command', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue edit)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue edit&&rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue');
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a pipe', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list | rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list; rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('git push');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ECHO "hello"');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('ls -l  ;  rm -rf /');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" && ls -l');
    expect(result.allowed).toBe(true);
  });

  it('should block a command with command substitution using backticks', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(echo)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo `rm -rf /`');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo $(rm -rf /)');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('diff <(ls) <(ls -a)');
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
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('echo "hello" > file.txt');
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with a double pipe', async () => {
    config = {
      getCoreTools: () => ['run_shell_command(gh issue list)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
    const result = shellTool.isCommandAllowed('gh issue list || rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Command 'rm -rf /' is not in the allowed commands list",
    );
  });
});

describe('ShellTool Bug Reproduction', () => {
  let shellTool: ShellTool;
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({
        [shellTool.name]: {},
      }),
    } as unknown as Config;
    shellTool = new ShellTool(config);
  });

  it('should not let the summarizer override the return display', async () => {
    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    const result = await shellTool.execute(
      { command: 'echo "hello"' },
      abortSignal,
      () => {},
    );

    expect(result.returnDisplay).toBe('hello\n');
    expect(result.llmContent).toBe('summarized output');
    expect(summarizeSpy).toHaveBeenCalled();
  });

  it('should not call summarizer if disabled in config', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({}),
    } as unknown as Config;
    shellTool = new ShellTool(config);

    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    const result = await shellTool.execute(
      { command: 'echo "hello"' },
      abortSignal,
      () => {},
    );

    expect(result.returnDisplay).toBe('hello\n');
    expect(result.llmContent).not.toBe('summarized output');
    expect(summarizeSpy).not.toHaveBeenCalled();
  });

  it('should pass token budget to summarizer', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({
        [shellTool.name]: { tokenBudget: 1000 },
      }),
    } as unknown as Config;
    shellTool = new ShellTool(config);

    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    await shellTool.execute({ command: 'echo "hello"' }, abortSignal, () => {});

    expect(summarizeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      1000,
    );
  });

  it('should use default token budget if not specified', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({
        [shellTool.name]: {},
      }),
    } as unknown as Config;
    shellTool = new ShellTool(config);

    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    await shellTool.execute({ command: 'echo "hello"' }, abortSignal, () => {});

    expect(summarizeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      undefined,
    );
  });

  it('should pass GEMINI_CLI environment variable to executed commands', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({}),
    } as unknown as Config;
    shellTool = new ShellTool(config);

    const abortSignal = new AbortController().signal;
    const result = await shellTool.execute(
      { command: 'echo "$GEMINI_CLI"' },
      abortSignal,
      () => {},
    );

    expect(result.returnDisplay).toBe('1\n');
  });
});

describe('getCommandRoots', () => {
  it('should return a single command', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('ls -l');
    expect(result).toEqual(['ls']);
  });

  it('should return multiple commands', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('ls -l | grep "test"');
    expect(result).toEqual(['ls', 'grep']);
  });

  it('should handle multiple commands with &&', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('npm run build && npm test');
    expect(result).toEqual(['npm', 'npm']);
  });

  it('should handle multiple commands with ;', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('echo "hello"; echo "world"');
    expect(result).toEqual(['echo', 'echo']);
  });

  it('should handle a mix of operators', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots(
      'cat package.json | grep "version" && echo "done"',
    );
    expect(result).toEqual(['cat', 'grep', 'echo']);
  });

  it('should handle commands with paths', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('/usr/local/bin/node script.js');
    expect(result).toEqual(['node']);
  });

  it('should return an empty array for an empty string', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('');
    expect(result).toEqual([]);
  });
});

describe('stripShellWrapper', () => {
  it('should strip sh -c from the beginning of the command', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('sh -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should strip bash -c from the beginning of the command', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('bash -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should strip zsh -c from the beginning of the command', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('zsh -c "ls -l"');
    expect(result).toEqual('ls -l');
  });

  it('should not strip anything if the command does not start with a shell wrapper', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('ls -l');
    expect(result).toEqual('ls -l');
  });

  it('should handle extra whitespace', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('  sh   -c   "ls -l"  ');
    expect(result).toEqual('ls -l');
  });

  it('should handle commands without quotes', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('sh -c ls -l');
    expect(result).toEqual('ls -l');
  });

  it('should strip cmd.exe /c from the beginning of the command', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.stripShellWrapper('cmd.exe /c "dir"');
    expect(result).toEqual('dir');
  });
});

describe('getCommandRoots', () => {
  it('should handle multiple commands with &', () => {
    const shellTool = new ShellTool({} as Config);
    const result = shellTool.getCommandRoots('echo "hello" & echo "world"');
    expect(result).toEqual(['echo', 'echo']);
  });
});

import { ToolExecuteConfirmationDetails } from './tools.js';
describe('shouldConfirmExecute', () => {
  it('should de-duplicate command roots before asking for confirmation', async () => {
    const shellTool = new ShellTool({
      getCoreTools: () => ['run_shell_command'],
      getExcludeTools: () => [],
    } as unknown as Config);
    const result = (await shellTool.shouldConfirmExecute(
      {
        command: 'git status && git log',
      },
      new AbortController().signal,
    )) as ToolExecuteConfirmationDetails;
    expect(result.rootCommand).toEqual('git');
  });
});

describe('ShellTool command substitution', () => {
  let shellTool: ShellTool;

  beforeEach(() => {
    const config = {
      getCoreTools: () => ['run_shell_command(echo)', 'run_shell_command(gh)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    shellTool = new ShellTool(config);
  });

  it('should block unquoted command substitution `$(...)`', () => {
    const result = shellTool.isCommandAllowed('echo $(pwd)');
    expect(result.allowed).toBe(false);
  });

  it('should block unquoted command substitution `<(...)`', () => {
    const result = shellTool.isCommandAllowed('echo <(pwd)');
    expect(result.allowed).toBe(false);
  });

  it('should allow command substitution in single quotes', () => {
    const result = shellTool.isCommandAllowed("echo '$(pwd)'");
    expect(result.allowed).toBe(true);
  });

  it('should allow backticks in single quotes', () => {
    const result = shellTool.isCommandAllowed("echo '`rm -rf /`'");
    expect(result.allowed).toBe(true);
  });

  it('should block command substitution in double quotes', () => {
    const result = shellTool.isCommandAllowed('echo "$(pwd)"');
    expect(result.allowed).toBe(false);
  });

  it('should allow escaped command substitution', () => {
    const result = shellTool.isCommandAllowed('echo \\$(pwd)');
    expect(result.allowed).toBe(true);
  });

  it('should allow complex commands with quoted substitution-like patterns', () => {
    const command =
      "gh pr comment 4795 --body 'This is a test comment with $(pwd) style text'";
    const result = shellTool.isCommandAllowed(command);
    expect(result.allowed).toBe(true);
  });

  it('should block complex commands with unquoted substitution-like patterns', () => {
    const command =
      'gh pr comment 4795 --body "This is a test comment with $(pwd) style text"';
    const result = shellTool.isCommandAllowed(command);
    expect(result.allowed).toBe(false);
  });

  it('should allow a command with markdown content using proper quoting', () => {
    // Simple test with safe content in single quotes
    const result = shellTool.isCommandAllowed(
      "gh pr comment 4795 --body 'This is safe markdown content'",
    );
    expect(result.allowed).toBe(true);
  });
});

describe('getCommandRoots with quote handling', () => {
  let shellTool: ShellTool;

  beforeEach(() => {
    shellTool = new ShellTool({} as Config);
  });

  it('should correctly parse a simple command', () => {
    const result = shellTool.getCommandRoots('git status');
    expect(result).toEqual(['git']);
  });

  it('should correctly parse a command with a quoted argument', () => {
    const result = shellTool.getCommandRoots(
      'git commit -m "feat: new feature"',
    );
    expect(result).toEqual(['git']);
  });

  it('should correctly parse a command with single quotes', () => {
    const result = shellTool.getCommandRoots("echo 'hello world'");
    expect(result).toEqual(['echo']);
  });

  it('should correctly parse a chained command with quotes', () => {
    const result = shellTool.getCommandRoots('echo "hello" && git status');
    expect(result).toEqual(['echo', 'git']);
  });

  it('should correctly parse a complex chained command', () => {
    const result = shellTool.getCommandRoots(
      'git commit -m "feat: new feature" && echo "done"',
    );
    expect(result).toEqual(['git', 'echo']);
  });

  it('should handle escaped quotes', () => {
    const result = shellTool.getCommandRoots('echo "this is a \\"quote\\""');
    expect(result).toEqual(['echo']);
  });

  it('should handle commands with no spaces', () => {
    const result = shellTool.getCommandRoots('command');
    expect(result).toEqual(['command']);
  });

  it('should handle multiple separators', () => {
    const result = shellTool.getCommandRoots('a;b|c&&d||e&f');
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
